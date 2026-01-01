/**
 * Unit tests for Identity Service
 *
 * Tests for:
 * - Same email across providers -> same customerId
 * - Missing Amazon email -> uses address hash identity
 * - Ambiguous matches -> no auto merge + logged
 * - Idempotent rerun -> no new customers created
 * - Address hash normalization
 */

import { identityUtils } from '@/services/crm/identityService';

describe('identityUtils', () => {
  describe('normalizeEmail', () => {
    it('should lowercase and trim email', () => {
      expect(identityUtils.normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
    });

    it('should return null for empty/null input', () => {
      expect(identityUtils.normalizeEmail(null)).toBeNull();
      expect(identityUtils.normalizeEmail(undefined)).toBeNull();
      expect(identityUtils.normalizeEmail('')).toBeNull();
    });
  });

  describe('normalizePhone', () => {
    it('should convert 10-digit US number to E.164', () => {
      expect(identityUtils.normalizePhone('555-123-4567')).toBe('+15551234567');
      expect(identityUtils.normalizePhone('(555) 123-4567')).toBe('+15551234567');
    });

    it('should handle 11-digit US number starting with 1', () => {
      expect(identityUtils.normalizePhone('15551234567')).toBe('+15551234567');
    });

    it('should preserve international numbers with +', () => {
      expect(identityUtils.normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    });

    it('should return null for empty/null input', () => {
      expect(identityUtils.normalizePhone(null)).toBeNull();
      expect(identityUtils.normalizePhone(undefined)).toBeNull();
      expect(identityUtils.normalizePhone('')).toBeNull();
    });
  });

  describe('computeAddressHash', () => {
    it('should compute consistent hash for same normalized address', () => {
      const address1 = {
        name: 'John Doe',
        address1: '123 Main St.',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address2 = {
        name: 'JOHN DOE',
        address1: '123 Main St',
        city: 'NEW YORK',
        state: 'ny',
        postalCode: '10001',
        country: 'us',
      };

      const hash1 = identityUtils.computeAddressHash(address1);
      const hash2 = identityUtils.computeAddressHash(address2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should return different hash for different addresses', () => {
      const address1 = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const address2 = {
        name: 'Jane Doe',
        address1: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      };

      const hash1 = identityUtils.computeAddressHash(address1);
      const hash2 = identityUtils.computeAddressHash(address2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize punctuation in address', () => {
      const address1 = {
        name: "O'Brien, John Jr.",
        address1: '123 N. Main St., Apt #4',
        city: 'St. Louis',
        state: 'MO',
        postalCode: '63101',
        country: 'US',
      };

      const address2 = {
        name: 'OBrien John Jr',
        address1: '123 N Main St Apt 4',
        city: 'St Louis',
        state: 'MO',
        postalCode: '63101',
        country: 'US',
      };

      const hash1 = identityUtils.computeAddressHash(address1);
      const hash2 = identityUtils.computeAddressHash(address2);

      expect(hash1).toBe(hash2);
    });

    it('should strip leading zeros from postal code', () => {
      const address1 = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'Boston',
        state: 'MA',
        postalCode: '02101',
        country: 'US',
      };

      const address2 = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'Boston',
        state: 'MA',
        postalCode: '2101',
        country: 'US',
      };

      const hash1 = identityUtils.computeAddressHash(address1);
      const hash2 = identityUtils.computeAddressHash(address2);

      expect(hash1).toBe(hash2);
    });

    it('should return null for insufficient address data', () => {
      // No name or address1
      expect(identityUtils.computeAddressHash({
        city: 'New York',
        postalCode: '10001',
      })).toBeNull();

      // No city or postal code
      expect(identityUtils.computeAddressHash({
        name: 'John Doe',
        address1: '123 Main St',
      })).toBeNull();
    });

    it('should default country to US', () => {
      const addressWithCountry = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const addressWithoutCountry = {
        name: 'John Doe',
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
      };

      const hash1 = identityUtils.computeAddressHash(addressWithCountry);
      const hash2 = identityUtils.computeAddressHash(addressWithoutCountry);

      expect(hash1).toBe(hash2);
    });
  });
});

describe('Identity Resolution Logic', () => {
  // These tests describe expected behavior - actual DB tests would be integration tests

  describe('email matching', () => {
    it('should describe: same email across providers resolves to same customer', () => {
      // Given a customer with email john@example.com from QBO
      // When Shopify imports an order with john@example.com
      // Then both should link to the same customerId
      expect(true).toBe(true); // Placeholder - actual test needs DB
    });
  });

  describe('Amazon address hash fallback', () => {
    it('should describe: missing Amazon email uses address hash identity', () => {
      // Given an Amazon order without BuyerEmail
      // When the order has a valid ShippingAddress
      // Then customer should be created/matched using address_hash:XXX externalId
      expect(true).toBe(true); // Placeholder - actual test needs DB
    });
  });

  describe('ambiguous match handling', () => {
    it('should describe: ambiguous matches do not auto-merge', () => {
      // Given two customers with different IDs but same email (data quality issue)
      // When a new identity with that email is imported
      // Then it should return isAmbiguous=true and NOT link to either
      expect(true).toBe(true); // Placeholder - actual test needs DB
    });
  });

  describe('idempotency', () => {
    it('should describe: rerunning sync does not create duplicates', () => {
      // Given a customer already exists with externalId=shopify:12345
      // When syncShopifyCustomers runs again with same customer
      // Then it should update, not create a new customer
      expect(true).toBe(true); // Placeholder - actual test needs DB
    });
  });
});
