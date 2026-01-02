# Shopify to Customer Detail Flow

## Ingestion Entry Point
- There is no Shopify webhook route in the app. Inbound Shopify data currently enters via scheduled/manual sync jobs (`src/jobs/syncShopifyCustomers.ts`, `src/jobs/syncShopifyOrders.ts`) invoked by `src/jobs/ragSync.ts` or CLI execution.
- `vercel.json` does not schedule any Shopify/customer sync route, so production freshness depends on manual runs unless you add a cron/worker.

## Customer Identity Sync (Shopify Customers)
1. `syncCustomers()` (`src/jobs/syncCustomers.ts`) orchestrates provider order: QBO → Shopify → Amazon → ShipStation.
2. `syncShopifyCustomers()` (`src/jobs/syncShopifyCustomers.ts`) fetches Shopify customers via GraphQL.
3. Each Shopify customer is upserted through `identityService.upsertCustomerWithMetrics()` (`src/services/crm/identityService.ts`), which:
   - Creates/updates `customers`.
   - Writes `customerIdentities` rows with provider metadata.
   - Tracks ambiguous matches and can create merge tasks (MERGE_REVIEW / MERGE_REQUIRED).

## Order Sync (Shopify Orders)
1. `syncShopifyOrders()` (`src/jobs/syncShopifyOrders.ts`) fetches orders via `ShopifyService.fetchOrdersPage()`.
2. For each order:
   - `identityService.upsertCustomerWithMetrics()` resolves or creates the customer (ambiguous matches flagged).
   - Order is upserted into `orders` with provider `shopify`.
   - Line items are refreshed in `order_items`.
3. Cursor state is stored in `ragSyncCursors` for incremental sync.

## Customer Detail Page (UI)
1. `src/app/customers/[id]/page.tsx` loads `customerRepository.getOverviewById()` (via `customerService`).
2. `CustomerRepository` composes:
   - `customers` + `customerIdentities`.
   - `orders` + `order_items`.
   - `tickets`, `crm_tasks`, `interactions`, `qbo_customer_snapshots`.
3. UI components:
   - `UnifiedOrdersPanel` shows `overview.recentOrders`.
   - `CustomerSnapshotCard` displays profile stats.
   - `CustomerMemoryPanel` calls RAG endpoints for history and shows access errors.
   - `CustomerMergeReviewPanel` appears when merge tasks exist.

## Known Gaps for MVP
- No Shopify webhook or scheduled sync route means new orders/customers are not ingested automatically.
- Env var drift can block Shopify API access (`Config.shopify` uses `SHOPIFY_STORE`/`SHOPIFY_ACCESS_TOKEN` while other code expects `SHOPIFY_STORE_URL`/`SHOPIFY_ADMIN_ACCESS_TOKEN`).
