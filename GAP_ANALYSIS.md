# Gap Analysis

## Type mismatches
- Resolved: `CustomerOverview` contract vs service shape (missing recent orders, tasks, counts, QBO dates). Now aligned in `src/lib/contracts/customer.contracts.ts` and `src/repositories/CustomerRepository.ts`.
- Resolved: `UnifiedOrdersPanel` props expected `externalId` while `customerService` omitted it. Now populated in `src/repositories/CustomerRepository.ts` and passed directly in `src/app/customers/[id]/page.tsx`.
- Resolved: Order provider/status/financial enums in contracts diverged from DB enums. Contracts now align to `provider_enum`, `order_status_enum`, `financial_status_enum` in `src/lib/contracts/orders.contracts.ts`.
- Resolved: RAG contracts (`RagSourceType`, `RagSensitivity`) diverged from DB enums and `ragTypes`. Contracts now align to `rag_source_type` and `rag_sensitivity` in `src/lib/contracts/rag.contracts.ts`.
- Resolved: CRM task type enum mismatch (`MERGE_REQUIRED` vs `MERGE_REVIEW`). Contract now includes both and UI maps both in `src/lib/contracts/crm.contracts.ts`.
- Remaining: `ResolutionResultSchema` in `src/lib/contracts/customer.contracts.ts` still models `customerId` only, while `IdentityService.resolveCustomerAdvanced` returns a full `customer` object. Consider adding a contract for the customer shape or returning `customerId` consistently.

## Unhandled error paths
- Resolved: `/api/rag/query`, `/api/rag/similar-tickets`, `/api/rag/similar-replies` previously returned mixed error shapes and leaked access-denied details. Now standardized via `ApiResponse` envelope and explicit error handling in their routes.
- Resolved: Tasks complete/dismiss endpoints returned ad-hoc payloads; now standardized with `ApiResponse` in `src/app/api/tasks/[id]/*`.
- Remaining: Many `/api` routes still return non-envelope payloads and may throw uncaught errors (notably `/api/tickets`, `/api/orders/search`, `/api/customers/[id]/360`, `/api/draft-orders`). These should be migrated to the envelope and wrapped in consistent try/catch.
- Remaining: `CustomerMergeReviewPanel` marks tasks complete after merge but doesn't handle a failure response from `/api/tasks/[id]/complete`.

## RBAC inconsistencies
- Resolved: `buildRagAccessWhere` compared `metadata.dept` case-sensitively while `canViewRagRow` lowercased it. SQL now uses `LOWER(...)` in `src/services/rag/ragRbac.ts`.
- By design: `canViewRagRow` is row-level and does not encode the "global query disallowed without context" check performed in `buildRagAccessWhere`.

## Shopify customer resolution flow trace
1. **Ingestion trigger**: No Shopify webhook route is present; customer/order data enters via jobs (`src/jobs/syncShopifyCustomers.ts`, `src/jobs/syncShopifyOrders.ts`) invoked by the sync orchestrators or cron.
2. **Identity resolution**:
   - `syncShopifyCustomers` calls `identityService.upsertCustomerWithMetrics` (now also exposed via `CustomerRepository`).
   - `syncShopifyOrders` calls `identityService.resolveOrCreateCustomer`, then upserts orders/items in `orders`/`order_items`.
3. **Customer 360 page**:
   - `src/app/customers/[id]/page.tsx` calls `customerService.getOverviewById` -> `customerRepository.getOverviewById`.
   - The repository composes data from `customers`, `customer_identities`, `orders`, `tickets`, `crm_tasks`, etc., and feeds `UnifiedOrdersPanel`, `CustomerSnapshotCard`, and `CustomerMemoryPanel`.
