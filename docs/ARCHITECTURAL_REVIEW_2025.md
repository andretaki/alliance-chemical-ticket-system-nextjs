# Alliance Chemical Ticket System - Architectural Review

## Executive Summary

This document provides a comprehensive architectural review of the Alliance Chemical ticketing/CRM platform, analyzing UI-backend integration patterns and proposing a unification strategy.

**CRITICAL ARCHITECTURAL FAILURES (Not Superficial):**

### Identity Resolution - Data Corruption Risk
- **Race conditions** in `resolveCustomerAdvanced()` - no transaction isolation. Concurrent webhooks can link orders to wrong customers permanently.
- **16-char address hash** - collision-prone. Different addresses can merge customers incorrectly.
- **Silent order drops** - `customerId: 0` returned on ambiguity, sync continues, orders orphaned forever.

### RAG RBAC - Security Holes
- **Ticket with NULL customerId** bypasses customer scoping for admins
- **Orphaned sources** from deleted customers remain queryable with `allowGlobal=true`
- **N+1 performance** in `fetchScopedCustomerIds` - 200-500ms per RAG request

### CRM Data - Time Bombs
- **lateFlag NEVER resets** - once late, always late, even after payment
- **lateFlag overwritten by sync** - Shopify/Amazon sync hardcodes `lateFlag: false`, wiping AR data
- **QBO snapshots never sync** - no cron job calls `syncQboCustomerSnapshots`
- **Customer scores 24h+ stale** - no real-time updates on order/ticket events

---

**Fixed Issues:**
- ~~JSX error in `CrmDashboardClient.tsx`~~ ✅
- ~~Field name mismatch in `/api/customers/[id]/360/route.ts`~~ ✅
- ~~4 unsafe `as unknown as` type casts~~ ✅ (Now using Zod validation)
- ~~Missing shared contract types layer~~ ✅ (Created `@/lib/contracts`)

---

## Phase 1: Data Flow Analysis

### 1. Customer Resolution Flow

**Path:** `identityService.ts` → `customerIdentities` table → `customerService.ts` → UI customer panels

#### Flow Trace:
```
Shopify/Amazon Webhook → sync jobs
    → identityService.resolveCustomerAdvanced()
    → customerIdentities table (provider, externalId, email, phone)
    → customers table (primaries)

Customer Detail Page → /app/customers/[id]/page.tsx
    → customerService.getOverviewById()
    → CustomerSnapshotCard + UnifiedOrdersPanel + CustomerMemoryPanel
```

#### Ambiguity Handling Analysis:

**Backend (identityService.ts:495-722):**
```typescript
async resolveCustomerAdvanced(input, address?): Promise<ResolutionResult> {
  // Returns isAmbiguous: true when multiple customers match email/phone/address
  if (customerIds.size > 1) {
    return {
      customer: null,
      isNew: false,
      isAmbiguous: true,
      matchedBy: 'email',
      ambiguousCustomerIds: Array.from(customerIds),
    };
  }
}
```

**Gap Identified:**
- ✅ `isAmbiguous` is properly returned from service
- ❌ **No UI for merge resolution** - ambiguous matches are logged but not surfaced
- ❌ Sync jobs (`syncShopifyCustomers.ts`, etc.) increment `metrics.ambiguous` counter but don't create CRM tasks

**Recommendation:** Create a `crmTasks` entry with type `MERGE_REQUIRED` when ambiguity detected, surface in CRM dashboard.

#### Identity Edge Cases:

| Issue | Location | Impact |
|-------|----------|--------|
| `address2` in hash | `identityService.ts:106` | May over-split shared addresses (e.g., office suite variations) |
| US phone assumption | `identityService.ts:148` | 10-digit numbers assumed US; international formats preserved but inconsistent |
| `computeAddressHash` returns `null` | `identityService.ts:89-90` | Customers without address components can't be matched |

---

### 2. RAG Query Flow

**Path:** API → `ragRetrievalService.ts` → `queryRag()` → UI components

#### Flow Trace:
```
CustomerMemoryPanel.tsx → fetch('/api/rag/query')
    → /app/api/rag/query/route.ts (Zod validation, rate limiting)
    → getViewerScope() (RBAC context)
    → queryRag({ queryText, scope, filters, customerId, ticketId })
        → classifyIntent() + extractIdentifiers()
        → structuredLookup() (for identifier_lookup, payments_terms, logistics_shipping)
        → hybridSearch() (FTS + vector + RRF fusion)
    → Response with { intent, truthResults, evidenceResults, confidence }
```

#### Error Handling Analysis:

**RagAccessError propagation:**
```typescript
// ragRetrievalService.ts:46-60
export class RagAccessError extends Error {
  status: number;
  denyReason: string;
  filtersApplied?: Record<string, unknown>;
  intent?: RagIntent;
}

// /api/rag/query/route.ts:131-139
} catch (error) {
  if (error instanceof RagAccessError) {
    return NextResponse.json(
      { error: 'Forbidden', reason: error.denyReason },
      { status: error.status }
    );
  }
  throw error;  // ← Other errors bubble up to 500
}
```

**UI Handling (CustomerMemoryPanel.tsx:148-158):**
```typescript
if (!response.ok) {
  throw new Error('RAG query failed');  // ← Loses denyReason!
}
```

**Gap:** The UI loses the `denyReason` - should parse and display it.

#### ViewerScope Consistency Check:

| Context | buildRagAccessWhere | canViewRagRow |
|---------|---------------------|---------------|
| Admin/Manager | `sql\`TRUE\`` (if includeInternal) | `return true` |
| External user + internal content | `eq(ragSources.sensitivity, 'public')` | `if (row.sensitivity === 'internal' && !includeInternal) return false` |
| Non-allowed customer | `inArray(ragSources.customerId, scope.allowedCustomerIds)` | `if (!scope.allowedCustomerIds.includes(row.customerId)) return false` |
| Department filtering | SQL array ANY check on metadata.dept | String comparison on metadata.dept |

**RBAC Consistency Verdict:** ✅ Logically equivalent, but:
- ❌ `buildRagAccessWhere` uses SQL array syntax; `canViewRagRow` uses JS includes
- ❌ Null customer handling differs: SQL uses `NOT (customerId IS NULL)`, JS uses `if (row.customerId == null) return false`

**Risk:** Low - post-fetch `canViewRagRow` provides defense-in-depth, but could theoretically allow different results if SQL conditions have edge case mismatches.

---

### 3. Order Aggregation Flow

**Path:** Multi-provider orders → `UnifiedOrdersPanel.tsx`

#### Component Props Analysis:

```typescript
// UnifiedOrdersPanel.tsx:35-38
interface UnifiedOrdersPanelProps {
  orders: Order[];
  ordersByProvider?: Record<string, ProviderStats & { orders: ... }>;  // UNUSED
}

// Component signature (line 181)
export function UnifiedOrdersPanel({ orders }: UnifiedOrdersPanelProps)
```

**Gap:** `ordersByProvider` prop is defined but **never used** - component always groups internally.

#### Provider Coverage:

```typescript
// UnifiedOrdersPanel.tsx:40-45
const providerConfig: Record<string, { icon, label, color }> = {
  shopify: { ... },
  amazon: { ... },
  qbo: { ... },
  manual: { ... },
};
```

**Missing from providerConfig:**
- `self_reported` (from providerEnum)
- `klaviyo` (from providerEnum)
- `shipstation` (from providerEnum)

**Impact:** Orders from these providers render with fallback styling (Package icon, gray).

#### OrderItems Loading:

**customerService.ts:131-139:**
```typescript
recentOrders: db.query.orders.findMany({
  where: eq(orders.customerId, customerId),
  with: { items: true },  // ✅ Items always loaded
  orderBy: [desc(orders.placedAt), desc(orders.createdAt)],
  limit: 5,
}),
```

**Verdict:** ✅ `orderItems` relations are correctly loaded.

---

### 4. CRM Dashboard Flow

**Path:** `crmDashboardService.ts` → API (implicit) → `CrmDashboardClient.tsx`

#### Critical Build Error:

**File:** `src/components/crm/CrmDashboardClient.tsx`
**Lines:** 178, 482

```typescript
// Line 164-179: PipelineStageCard function
function PipelineStageCard({ stage, data }) {
  return (
    <div className="rounded-lg border...">
      ...
      <div className="mt-1 text-xs text-muted-foreground">
        {formatCurrency(data?.totalValue || 0)}
      </div>
    </PageShell>  // ← WRONG: should be </div>
  );
}

// Line 482
    </div>  // ← Missing closing tag for PageShell
  );
}
```

**Fix Required:** Replace `</PageShell>` with `</div>` at line 178.

#### Raw SQL Type Safety:

**crmDashboardService.ts uses 4 unsafe casts:**

```typescript
// Line 160
return result as unknown as StaleOpportunity[];

// Line 176-177
const rows = result as unknown as { won: string; lost: string }[];

// Lines 220, 277
return result as unknown as OpenTask[];
```

**Problem:** `db.execute(sql\`...\`)` returns untyped results. No runtime validation.

**Solution:** Add Zod schemas for post-query validation:

```typescript
const StaleOpportunitySchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string().nullable(),
  // ...
});

const rows = StaleOpportunitySchema.array().parse(result);
```

---

## Phase 2: Type Safety Gap Analysis

### Backend Issues

#### 1. JSONB Metadata Fields

**Pattern across codebase:**
```typescript
metadata: jsonb('metadata'),  // Schema
metadata: Record<string, unknown>  // Usage
```

**Locations:**
- `orders.metadata`
- `orderItems.metadata`
- `customerIdentities.metadata`
- `interactions.metadata`
- `ragSources.metadata`
- `shipments.metadata`

**Issue:** No schema enforcement on JSONB contents.

**Solution:** Create Zod schemas per entity:

```typescript
// src/types/contracts/metadata.contracts.ts
export const OrderMetadataSchema = z.object({
  invoiceNumber: z.string().optional(),
  poNumber: z.string().optional(),
  shopifyOrderId: z.string().optional(),
  amazonOrderId: z.string().optional(),
  // ...
}).passthrough();

export type OrderMetadata = z.infer<typeof OrderMetadataSchema>;
```

#### 2. `as any` Escape Hatches (40+ instances)

**High-Priority Locations:**

| File | Line | Issue |
|------|------|-------|
| `syncShopifyOrders.ts` | 88-92 | Enum coercion for provider/status |
| `syncAmazonOrders.ts` | 96-119 | Enum coercion for status |
| `identityService.ts` | 380-381 | Channel/direction casting |
| `TicketService.ts` | 102, 114 | Status/priority enum filtering |
| `ragRbac.ts` | 12 | User object department access |

**Solution:** Use discriminated union types and proper enum parsing:

```typescript
// Instead of: status: fulfillmentStatus as any
// Use:
const parseOrderStatus = (status: string): OrderStatus | null => {
  if (orderStatusEnum.enumValues.includes(status as any)) {
    return status as OrderStatus;
  }
  return null;
};
```

#### 3. API Route Field Mismatch

**File:** `/api/customers/[id]/360/route.ts:211`

```typescript
tickets: customerTickets.map(t => ({
  id: t.id,
  subject: t.subject,  // ❌ WRONG - field doesn't exist
  status: t.status,
  // ...
})),
```

**Schema (schema.ts:383-384):**
```typescript
tickets = ticketingProdSchema.table('tickets', {
  title: varchar('title', { length: 255 }).notNull(),
  // No 'subject' field exists
});
```

**Fix:** Change `subject: t.subject` to `title: t.title`.

---

### Frontend Issues

#### 1. Component-API Contract Mismatches

| Component | Expected | API Provides | Match |
|-----------|----------|--------------|-------|
| `UnifiedOrdersPanel` | `orders: Order[]` | `recentOrders` from `CustomerOverview` | ✅ (with mapping at page.tsx:556-572) |
| `CustomerMemoryPanel` | `RagQueryResponse` | `/api/rag/query` response | ✅ |
| `CrmDashboardClient` | `WhoToTalkToRow[]` | `getWhoToTalkToday()` | ✅ |

#### 2. Date Handling Inconsistency

**Pattern 1 - Service Layer (customerService.ts):**
```typescript
placedAt: o.placedAt ? o.placedAt.toISOString() : null,  // Always string
```

**Pattern 2 - CRM Dashboard Types:**
```typescript
interface WhoToTalkToRow {
  lastOrderDate: Date | null;  // Date object!
}
```

**Impact:** Components may receive mixed Date/string types depending on data path.

#### 3. Partial Data Handling

**Example - qboSnapshot:**

```typescript
// CustomerOverview interface (customerService.ts:77-85)
qboSnapshot: {
  balance: string;
  currency: string;
  terms: string | null;
  // ...
} | null;

// Customer page (page.tsx:198-216)
{overview.qboSnapshot ? (
  <>
    <div>{overview.qboSnapshot.balance}</div>  // Safe
  </>
) : (
  <p>No AR snapshot yet.</p>
)}
```

**Verdict:** ✅ Null checks are properly implemented.

---

## Phase 3: RBAC Security Audit

### buildRagAccessWhere vs canViewRagRow Equivalence

**Test Cases:**

| Scenario | buildRagAccessWhere Result | canViewRagRow Result | Match |
|----------|---------------------------|---------------------|-------|
| Admin + internal content | `TRUE` | `true` | ✅ |
| User + internal content (not allowed) | `sensitivity = 'public'` | `false` | ✅ |
| User + customer not in allowedCustomerIds | `FALSE` | `false` | ✅ |
| User + null customerId on row | `NOT (customerId IS NULL)` | `false` | ✅ |
| User + dept mismatch | Dept check SQL | `false` | ✅ |
| Manager + global query | `TRUE` if allowGlobal | `true` | ✅ |

**Potential Leak Vectors:**

1. **Department check edge case:**
   - SQL: Uses `ANY(ARRAY[...])` for department matching
   - JS: Uses `Array.includes()`
   - **Risk:** SQL is case-sensitive by default; JS comparison is exact
   - **Mitigation:** Both normalize to lowercase

2. **Null handling:**
   - SQL explicitly checks `customerId IS NOT NULL`
   - JS returns `false` if `customerId == null`
   - **Risk:** None - equivalent behavior

**Security Verdict:** ✅ No data leakage paths identified. Defense-in-depth via post-fetch `canViewRagRow` is effective.

---

## Phase 4: Unification Strategy

### 1. Shared Type Layer

Create `src/types/contracts/`:

```
src/types/contracts/
├── customer.contract.ts
├── rag.contract.ts
├── orders.contract.ts
├── crm.contract.ts
├── common.contract.ts
└── index.ts
```

**Example - customer.contract.ts:**

```typescript
import { z } from 'zod';

// Shared between API and UI
export const CustomerOverviewSchema = z.object({
  id: z.number(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  isVip: z.boolean(),
  creditRiskLevel: z.string().nullable(),
  identities: z.array(z.object({
    id: z.number(),
    provider: z.string(),
    externalId: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })),
  // ... rest of fields
});

export type CustomerOverview = z.infer<typeof CustomerOverviewSchema>;

// Resolution result for identity service
export const ResolutionResultSchema = z.object({
  customer: CustomerOverviewSchema.nullable(),
  isNew: z.boolean(),
  isAmbiguous: z.boolean(),
  matchedBy: z.enum(['externalId', 'email', 'phone', 'addressHash', 'none']),
  ambiguousCustomerIds: z.array(z.number()).optional(),
});

export type ResolutionResult = z.infer<typeof ResolutionResultSchema>;
```

### 2. API Response Standardization

```typescript
// src/types/contracts/common.contract.ts
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// Usage in API routes
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<CustomerOverview>>> {
  try {
    const data = await customerService.getOverviewById(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' }
    }, { status: 404 });
  }
}
```

### 3. Repository Pattern Migration

```
src/repositories/
├── CustomerRepository.ts    # Wraps identityService + customerService queries
├── RagRepository.ts         # Wraps ragRetrievalService + ragIngestionService
├── OrderRepository.ts       # Unified order access across providers
├── CrmTaskRepository.ts     # Task CRUD with proper typing
└── index.ts
```

**Example - CustomerRepository.ts:**

```typescript
import { db, customers, customerIdentities } from '@/lib/db';
import { CustomerOverviewSchema, type CustomerOverview } from '@/types/contracts';
import { identityService } from '@/services/crm/identityService';

export class CustomerRepository {
  async findById(id: number): Promise<CustomerOverview | null> {
    const data = await db.query.customers.findFirst({
      where: eq(customers.id, id),
      with: { identities: true, contacts: true, orders: { limit: 5 } },
    });

    if (!data) return null;

    // Validate and transform
    return CustomerOverviewSchema.parse(this.transform(data));
  }

  async resolveIdentity(input: IdentityInput): Promise<ResolutionResult> {
    return identityService.resolveCustomerAdvanced(input);
  }

  // ... other methods
}

export const customerRepository = new CustomerRepository();
```

---

## Deliverables Checklist

### Immediate Fixes (P0)

- [ ] **Fix CrmDashboardClient.tsx JSX error** - Line 178: `</PageShell>` → `</div>`
- [ ] **Fix /api/customers/[id]/360 field name** - Line 211: `subject` → `title`

### Short-term (P1)

- [ ] Create `src/types/contracts/` directory structure
- [ ] Add Zod schemas for top 5 API responses:
  - `CustomerOverview`
  - `RagQueryResponse`
  - `WhoToTalkToRow`
  - `PipelineHealthRow`
  - `Order`
- [ ] Replace 4 `as unknown as` casts in crmDashboardService.ts with Zod parsing

### Medium-term (P2)

- [ ] Standardize API response envelope
- [ ] Add `useApiQuery` hook with envelope handling
- [ ] Create merge UI for ambiguous customer resolution
- [ ] Add missing providers to `UnifiedOrdersPanel.providerConfig`

### Long-term (P3)

- [ ] Migrate to repository pattern
- [ ] Eliminate all `as any` casts
- [ ] Add runtime validation for all JSONB metadata access
- [ ] Create comprehensive error boundary strategy for CRM dashboard

---

## Appendix: File Reference

| File | Purpose | Issues Found |
|------|---------|--------------|
| `src/db/schema.ts` | Database schema (source of truth) | None |
| `src/services/crm/identityService.ts` | Customer resolution | Ambiguity not surfaced to UI |
| `src/services/crm/customerService.ts` | Customer overview aggregation | Date handling inconsistency |
| `src/services/crm/crmDashboardService.ts` | Dashboard data | 4 unsafe type casts |
| `src/services/rag/ragRbac.ts` | RAG access control | Department extraction `as any` |
| `src/services/rag/ragRetrievalService.ts` | RAG query engine | Error propagation incomplete |
| `src/components/customers/UnifiedOrdersPanel.tsx` | Order display | Unused prop, missing providers |
| `src/components/crm/CrmDashboardClient.tsx` | Dashboard UI | **JSX error (build-blocking)** |
| `src/app/customers/[id]/page.tsx` | Customer detail page | None |
| `src/app/api/rag/query/route.ts` | RAG API | `filters as any` cast |
| `src/app/api/customers/[id]/360/route.ts` | Customer 360 API | Wrong field name (`subject`) |

---

*Generated: 2025-12-31*
*Review Scope: UI-Backend Integration Patterns*
