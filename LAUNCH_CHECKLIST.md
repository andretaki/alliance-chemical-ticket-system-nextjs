# Launch Checklist (MVP)

## Must-Haves
- Align env var naming across `src/lib/env.ts`, `.env.example`, `src/config/appConfig.ts`, and routes that read Shopify/QBO/Graph variables.
- Decide on Shopify ingestion: add a webhook or schedule `syncCustomers` + `syncShopifyOrders` (no cron exists today).
- Fix attachment email sending (Vercel Blob URLs vs `fs.readFile`) so replies with attachments work.
- Clean up cron config: remove `/api/cron/process-resolutions` or implement it; add schedules for required cron endpoints (e.g., QBO sync, SLA checks, customer scores) if you rely on them.
- QBO readiness: either disable `/api/qbo/estimates` or implement it; move token storage out of local filesystem (`src/lib/qboTokenStore.ts`).
- Update `robots`, `sitemap`, and `security.txt` domains and remove non-existent pages from sitemap.

## Strongly Recommended
- Add missing env vars to schema/docs: `CREDIT_APP_API_KEY`, `SHOPIFY_*`, `SLA_ALERT_EMAIL`, `INTERNAL_EMAIL_DOMAIN`, `SHIPSTATION_API_ENDPOINT`, `CREDIT_APPLICATION_URL`, `SALES_TEAM_EMAIL`, `NEXT_PUBLIC_SHOPIFY_STORE_URL`.
- Add dependency health checks (KV, Blob, Graph, Shopify, ShipStation) to `/api/health`.
- Replace toast stub and remove mocked ticket header notifications.
- Decide on a plan for realtime SSE (single instance only) or document the limitation.

## Deferred by Choice (Auth/RBAC)
- Auth bypass in middleware/client helpers, and API routes without access checks.
- Ticket comments access rules and QBO OAuth gating.

## Verification Steps
- `npm run typecheck`
- Smoke check: `/api/health`, `/api/cron/outbox` (with CRON_SECRET), `/api/cron/sync-products` (with CRON_SECRET).
- Manual data check: run `syncCustomers` + `syncShopifyOrders` and verify a customer detail page has orders/tasks.
