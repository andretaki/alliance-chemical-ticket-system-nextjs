import { db, customers, customerIdentities, interactions } from '@/lib/db';
import { eq, or, and, sql } from 'drizzle-orm';
import type { providerEnum } from '@/lib/db';
import crypto from 'crypto';

export type Provider = typeof providerEnum.enumValues[number];

/**
 * Identity types for multi-identifier matching.
 * These are stored in metadata.identityType to distinguish different ID types per provider.
 */
export type IdentityType =
  | 'shopify_customer_id'
  | 'qbo_customer_id'
  | 'amazon_buyer_id'
  | 'amazon_order_address_hash'
  | 'shipstation_customer_id'
  | 'shipstation_address_hash'
  | 'email'
  | 'phone';

export interface IdentityInput {
  provider: Provider;
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  metadata?: Record<string, unknown>;
  /** Optional identity type for multi-identifier matching */
  identityType?: IdentityType;
}

export interface AddressInput {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface ResolutionResult {
  customer: typeof customers.$inferSelect | null;
  isNew: boolean;
  isAmbiguous: boolean;
  matchedBy: 'externalId' | 'email' | 'phone' | 'addressHash' | 'none';
  ambiguousCustomerIds?: number[];
}

export interface SyncMetrics {
  fetched: number;
  created: number;
  updated: number;
  linked: number;
  unlinked: number;
  ambiguous: number;
  errors: number;
}

export interface InteractionInput {
  customerId: number;
  ticketId?: number | null;
  commentId?: number | null;
  channel: string;
  direction?: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
}

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || null;

/**
 * Creates a stable hash from shipping/billing address for identity matching.
 * Used when email/phone are unavailable (e.g., Amazon orders with restricted PII).
 *
 * Normalization:
 * - Lowercase all fields
 * - Remove extra whitespace
 * - Remove punctuation from address lines
 * - Standardize state abbreviations (future enhancement)
 * - Strip leading zeros from postal codes
 *
 * The hash is deterministic: same normalized address -> same hash.
 */
const computeAddressHash = (address: AddressInput): string | null => {
  // Require at least name + some address component
  if (!address.name && !address.address1) return null;
  if (!address.city && !address.postalCode) return null;

  const normalize = (s?: string | null) =>
    (s || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // remove punctuation
      .replace(/\s+/g, ' ')     // collapse whitespace
      .trim();

  const normalizePostal = (s?: string | null) =>
    (s || '').replace(/\D/g, '').replace(/^0+/, '') || '';

  // Include address2 (apt/suite) to distinguish customers at same street address
  const parts = [
    normalize(address.name),
    normalize(address.address1),
    normalize(address.address2),  // Added: apt/suite distinguishes customers
    normalize(address.city),
    normalize(address.state),
    normalizePostal(address.postalCode),
    normalize(address.country) || 'us',
  ].join('|');

  // SHA256 hash, truncated to 16 chars for readability
  return crypto.createHash('sha256').update(parts).digest('hex').substring(0, 16);
};

/**
 * Normalizes a phone number to E.164 format.
 *
 * E.164 format: +[country code][subscriber number], e.g. +15551234567
 *
 * This function:
 * - Strips all non-digit characters except leading +
 * - Adds +1 prefix for 10-digit US numbers without country code
 * - Preserves existing + prefix with country code
 * - Returns null for empty or invalid inputs
 *
 * Examples:
 *   "(555) 123-4567"     -> "+15551234567"
 *   "555-123-4567"       -> "+15551234567"
 *   "15551234567"        -> "+15551234567"
 *   "+1 555 123 4567"    -> "+15551234567"
 *   "+44 20 7946 0958"   -> "+442079460958"
 *
 * IMPORTANT: All customer/contact creation code should use this function
 * to ensure consistent phone storage for reliable 3CX matching.
 */
const normalizePhone = (phone?: string | null): string | null => {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  const hasPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '');

  if (!digits) return null;

  // If 10 digits (US number without country code), add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If 11 digits starting with 1 (US number with country code), add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If already had + prefix, preserve it
  if (hasPlus) {
    return `+${digits}`;
  }

  // For other formats, just return digits with + if it looks like full international
  // (more than 10 digits suggests country code is included)
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Fall back to just the digits for short numbers (extensions, etc)
  return digits;
};

class IdentityService {
  async resolveOrCreateCustomer(input: IdentityInput) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);

    // 1) Try provider + external id
    if (input.externalId) {
      const existingByExternal = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
        with: { customer: true },
      });
      if (existingByExternal?.customer) {
        return existingByExternal.customer;
      }
    }

    // 2) Try email/phone matches on identities or primary fields
    if (email || phone) {
      const identityMatches = [];
      if (email) identityMatches.push(eq(customerIdentities.email, email));
      if (phone) identityMatches.push(eq(customerIdentities.phone, phone));

      if (identityMatches.length > 0) {
        const existingByEmailOrPhone = await db.query.customerIdentities.findFirst({
          where: or(...identityMatches),
          with: { customer: true },
        });
        if (existingByEmailOrPhone?.customer) {
          return existingByEmailOrPhone.customer;
        }
      }

      const customerMatches = [];
      if (email) customerMatches.push(eq(customers.primaryEmail, email));
      if (phone) customerMatches.push(eq(customers.primaryPhone, phone));

      if (customerMatches.length > 0) {
        const existingCustomer = await db.query.customers.findFirst({
          where: or(...customerMatches),
        });
        if (existingCustomer) {
          return existingCustomer;
        }
      }
    }

    // 3) Create new customer + identity
    const [newCustomer] = await db.insert(customers).values({
      primaryEmail: email,
      primaryPhone: phone,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      company: input.company || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await this.addIdentity(newCustomer.id, { ...input, email, phone });

    return newCustomer;
  }

  /**
   * Resolves or creates a customer using address hash as fallback identifier.
   * Used when email is unavailable (e.g., Amazon restricted PII).
   */
  async resolveOrCreateCustomerWithAddressHash(
    input: Omit<IdentityInput, 'email' | 'phone'>,
    address?: AddressInput
  ) {
    // If no address provided, create customer without linkage
    if (!address) {
      const [newCustomer] = await db.insert(customers).values({
        primaryEmail: null,
        primaryPhone: null,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        company: input.company || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      await this.addIdentity(newCustomer.id, {
        ...input,
        email: null,
        phone: null,
        metadata: { ...input.metadata, identityType: 'no_identifier' },
      });

      return newCustomer;
    }

    const addressHash = computeAddressHash(address);
    const hashExternalId = `address_hash:${addressHash}`;

    // 1) Try to find existing customer by address hash
    const existingByHash = await db.query.customerIdentities.findFirst({
      where: and(
        eq(customerIdentities.provider, input.provider),
        eq(customerIdentities.externalId, hashExternalId)
      ),
      with: { customer: true },
    });

    if (existingByHash?.customer) {
      return existingByHash.customer;
    }

    // 2) Check if we've seen this exact provider+externalId before
    if (input.externalId) {
      const existingByExternal = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
        with: { customer: true },
      });
      if (existingByExternal?.customer) {
        // Add the address hash identity to this customer
        await this.addIdentity(existingByExternal.customer.id, {
          provider: input.provider,
          externalId: hashExternalId,
          email: null,
          phone: null,
          metadata: { identityType: 'address_hash', originalExternalId: input.externalId },
        });
        return existingByExternal.customer;
      }
    }

    // 3) Create new customer with address hash identity
    const [newCustomer] = await db.insert(customers).values({
      primaryEmail: null,
      primaryPhone: null,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      company: input.company || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Add address hash identity
    await this.addIdentity(newCustomer.id, {
      provider: input.provider,
      externalId: hashExternalId,
      email: null,
      phone: null,
      metadata: {
        identityType: 'address_hash',
        addressHash,
        originalExternalId: input.externalId || null,
        normalizedAddress: {
          name: address.name,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        },
      },
    });

    return newCustomer;
  }

  async addIdentity(customerId: number, identity: IdentityInput) {
    const email = normalizeEmail(identity.email);
    const phone = normalizePhone(identity.phone);

    // Upsert-like behavior: if identity exists, update metadata/email/phone
    const existing = identity.externalId ? await db.query.customerIdentities.findFirst({
      where: and(
        eq(customerIdentities.provider, identity.provider),
        eq(customerIdentities.externalId, identity.externalId)
      ),
    }) : null;

    if (existing) {
      await db.update(customerIdentities).set({
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        metadata: identity.metadata ?? existing.metadata,
        updatedAt: new Date(),
      }).where(eq(customerIdentities.id, existing.id));
      return existing;
    }

    return db.insert(customerIdentities).values({
      customerId,
      provider: identity.provider,
      externalId: identity.externalId || null,
      email,
      phone,
      metadata: identity.metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
  }

  async recordInteraction(input: InteractionInput) {
    return db.insert(interactions).values({
      customerId: input.customerId,
      ticketId: input.ticketId ?? null,
      commentId: input.commentId ?? null,
      channel: input.channel as any,
      direction: (input.direction || 'inbound') as any,
      metadata: input.metadata || null,
      occurredAt: new Date(),
      createdAt: new Date(),
    }).returning();
  }

  /**
   * Updates customer primaries if we've learned better identifiers.
   * This ensures customers "improve" as we ingest more data.
   */
  private async improveCustomerPrimaries(
    customerId: number,
    email: string | null,
    phone: string | null,
    firstName: string | null,
    lastName: string | null
  ): Promise<void> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) return;

    const updates: Partial<typeof customers.$inferInsert> = {};

    // Update primaries if we have new info and customer is missing it
    if (email && !customer.primaryEmail) {
      updates.primaryEmail = email;
    }
    if (phone && !customer.primaryPhone) {
      updates.primaryPhone = phone;
    }
    if (firstName && !customer.firstName) {
      updates.firstName = firstName;
    }
    if (lastName && !customer.lastName) {
      updates.lastName = lastName;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(customers).set(updates).where(eq(customers.id, customerId));
    } else {
      // Just update updatedAt
      await db.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, customerId));
    }
  }

  /**
   * Ensures an identity record exists for the given customer.
   * Links email/phone identities if they don't exist yet.
   */
  private async ensureIdentityLinked(
    customerId: number,
    input: IdentityInput,
    email: string | null,
    phone: string | null
  ): Promise<void> {
    // If we have an externalId, ensure that identity exists
    if (input.externalId) {
      const existingExternal = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
      });
      if (!existingExternal) {
        await this.addIdentity(customerId, {
          ...input,
          email,
          phone,
          metadata: { ...input.metadata, identityType: input.identityType },
        });
      }
    }

    // If we have email but no identity with this email for this provider, add one
    if (email && !input.externalId) {
      const existingEmail = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.email, email),
          eq(customerIdentities.customerId, customerId)
        ),
      });
      if (!existingEmail) {
        await this.addIdentity(customerId, {
          provider: input.provider,
          email,
          phone,
          firstName: input.firstName,
          lastName: input.lastName,
          metadata: { identityType: 'email' as const },
        });
      }
    }
  }

  /**
   * Advanced customer resolution with multi-identifier matching.
   * Detects and reports ambiguous matches instead of auto-merging.
   * Improves customer primaries when we learn new info.
   *
   * Resolution order:
   * 1. Provider + externalId (exact match)
   * 2. Email (check for ambiguity)
   * 3. Phone (check for ambiguity)
   * 4. Address hash (check for ambiguity)
   * 5. Create new if no match
   *
   * @param input Identity input with optional address for hash fallback
   * @param address Optional address for hash-based matching (Amazon/ShipStation fallback)
   */
  async resolveCustomerAdvanced(
    input: IdentityInput,
    address?: AddressInput
  ): Promise<ResolutionResult> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const addressHash = address ? computeAddressHash(address) : null;

    // 1) Try provider + external id (exact match, never ambiguous)
    if (input.externalId) {
      const existingByExternal = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
        with: { customer: true },
      });
      if (existingByExternal?.customer) {
        // Improve customer primaries if we've learned new info
        await this.improveCustomerPrimaries(
          existingByExternal.customer.id,
          email,
          phone,
          input.firstName || null,
          input.lastName || null
        );

        return {
          customer: existingByExternal.customer,
          isNew: false,
          isAmbiguous: false,
          matchedBy: 'externalId',
        };
      }
    }

    // 2) Try email match - check for ambiguity
    if (email) {
      const emailMatches = await db.query.customerIdentities.findMany({
        where: eq(customerIdentities.email, email),
        with: { customer: true },
      });

      const customerEmailMatches = await db.query.customers.findMany({
        where: eq(customers.primaryEmail, email),
      });

      // Collect unique customer IDs
      const customerIds = new Set<number>();
      emailMatches.forEach(m => m.customerId && customerIds.add(m.customerId));
      customerEmailMatches.forEach(c => customerIds.add(c.id));

      if (customerIds.size > 1) {
        // Ambiguous: multiple customers share this email
        console.warn(`[IdentityService] Ambiguous email match: ${email} maps to ${customerIds.size} customers`);
        return {
          customer: null,
          isNew: false,
          isAmbiguous: true,
          matchedBy: 'email',
          ambiguousCustomerIds: Array.from(customerIds),
        };
      }

      if (customerIds.size === 1) {
        const customerId = Array.from(customerIds)[0];
        const customer = emailMatches[0]?.customer || customerEmailMatches[0];
        if (customer) {
          // Improve customer primaries and link identity
          await this.improveCustomerPrimaries(
            customerId,
            email,
            phone,
            input.firstName || null,
            input.lastName || null
          );
          await this.ensureIdentityLinked(customerId, input, email, phone);

          return {
            customer,
            isNew: false,
            isAmbiguous: false,
            matchedBy: 'email',
          };
        }
      }
    }

    // 3) Try phone match - check for ambiguity
    if (phone) {
      const phoneMatches = await db.query.customerIdentities.findMany({
        where: eq(customerIdentities.phone, phone),
        with: { customer: true },
      });

      const customerPhoneMatches = await db.query.customers.findMany({
        where: eq(customers.primaryPhone, phone),
      });

      const customerIds = new Set<number>();
      phoneMatches.forEach(m => m.customerId && customerIds.add(m.customerId));
      customerPhoneMatches.forEach(c => customerIds.add(c.id));

      if (customerIds.size > 1) {
        console.warn(`[IdentityService] Ambiguous phone match: ${phone} maps to ${customerIds.size} customers`);
        return {
          customer: null,
          isNew: false,
          isAmbiguous: true,
          matchedBy: 'phone',
          ambiguousCustomerIds: Array.from(customerIds),
        };
      }

      if (customerIds.size === 1) {
        const customerId = Array.from(customerIds)[0];
        const customer = phoneMatches[0]?.customer || customerPhoneMatches[0];
        if (customer) {
          // Improve customer primaries and link identity
          await this.improveCustomerPrimaries(
            customerId,
            email,
            phone,
            input.firstName || null,
            input.lastName || null
          );
          await this.ensureIdentityLinked(customerId, input, email, phone);

          return {
            customer,
            isNew: false,
            isAmbiguous: false,
            matchedBy: 'phone',
          };
        }
      }
    }

    // 4) Try address hash match (for Amazon/ShipStation without email)
    if (addressHash) {
      const hashExternalId = `address_hash:${addressHash}`;
      const addressMatches = await db.query.customerIdentities.findMany({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, hashExternalId)
        ),
        with: { customer: true },
      });

      const customerIds = new Set<number>();
      addressMatches.forEach(m => m.customerId && customerIds.add(m.customerId));

      if (customerIds.size > 1) {
        console.warn(`[IdentityService] Ambiguous address hash match: ${addressHash} maps to ${customerIds.size} customers`);
        return {
          customer: null,
          isNew: false,
          isAmbiguous: true,
          matchedBy: 'addressHash',
          ambiguousCustomerIds: Array.from(customerIds),
        };
      }

      if (customerIds.size === 1 && addressMatches[0]?.customer) {
        const customer = addressMatches[0].customer;
        // Improve customer primaries (we might have learned email/phone now)
        await this.improveCustomerPrimaries(
          customer.id,
          email,
          phone,
          input.firstName || null,
          input.lastName || null
        );
        // Link the externalId identity if provided
        await this.ensureIdentityLinked(customer.id, input, email, phone);

        return {
          customer,
          isNew: false,
          isAmbiguous: false,
          matchedBy: 'addressHash',
        };
      }
    }

    // 5) Create new customer
    const [newCustomer] = await db.insert(customers).values({
      primaryEmail: email,
      primaryPhone: phone,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      company: input.company || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Add primary identity
    await this.addIdentity(newCustomer.id, {
      ...input,
      email,
      phone,
      metadata: {
        ...input.metadata,
        identityType: input.identityType,
      },
    });

    // If we have an address hash and no email, add it as a secondary identity
    if (addressHash && !email && !input.externalId) {
      await this.addIdentity(newCustomer.id, {
        provider: input.provider,
        externalId: `address_hash:${addressHash}`,
        firstName: input.firstName,
        lastName: input.lastName,
        metadata: {
          identityType: input.provider === 'amazon' ? 'amazon_order_address_hash' : 'shipstation_address_hash',
          addressHash,
        },
      });
    }

    return {
      customer: newCustomer,
      isNew: true,
      isAmbiguous: false,
      matchedBy: 'none',
    };
  }

  /**
   * Upserts a customer with full identity tracking.
   * Returns metrics about what was created/updated/linked.
   */
  async upsertCustomerWithMetrics(
    input: IdentityInput,
    address?: AddressInput
  ): Promise<{ customerId: number; action: 'created' | 'updated' | 'ambiguous' | 'linked' }> {
    const result = await this.resolveCustomerAdvanced(input, address);

    if (result.isAmbiguous) {
      return { customerId: 0, action: 'ambiguous' };
    }

    if (result.isNew) {
      return { customerId: result.customer!.id, action: 'created' };
    }

    // Existing customer - ensure identity is linked
    if (result.customer && input.externalId) {
      const existingIdentity = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
      });

      if (!existingIdentity) {
        await this.addIdentity(result.customer.id, input);
        return { customerId: result.customer.id, action: 'linked' };
      }
    }

    return { customerId: result.customer!.id, action: 'updated' };
  }

  /**
   * Find customer by address hash (for Amazon orders without buyer email).
   */
  async findByAddressHash(provider: Provider, addressHash: string): Promise<typeof customers.$inferSelect | null> {
    const identity = await db.query.customerIdentities.findFirst({
      where: and(
        eq(customerIdentities.provider, provider),
        eq(customerIdentities.externalId, `address_hash:${addressHash}`)
      ),
      with: { customer: true },
    });
    return identity?.customer || null;
  }
}

export const identityService = new IdentityService();
export const identityUtils = { normalizeEmail, normalizePhone, computeAddressHash };

/**
 * Creates a new SyncMetrics object initialized to zero.
 */
export function createSyncMetrics(): SyncMetrics {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    ambiguous: 0,
    errors: 0,
  };
}

/**
 * Logs sync metrics in a consistent format.
 */
export function logSyncMetrics(provider: string, metrics: SyncMetrics): void {
  console.log(`[${provider}] Sync complete:`, {
    fetched: metrics.fetched,
    created: metrics.created,
    updated: metrics.updated,
    linked: metrics.linked,
    unlinked: metrics.unlinked,
    ambiguous: metrics.ambiguous,
    errors: metrics.errors,
  });
}
