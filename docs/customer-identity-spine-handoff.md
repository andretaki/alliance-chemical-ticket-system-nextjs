# Customer Identity Spine - Handoff Document

## Overview

We built a **unified customer identity system** that links customers across multiple commerce platforms (Shopify, QBO, Amazon, ShipStation) into a single customer record. This solves the problem of the same person appearing as different customers in different systems.

## The Problem We Solved

Before this work:
- A customer ordering on Shopify was separate from the same person in QBO
- Amazon orders often lack buyer email (PII restricted), so we couldn't link them
- No way to see "all orders for customer X" across platforms
- Duplicate customer records everywhere

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      customers table                            │
│  (single source of truth for customer data)                     │
│  - id, primaryEmail, primaryPhone, firstName, lastName          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ customerId (FK)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  customer_identities table                      │
│  (links external IDs to customers)                              │
│  - provider: shopify|qbo|amazon|shipstation|manual|klaviyo      │
│  - externalId: provider-specific ID or address_hash:XXX         │
│  - email, phone: normalized identifiers                         │
│  - metadata: { identityType: 'email'|'phone'|'address_hash' }   │
└─────────────────────────────────────────────────────────────────┘
```

### Identity Resolution Flow

```
1. New order/customer comes in from provider
2. Normalize email (lowercase, trim) and phone (digits only)
3. Try to match:
   a. Exact: provider + externalId → existing identity?
   b. Email: any identity or customer.primaryEmail matches?
   c. Phone: any identity or customer.primaryPhone matches?
   d. Address Hash: SHA-256 of normalized address → existing identity?
4. If match found:
   - If 1 customer matched → link to that customer
   - If 2+ customers matched → AMBIGUOUS, don't auto-merge, log warning
5. If no match → create new customer + identity
6. Improve customer: update primaryEmail/Phone if we learned new info
```

### Amazon Address Hash Fallback

Amazon often restricts buyer email. We solve this by:
1. Compute SHA-256 hash of normalized shipping address
2. Store identity with `externalId: 'address_hash:abc123...'`
3. Future orders to same address → match existing customer

```typescript
// Address hash includes: name, address1, address2, city, state, postalCode, country
const hash = computeAddressHash({
  name: 'John Doe',
  address1: '123 Main St',
  address2: 'Apt 4B',  // Important: distinguishes customers at same street
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US'
});
// Returns: SHA-256 hash of normalized concatenated string
```

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `src/db/migrations/0013_customer_identity_spine.sql` | Adds 'shipstation' to enum, unique constraints, indexes |
| `src/jobs/syncQboCustomers.ts` | Syncs QBO customers with structured JSON cursor |
| `src/jobs/syncShopifyCustomers.ts` | Syncs Shopify customers via GraphQL |
| `src/jobs/syncAmazonCustomers.ts` | Derives customers from Amazon orders (address hash fallback) |
| `src/jobs/syncShipstationCustomers.ts` | Derives customers from ShipStation shipments |
| `src/jobs/syncCustomers.ts` | Orchestrator: runs all syncs in order |
| `tests/integration/identityResolution.test.ts` | Integration tests for identity matching |
| `tests/integration/customerSync.test.ts` | Integration tests for sync idempotency |

### Modified Files

| File | Changes |
|------|---------|
| `src/db/schema.ts` | Added 'shipstation' to providerEnum |
| `src/services/crm/identityService.ts` | Added computeAddressHash, resolveCustomerAdvanced, improveCustomerPrimaries, ensureIdentityLinked, upsertCustomerWithMetrics |
| `src/jobs/ragSync.ts` | Calls syncCustomers() BEFORE order/shipment sync |

## Key Functions in identityService.ts

```typescript
// Normalize identifiers
normalizeEmail('  John.Doe@GMAIL.com  ') // → 'john.doe@gmail.com'
normalizePhone('+1 (512) 555-1234')      // → '5125551234'
computeAddressHash(address)               // → 'a1b2c3...' (SHA-256)

// Resolution with ambiguity detection
const result = await identityService.resolveCustomerAdvanced(
  { provider: 'amazon', externalId: 'order123', email: null },
  { name: 'John Doe', address1: '123 Main St', ... }
);
// Returns: { customer, isNew, isAmbiguous, matchedBy, ambiguousCustomerIds }

// Upsert with metrics
const { customerId, action } = await identityService.upsertCustomerWithMetrics(
  { provider: 'shopify', externalId: 'cust_123', email: 'john@example.com' }
);
// action: 'created' | 'updated' | 'linked' | 'ambiguous'
```

## Sync Order (Important!)

Syncs run in this order because more authoritative sources should create customers first:

```
1. QBO        ← Primary source of truth (existing business customers)
2. Shopify    ← Ecommerce customers with full profile
3. Amazon     ← May lack email, uses address hash
4. ShipStation ← Derived from shipments, links to orders
```

## Database Constraints

The migration adds critical safety constraints:

```sql
-- Prevents duplicate identities
CREATE UNIQUE INDEX uq_customer_identities_provider_external
ON customer_identities (provider, external_id)
WHERE external_id IS NOT NULL;

-- Prevents empty/useless identity rows
ALTER TABLE customer_identities
ADD CONSTRAINT chk_customer_identities_has_identifier
CHECK (external_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);
```

## Commands

```bash
# Run migration
psql $DATABASE_URL -f src/db/migrations/0013_customer_identity_spine.sql

# Run customer sync (incremental)
npx tsx src/jobs/syncCustomers.ts

# Run customer sync (full re-sync)
npx tsx src/jobs/syncCustomers.ts --full

# Check identity linking stats
psql $DATABASE_URL -c "
SELECT ci.provider, COUNT(DISTINCT ci.customer_id) as customers, COUNT(*) as identities
FROM ticketing_prod.customer_identities ci
GROUP BY ci.provider;
"

# Check address hash identities (Amazon/ShipStation fallback)
psql $DATABASE_URL -c "
SELECT provider, COUNT(*) as address_hash_identities
FROM ticketing_prod.customer_identities
WHERE external_id LIKE 'address_hash:%'
GROUP BY provider;
"

# Run tests
npx jest tests/integration/identityResolution.test.ts --runInBand
```

## What's Left To Do

1. **Run the migration** in production
2. **Run initial full sync** to populate customer identities
3. **Monitor ambiguous matches** - they're logged but need manual review
4. **Backfill orders.customerId** - existing orders need linking to customers
5. **Add UI** for viewing customer across all platforms

## Gotchas / Things to Know

1. **Never auto-merge ambiguous matches** - If 2+ customers share an email/phone, we log a warning and return `isAmbiguous=true`. Manual review required.

2. **Address hash includes address2** - Apt/suite number distinguishes customers at same street address. This was added because without it, all customers in the same apartment building would merge.

3. **Postal code normalization strips leading zeros** - `'01234'` becomes `'1234'` for matching purposes. This increases match rate but has tiny collision risk.

4. **Customer primaries improve over time** - When we match an existing customer and learn their email (that we didn't have), we update `customer.primaryEmail`.

5. **Sync is idempotent** - Running sync twice should produce identical results. Tests verify this.

## Metrics Tracking

Each sync job returns metrics:

```typescript
interface SyncMetrics {
  fetched: number;   // Total records processed
  created: number;   // New customers created
  updated: number;   // Existing customers updated
  linked: number;    // New identity linked to existing customer
  ambiguous: number; // Skipped due to ambiguity
  errors: number;    // Errors encountered
}
```

## Contact

This was built in December 2024 as part of the CRM identity spine work. The core logic lives in `src/services/crm/identityService.ts`.
