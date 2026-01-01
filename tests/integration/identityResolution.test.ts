/**
 * Integration tests for Identity Resolution
 *
 * Tests the core identity matching and resolution logic:
 * - Same email across providers → same customerId
 * - Missing Amazon email → address hash identity created
 * - Ambiguous email → returns isAmbiguous=true, does not link
 * - Idempotent rerun → does not create duplicates
 *
 * NOTE: These tests require a database connection.
 * Run with: npx jest tests/integration/identityResolution.test.ts --runInBand
 */

import { db, customers, customerIdentities } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { identityService, identityUtils, createSyncMetrics } from '@/services/crm/identityService';

// Skip if no DB connection available
const DB_AVAILABLE = !!process.env.DATABASE_URL;

// Test data prefix to isolate test data from production data
const TEST_PREFIX = `test_${Date.now()}_`;

// Helper to create unique test data
const testEmail = (suffix: string) => `${TEST_PREFIX}${suffix}@example.com`;
const testPhone = (suffix: string) => `+1555${Date.now().toString().slice(-7)}${suffix.charCodeAt(0)}`;
const testExternalId = (provider: string, suffix: string) => `${TEST_PREFIX}${provider}_${suffix}`;

describe('Identity Resolution Integration', () => {
  beforeAll(() => {
    if (!DB_AVAILABLE) {
      console.log('Skipping integration tests: DATABASE_URL not set');
    }
  });

  afterAll(async () => {
    if (!DB_AVAILABLE) return;

    // Clean up test data
    try {
      // Delete test identities first (foreign key constraint)
      await db.execute(sql`
        DELETE FROM ticketing_prod.customer_identities
        WHERE external_id LIKE ${TEST_PREFIX + '%'}
        OR email LIKE ${TEST_PREFIX + '%'}
      `);

      // Delete test customers
      await db.execute(sql`
        DELETE FROM ticketing_prod.customers
        WHERE primary_email LIKE ${TEST_PREFIX + '%'}
        OR first_name LIKE ${TEST_PREFIX + '%'}
      `);
    } catch (e) {
      console.warn('Cleanup failed:', e);
    }
  });

  describe('Cross-Provider Email Matching', () => {
    it('should resolve same customer when email matches across providers', async () => {
      if (!DB_AVAILABLE) return;

      const sharedEmail = testEmail('shared');

      // Create customer via QBO
      const qboResult = await identityService.upsertCustomerWithMetrics({
        provider: 'qbo',
        externalId: testExternalId('qbo', 'customer1'),
        email: sharedEmail,
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(qboResult.action).toBe('created');
      const qboCustomerId = qboResult.customerId;
      expect(qboCustomerId).toBeGreaterThan(0);

      // Resolve via Shopify with same email (no externalId match possible)
      const shopifyResult = await identityService.upsertCustomerWithMetrics({
        provider: 'shopify',
        externalId: testExternalId('shopify', 'customer1'),
        email: sharedEmail,
        firstName: 'John',
        lastName: 'Doe',
      });

      // Should match existing customer, not create new
      expect(shopifyResult.customerId).toBe(qboCustomerId);
      expect(shopifyResult.action).toBe('linked'); // New identity linked to existing customer

      // Verify only one customer exists with this email
      const customersWithEmail = await db.query.customers.findMany({
        where: eq(customers.primaryEmail, sharedEmail.toLowerCase()),
      });
      expect(customersWithEmail.length).toBe(1);

      // Verify both identities point to same customer
      const identities = await db.query.customerIdentities.findMany({
        where: eq(customerIdentities.customerId, qboCustomerId),
      });

      const providers = identities.map(i => i.provider);
      expect(providers).toContain('qbo');
      expect(providers).toContain('shopify');
    });
  });

  describe('Address Hash Fallback', () => {
    it('should create address hash identity when Amazon email is missing', async () => {
      if (!DB_AVAILABLE) return;

      const address = {
        name: `${TEST_PREFIX}Jane Smith`,
        address1: '123 Main St',
        address2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      };

      // Create customer without email (simulating Amazon restricted PII)
      const result = await identityService.upsertCustomerWithMetrics(
        {
          provider: 'amazon',
          externalId: testExternalId('amazon', 'order1'),
          firstName: 'Jane',
          lastName: 'Smith',
          // Note: no email
        },
        address
      );

      expect(result.action).toBe('created');
      expect(result.customerId).toBeGreaterThan(0);

      // Verify address hash identity was created
      const addressHash = identityUtils.computeAddressHash(address);
      expect(addressHash).not.toBeNull();

      const hashIdentity = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.customerId, result.customerId),
          eq(customerIdentities.externalId, `address_hash:${addressHash}`)
        ),
      });

      expect(hashIdentity).not.toBeNull();
      expect(hashIdentity?.provider).toBe('amazon');

      // Subsequent order with same address should match
      const result2 = await identityService.upsertCustomerWithMetrics(
        {
          provider: 'amazon',
          externalId: testExternalId('amazon', 'order2'),
          firstName: 'Jane',
          lastName: 'Smith',
        },
        address
      );

      expect(result2.customerId).toBe(result.customerId);
      expect(result2.action).toBe('linked'); // New order identity linked to same customer
    });

    it('should distinguish customers at same street address by apt/suite', async () => {
      if (!DB_AVAILABLE) return;

      const baseAddress = {
        name: `${TEST_PREFIX}Building Resident`,
        address1: '456 Commerce Blvd',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
      };

      // Customer in Apt A
      const addressAptA = { ...baseAddress, address2: 'Apt A' };
      const resultA = await identityService.upsertCustomerWithMetrics(
        {
          provider: 'amazon',
          externalId: testExternalId('amazon', 'aptA'),
          firstName: 'Alice',
        },
        addressAptA
      );

      // Customer in Apt B (same building, different unit)
      const addressAptB = { ...baseAddress, address2: 'Apt B' };
      const resultB = await identityService.upsertCustomerWithMetrics(
        {
          provider: 'amazon',
          externalId: testExternalId('amazon', 'aptB'),
          firstName: 'Bob',
        },
        addressAptB
      );

      // Should be different customers
      expect(resultA.customerId).not.toBe(resultB.customerId);

      // Verify different address hashes
      const hashA = identityUtils.computeAddressHash(addressAptA);
      const hashB = identityUtils.computeAddressHash(addressAptB);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('Ambiguous Match Detection', () => {
    it('should detect ambiguous email match and not link', async () => {
      if (!DB_AVAILABLE) return;

      const ambiguousEmail = testEmail('ambiguous');

      // Create two different customers manually with same email
      // (simulating data corruption or manual entry issues)
      const [customer1] = await db.insert(customers).values({
        primaryEmail: ambiguousEmail.toLowerCase(),
        firstName: `${TEST_PREFIX}Customer1`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      const [customer2] = await db.insert(customers).values({
        primaryEmail: ambiguousEmail.toLowerCase(),
        firstName: `${TEST_PREFIX}Customer2`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Try to resolve with this ambiguous email
      const result = await identityService.resolveCustomerAdvanced({
        provider: 'shopify',
        externalId: testExternalId('shopify', 'ambig1'),
        email: ambiguousEmail,
      });

      // Should detect ambiguity
      expect(result.isAmbiguous).toBe(true);
      expect(result.customer).toBeNull();
      expect(result.matchedBy).toBe('email');
      expect(result.ambiguousCustomerIds).toBeDefined();
      expect(result.ambiguousCustomerIds?.length).toBeGreaterThanOrEqual(2);
      expect(result.ambiguousCustomerIds).toContain(customer1.id);
      expect(result.ambiguousCustomerIds).toContain(customer2.id);

      // upsertCustomerWithMetrics should return 'ambiguous' action
      const upsertResult = await identityService.upsertCustomerWithMetrics({
        provider: 'shopify',
        externalId: testExternalId('shopify', 'ambig2'),
        email: ambiguousEmail,
      });

      expect(upsertResult.action).toBe('ambiguous');
      expect(upsertResult.customerId).toBe(0);
    });
  });

  describe('Idempotent Resolution', () => {
    it('should not create duplicates on repeated calls', async () => {
      if (!DB_AVAILABLE) return;

      const email = testEmail('idempotent');
      const externalId = testExternalId('qbo', 'idempotent');
      const input = {
        provider: 'qbo' as const,
        externalId,
        email,
        firstName: 'Idem',
        lastName: 'Potent',
      };

      // First call - should create
      const result1 = await identityService.upsertCustomerWithMetrics(input);
      expect(result1.action).toBe('created');
      const customerId = result1.customerId;

      // Second call with same data - should update (not create)
      const result2 = await identityService.upsertCustomerWithMetrics(input);
      expect(result2.customerId).toBe(customerId);
      expect(result2.action).toBe('updated');

      // Third call - still should update
      const result3 = await identityService.upsertCustomerWithMetrics(input);
      expect(result3.customerId).toBe(customerId);
      expect(result3.action).toBe('updated');

      // Verify only one customer with this email
      const customerCount = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM ticketing_prod.customers
        WHERE primary_email = ${email.toLowerCase()}
      `);
      expect((customerCount.rows[0] as any).cnt).toBe('1');

      // Verify only one identity with this externalId
      const identityCount = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM ticketing_prod.customer_identities
        WHERE provider = 'qbo' AND external_id = ${externalId}
      `);
      expect((identityCount.rows[0] as any).cnt).toBe('1');
    });
  });

  describe('Customer Primary Improvement', () => {
    it('should update customer primaries when learning new info', async () => {
      if (!DB_AVAILABLE) return;

      const email = testEmail('improve');
      const phone = testPhone('1');

      // Create customer with email only
      const result1 = await identityService.upsertCustomerWithMetrics({
        provider: 'shopify',
        externalId: testExternalId('shopify', 'improve'),
        email,
      });

      expect(result1.action).toBe('created');

      // Verify no phone yet
      const customerBefore = await db.query.customers.findFirst({
        where: eq(customers.id, result1.customerId),
      });
      expect(customerBefore?.primaryPhone).toBeNull();

      // Update via different provider with phone number
      const result2 = await identityService.upsertCustomerWithMetrics({
        provider: 'qbo',
        externalId: testExternalId('qbo', 'improve'),
        email, // same email matches
        phone,
      });

      expect(result2.customerId).toBe(result1.customerId);

      // Verify phone was added to customer
      const customerAfter = await db.query.customers.findFirst({
        where: eq(customers.id, result1.customerId),
      });
      expect(customerAfter?.primaryPhone).toBe(phone);
    });
  });

  describe('Phone Normalization', () => {
    it('should match same phone number in different formats', async () => {
      if (!DB_AVAILABLE) return;

      const rawPhone = '(555) 123-4567';
      const normalizedPhone = '+15551234567';

      // Create customer with raw phone format
      const result1 = await identityService.upsertCustomerWithMetrics({
        provider: 'qbo',
        externalId: testExternalId('qbo', 'phone1'),
        phone: rawPhone,
        firstName: `${TEST_PREFIX}PhoneTest`,
      });

      expect(result1.action).toBe('created');

      // Verify phone was normalized
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, result1.customerId),
      });
      expect(customer?.primaryPhone).toBe(normalizedPhone);

      // Match with different format
      const result2 = await identityService.upsertCustomerWithMetrics({
        provider: 'shopify',
        externalId: testExternalId('shopify', 'phone1'),
        phone: '555-123-4567', // Different format
        firstName: `${TEST_PREFIX}PhoneTest`,
      });

      // Should match same customer
      expect(result2.customerId).toBe(result1.customerId);
    });
  });
});

describe('Identity Utils', () => {
  describe('computeAddressHash', () => {
    it('should produce stable hashes for same address', () => {
      const address = {
        name: 'John Doe',
        address1: '123 Main St',
        address2: 'Suite 100',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      };

      const hash1 = identityUtils.computeAddressHash(address);
      const hash2 = identityUtils.computeAddressHash(address);

      expect(hash1).toBe(hash2);
      expect(hash1?.length).toBe(16);
    });

    it('should normalize casing and punctuation', () => {
      const address1 = {
        name: 'John Doe',
        address1: '123 Main St.',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
      };

      const address2 = {
        name: 'JOHN DOE',
        address1: '123 main st',
        city: 'SPRINGFIELD',
        state: 'il',
        postalCode: '62701',
      };

      expect(identityUtils.computeAddressHash(address1))
        .toBe(identityUtils.computeAddressHash(address2));
    });

    it('should return null for insufficient address data', () => {
      expect(identityUtils.computeAddressHash({})).toBeNull();
      expect(identityUtils.computeAddressHash({ name: 'John' })).toBeNull();
      expect(identityUtils.computeAddressHash({ address1: '123 Main' })).toBeNull();
    });

    it('should differentiate by address2', () => {
      const base = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
      };

      const apt100 = { ...base, address2: 'Apt 100' };
      const apt200 = { ...base, address2: 'Apt 200' };

      expect(identityUtils.computeAddressHash(apt100))
        .not.toBe(identityUtils.computeAddressHash(apt200));
    });
  });

  describe('normalizeEmail', () => {
    it('should lowercase and trim', () => {
      expect(identityUtils.normalizeEmail('  John.Doe@Example.COM  ')).toBe('john.doe@example.com');
    });

    it('should return null for empty values', () => {
      expect(identityUtils.normalizeEmail(null)).toBeNull();
      expect(identityUtils.normalizeEmail(undefined)).toBeNull();
      expect(identityUtils.normalizeEmail('')).toBeNull();
    });
  });

  describe('normalizePhone', () => {
    it('should convert US formats to E.164', () => {
      expect(identityUtils.normalizePhone('(555) 123-4567')).toBe('+15551234567');
      expect(identityUtils.normalizePhone('555-123-4567')).toBe('+15551234567');
      expect(identityUtils.normalizePhone('5551234567')).toBe('+15551234567');
      expect(identityUtils.normalizePhone('+1 555 123 4567')).toBe('+15551234567');
    });

    it('should preserve international formats', () => {
      expect(identityUtils.normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    });

    it('should return null for empty values', () => {
      expect(identityUtils.normalizePhone(null)).toBeNull();
      expect(identityUtils.normalizePhone(undefined)).toBeNull();
      expect(identityUtils.normalizePhone('')).toBeNull();
    });
  });
});
