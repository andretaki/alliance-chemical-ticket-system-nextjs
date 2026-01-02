import { db, customers, customerIdentities, interactions, crmTasks, customerScores, orders } from '@/lib/db';
import { eq, or, and, sql, inArray, count } from 'drizzle-orm';
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
 * Maximum retries for serializable transaction conflicts.
 * PostgreSQL throws error code 40001 when serialization fails.
 */
const MAX_SERIALIZATION_RETRIES = 3;
const SERIALIZATION_ERROR_CODE = '40001';

/**
 * Check if an error is a PostgreSQL serialization failure (code 40001).
 */
function isSerializationError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    return code === SERIALIZATION_ERROR_CODE;
  }
  return false;
}

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

  // Full SHA256 hash (64 chars = 256 bits) for maximum collision resistance.
  // Previously truncated to 32 chars, but full hash has negligible storage cost
  // and eliminates collision risk entirely for practical purposes.
  return crypto.createHash('sha256').update(parts).digest('hex');
};

/**
 * Computes both the full and legacy (truncated) address hashes for backward compatibility.
 * Use this when looking up existing records that may have been created with the old 32-char hash.
 *
 * Returns { full: 64-char hash, legacy: 32-char hash } or null if address is insufficient.
 */
const computeAddressHashWithLegacy = (address: AddressInput): { full: string; legacy: string } | null => {
  const fullHash = computeAddressHash(address);
  if (!fullHash) return null;
  return {
    full: fullHash,
    legacy: fullHash.substring(0, 32),
  };
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
  /**
   * @deprecated Use resolveCustomerAdvanced() or upsertCustomerWithMetrics() instead.
   * This method has NO transaction protection and is vulnerable to race conditions
   * when concurrent webhooks process the same customer.
   *
   * MIGRATION: Replace calls with:
   *   identityService.upsertCustomerWithMetrics({ ... })
   * or:
   *   identityService.resolveCustomerAdvanced({ ... })
   */
  async resolveOrCreateCustomer(input: IdentityInput) {
    console.warn('[IdentityService] DEPRECATED: resolveOrCreateCustomer() called. Use resolveCustomerAdvanced() instead.');
    console.warn(new Error().stack);  // Log call site for migration tracking
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
   * @deprecated Use resolveCustomerAdvanced() or upsertCustomerWithMetrics() instead.
   * This method has NO transaction protection and is vulnerable to race conditions
   * when concurrent webhooks process the same customer.
   *
   * MIGRATION: Replace calls with:
   *   identityService.upsertCustomerWithMetrics({ provider, externalId, ... }, address)
   *
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
   * Picks the "best" customer from a list of ambiguous matches.
   * Selection criteria (in order):
   * 1. Highest LTV (from customer_scores)
   * 2. Most orders
   * 3. Most recently updated
   */
  private async pickBestCustomer(customerIds: number[]): Promise<typeof customers.$inferSelect> {
    // Get LTV scores for all candidates
    const scores = await db.query.customerScores.findMany({
      where: inArray(customerScores.customerId, customerIds),
    });

    // Get order counts for all candidates
    const orderCounts = await db
      .select({ customerId: orders.customerId, orderCount: count() })
      .from(orders)
      .where(inArray(orders.customerId, customerIds))
      .groupBy(orders.customerId);

    // Build a scoring map
    const scoreMap = new Map<number, { ltv: number; orders: number }>();
    for (const id of customerIds) {
      scoreMap.set(id, { ltv: 0, orders: 0 });
    }
    for (const s of scores) {
      if (s.customerId) {
        scoreMap.set(s.customerId, {
          ...scoreMap.get(s.customerId)!,
          ltv: parseFloat(s.ltv || '0'),
        });
      }
    }
    for (const o of orderCounts) {
      if (o.customerId) {
        scoreMap.set(o.customerId, {
          ...scoreMap.get(o.customerId)!,
          orders: o.orderCount,
        });
      }
    }

    // Sort by LTV desc, then orders desc
    const sorted = customerIds.sort((a, b) => {
      const sa = scoreMap.get(a)!;
      const sb = scoreMap.get(b)!;
      if (sb.ltv !== sa.ltv) return sb.ltv - sa.ltv;
      return sb.orders - sa.orders;
    });

    const bestId = sorted[0];
    const bestCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, bestId),
    });

    if (!bestCustomer) {
      throw new Error(`[IdentityService] Failed to find best customer with id ${bestId}`);
    }

    return bestCustomer;
  }

  /**
   * Creates a MERGE_REVIEW CRM task when ambiguous customer matches are found.
   * This flags the match for human review without blocking order processing.
   */
  private async createMergeReviewTask(
    primaryCustomerId: number,
    allCustomerIds: number[],
    matchType: 'email' | 'phone' | 'addressHash',
    matchValue: string
  ): Promise<void> {
    // Check for existing open MERGE_REVIEW task for same customers
    const existingTask = await db.query.crmTasks.findFirst({
      where: and(
        eq(crmTasks.type, 'MERGE_REVIEW'),
        eq(crmTasks.status, 'open'),
        eq(crmTasks.customerId, primaryCustomerId)
      ),
    });

    if (existingTask) {
      await db.update(crmTasks).set({
        updatedAt: new Date(),
      }).where(eq(crmTasks.id, existingTask.id));
      return;
    }

    // Create new MERGE_REVIEW task
    await db.insert(crmTasks).values({
      customerId: primaryCustomerId,
      type: 'MERGE_REVIEW',
      reason: `AMBIGUOUS_${matchType.toUpperCase()}`,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`[IdentityService] Created MERGE_REVIEW task for customer ${primaryCustomerId} (${matchType}: ${matchValue})`);
  }

  /**
   * Advanced customer resolution with multi-identifier matching.
   * Detects and reports ambiguous matches instead of auto-merging.
   * Improves customer primaries when we learn new info.
   *
   * CRITICAL: This method wraps ALL lookup AND create logic in a SERIALIZABLE
   * transaction to prevent race conditions when concurrent webhooks attempt
   * to resolve the same customer. The entire "check-then-create" operation
   * is atomic.
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

    // Retry loop for serializable transaction conflicts.
    // When concurrent webhooks race, PostgreSQL may abort one transaction
    // with error code 40001. We retry up to MAX_SERIALIZATION_RETRIES times.
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.resolveCustomerAdvancedTx(input, email, phone, addressHash);
      } catch (error) {
        lastError = error;
        if (isSerializationError(error) && attempt < MAX_SERIALIZATION_RETRIES) {
          // Exponential backoff: 50ms, 100ms, 200ms...
          const delay = 50 * Math.pow(2, attempt - 1);
          console.warn(`[IdentityService] Serialization conflict (attempt ${attempt}/${MAX_SERIALIZATION_RETRIES}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Internal transactional implementation of resolveCustomerAdvanced.
   * Separated to enable retry logic in the caller.
   */
  private async resolveCustomerAdvancedTx(
    input: IdentityInput,
    email: string | null,
    phone: string | null,
    addressHash: string | null
  ): Promise<ResolutionResult> {
    // Wrap ALL resolution logic in a SERIALIZABLE transaction to prevent race conditions.
    // SERIALIZABLE isolation ensures no concurrent transaction can interleave
    // reads/writes that would cause duplicate customers.
    return await db.transaction(async (tx) => {
      // 1) Try provider + external id (exact match, never ambiguous)
      if (input.externalId) {
        const existingByExternal = await tx.query.customerIdentities.findFirst({
          where: and(
            eq(customerIdentities.provider, input.provider),
            eq(customerIdentities.externalId, input.externalId)
          ),
          with: { customer: true },
        });
        if (existingByExternal?.customer) {
          // Improve customer primaries if we've learned new info
          await this.improveCustomerPrimariesTx(
            tx,
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
            matchedBy: 'externalId' as const,
          };
        }
      }

      // 2) Try email match - check for ambiguity
      if (email) {
        const emailMatches = await tx.query.customerIdentities.findMany({
          where: eq(customerIdentities.email, email),
          with: { customer: true },
        });

        const customerEmailMatches = await tx.query.customers.findMany({
          where: eq(customers.primaryEmail, email),
        });

        // Collect unique customer IDs
        const customerIds = new Set<number>();
        emailMatches.forEach((m: { customerId: number | null }) => m.customerId && customerIds.add(m.customerId));
        customerEmailMatches.forEach((c: { id: number }) => customerIds.add(c.id));

        if (customerIds.size > 1) {
          // Ambiguous: multiple customers share this email
          // Pick the best match and flag for human review
          console.warn(`[IdentityService] Ambiguous email match: ${email} maps to ${customerIds.size} customers`);
          const ambiguousIds = Array.from(customerIds);
          const bestCustomer = await this.pickBestCustomerTx(tx, ambiguousIds);
          await this.createMergeReviewTaskTx(tx, bestCustomer.id, ambiguousIds, 'email', email!);
          return {
            customer: bestCustomer,
            isNew: false,
            isAmbiguous: true,
            matchedBy: 'email' as const,
            ambiguousCustomerIds: ambiguousIds,
          };
        }

        if (customerIds.size === 1) {
          const customerId = Array.from(customerIds)[0];
          const customer = emailMatches[0]?.customer || customerEmailMatches[0];
          if (customer) {
            // Improve customer primaries and link identity
            await this.improveCustomerPrimariesTx(
              tx,
              customerId,
              email,
              phone,
              input.firstName || null,
              input.lastName || null
            );
            await this.ensureIdentityLinkedTx(tx, customerId, input, email, phone);

            return {
              customer,
              isNew: false,
              isAmbiguous: false,
              matchedBy: 'email' as const,
            };
          }
        }
      }

      // 3) Try phone match - check for ambiguity
      if (phone) {
        const phoneMatches = await tx.query.customerIdentities.findMany({
          where: eq(customerIdentities.phone, phone),
          with: { customer: true },
        });

        const customerPhoneMatches = await tx.query.customers.findMany({
          where: eq(customers.primaryPhone, phone),
        });

        const customerIds = new Set<number>();
        phoneMatches.forEach((m: { customerId: number | null }) => m.customerId && customerIds.add(m.customerId));
        customerPhoneMatches.forEach((c: { id: number }) => customerIds.add(c.id));

        if (customerIds.size > 1) {
          // Ambiguous: multiple customers share this phone
          // Pick the best match and flag for human review
          console.warn(`[IdentityService] Ambiguous phone match: ${phone} maps to ${customerIds.size} customers`);
          const ambiguousIds = Array.from(customerIds);
          const bestCustomer = await this.pickBestCustomerTx(tx, ambiguousIds);
          await this.createMergeReviewTaskTx(tx, bestCustomer.id, ambiguousIds, 'phone', phone!);
          return {
            customer: bestCustomer,
            isNew: false,
            isAmbiguous: true,
            matchedBy: 'phone' as const,
            ambiguousCustomerIds: ambiguousIds,
          };
        }

        if (customerIds.size === 1) {
          const customerId = Array.from(customerIds)[0];
          const customer = phoneMatches[0]?.customer || customerPhoneMatches[0];
          if (customer) {
            // Improve customer primaries and link identity
            await this.improveCustomerPrimariesTx(
              tx,
              customerId,
              email,
              phone,
              input.firstName || null,
              input.lastName || null
            );
            await this.ensureIdentityLinkedTx(tx, customerId, input, email, phone);

            return {
              customer,
              isNew: false,
              isAmbiguous: false,
              matchedBy: 'phone' as const,
            };
          }
        }
      }

      // 4) Try address hash match (for Amazon/ShipStation without email)
      // Check both full 64-char hash and legacy 32-char hash for backward compatibility
      if (addressHash) {
        const hashExternalIdFull = `address_hash:${addressHash}`;
        const hashExternalIdLegacy = `address_hash:${addressHash.substring(0, 32)}`;

        const addressMatches = await tx.query.customerIdentities.findMany({
          where: and(
            eq(customerIdentities.provider, input.provider),
            or(
              eq(customerIdentities.externalId, hashExternalIdFull),
              eq(customerIdentities.externalId, hashExternalIdLegacy)
            )
          ),
          with: { customer: true },
        });

        const customerIds = new Set<number>();
        addressMatches.forEach((m: { customerId: number | null }) => m.customerId && customerIds.add(m.customerId));

        if (customerIds.size > 1) {
          // Ambiguous: multiple customers share this address hash
          // Pick the best match and flag for human review
          console.warn(`[IdentityService] Ambiguous address hash match: ${addressHash} maps to ${customerIds.size} customers`);
          const ambiguousIds = Array.from(customerIds);
          const bestCustomer = await this.pickBestCustomerTx(tx, ambiguousIds);
          await this.createMergeReviewTaskTx(tx, bestCustomer.id, ambiguousIds, 'addressHash', addressHash!);
          return {
            customer: bestCustomer,
            isNew: false,
            isAmbiguous: true,
            matchedBy: 'addressHash' as const,
            ambiguousCustomerIds: ambiguousIds,
          };
        }

        if (customerIds.size === 1 && addressMatches[0]?.customer) {
          const customer = addressMatches[0].customer;
          // Improve customer primaries (we might have learned email/phone now)
          await this.improveCustomerPrimariesTx(
            tx,
            customer.id,
            email,
            phone,
            input.firstName || null,
            input.lastName || null
          );
          // Link the externalId identity if provided
          await this.ensureIdentityLinkedTx(tx, customer.id, input, email, phone);

          return {
            customer,
            isNew: false,
            isAmbiguous: false,
            matchedBy: 'addressHash' as const,
          };
        }
      }

      // 5) Create new customer - already inside transaction
      // Use ON CONFLICT to handle any remaining edge cases
      const [newCustomer] = await tx.insert(customers).values({
        primaryEmail: email,
        primaryPhone: phone,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        company: input.company || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Add primary identity within transaction
      await tx.insert(customerIdentities).values({
        customerId: newCustomer.id,
        provider: input.provider,
        externalId: input.externalId || null,
        email,
        phone,
        metadata: { ...input.metadata, identityType: input.identityType } || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // If we have an address hash and no email, add it as a secondary identity
      if (addressHash && !email && !input.externalId) {
        await tx.insert(customerIdentities).values({
          customerId: newCustomer.id,
          provider: input.provider,
          externalId: `address_hash:${addressHash}`,
          email: null,
          phone: null,
          metadata: {
            identityType: input.provider === 'amazon' ? 'amazon_order_address_hash' : 'shipstation_address_hash',
            addressHash,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return {
        customer: newCustomer,
        isNew: true,
        isAmbiguous: false,
        matchedBy: 'none' as const,
      };
    }, {
      isolationLevel: 'serializable',
      accessMode: 'read write',
    });
  }

  /**
   * Transaction-aware version of improveCustomerPrimaries.
   */
  private async improveCustomerPrimariesTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    customerId: number,
    email: string | null,
    phone: string | null,
    firstName: string | null,
    lastName: string | null
  ): Promise<void> {
    const customer = await tx.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) return;

    const updates: Partial<typeof customers.$inferInsert> = {};

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
      await tx.update(customers).set(updates).where(eq(customers.id, customerId));
    } else {
      await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, customerId));
    }
  }

  /**
   * Transaction-aware version of ensureIdentityLinked.
   */
  private async ensureIdentityLinkedTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    customerId: number,
    input: IdentityInput,
    email: string | null,
    phone: string | null
  ): Promise<void> {
    if (input.externalId) {
      const existingExternal = await tx.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
      });
      if (!existingExternal) {
        await tx.insert(customerIdentities).values({
          customerId,
          provider: input.provider,
          externalId: input.externalId,
          email,
          phone,
          metadata: { ...input.metadata, identityType: input.identityType },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (email && !input.externalId) {
      const existingEmail = await tx.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.email, email),
          eq(customerIdentities.customerId, customerId)
        ),
      });
      if (!existingEmail) {
        await tx.insert(customerIdentities).values({
          customerId,
          provider: input.provider,
          externalId: null,
          email,
          phone,
          metadata: { identityType: 'email' as const },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  /**
   * Transaction-aware version of pickBestCustomer.
   */
  private async pickBestCustomerTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    customerIds: number[]
  ): Promise<typeof customers.$inferSelect> {
    const scores = await tx.query.customerScores.findMany({
      where: inArray(customerScores.customerId, customerIds),
    });

    const orderCounts = await tx
      .select({ customerId: orders.customerId, orderCount: count() })
      .from(orders)
      .where(inArray(orders.customerId, customerIds))
      .groupBy(orders.customerId);

    const scoreMap = new Map<number, { ltv: number; orders: number }>();
    for (const id of customerIds) {
      scoreMap.set(id, { ltv: 0, orders: 0 });
    }
    for (const s of scores) {
      if (s.customerId) {
        scoreMap.set(s.customerId, {
          ...scoreMap.get(s.customerId)!,
          ltv: parseFloat(s.ltv || '0'),
        });
      }
    }
    for (const o of orderCounts) {
      if (o.customerId) {
        scoreMap.set(o.customerId, {
          ...scoreMap.get(o.customerId)!,
          orders: o.orderCount,
        });
      }
    }

    const sorted = customerIds.sort((a, b) => {
      const sa = scoreMap.get(a)!;
      const sb = scoreMap.get(b)!;
      if (sb.ltv !== sa.ltv) return sb.ltv - sa.ltv;
      return sb.orders - sa.orders;
    });

    const bestId = sorted[0];
    const bestCustomer = await tx.query.customers.findFirst({
      where: eq(customers.id, bestId),
    });

    if (!bestCustomer) {
      throw new Error(`[IdentityService] Failed to find best customer with id ${bestId}`);
    }

    return bestCustomer;
  }

  /**
   * Transaction-aware version of createMergeReviewTask.
   */
  private async createMergeReviewTaskTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    primaryCustomerId: number,
    allCustomerIds: number[],
    matchType: 'email' | 'phone' | 'addressHash',
    matchValue: string
  ): Promise<void> {
    const existingTask = await tx.query.crmTasks.findFirst({
      where: and(
        eq(crmTasks.type, 'MERGE_REVIEW'),
        eq(crmTasks.status, 'open'),
        eq(crmTasks.customerId, primaryCustomerId)
      ),
    });

    if (existingTask) {
      await tx.update(crmTasks).set({
        updatedAt: new Date(),
      }).where(eq(crmTasks.id, existingTask.id));
      return;
    }

    await tx.insert(crmTasks).values({
      customerId: primaryCustomerId,
      type: 'MERGE_REVIEW',
      reason: `AMBIGUOUS_${matchType.toUpperCase()}`,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`[IdentityService] Created MERGE_REVIEW task for customer ${primaryCustomerId} (${matchType}: ${matchValue})`);
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
      // IMPORTANT: We now return the best-matching customer instead of 0.
      // The MERGE_REVIEW task was already created in resolveCustomerAdvanced().
      return { customerId: result.customer!.id, action: 'ambiguous' };
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
