# Launch Tasks (Actionable)

Owners are suggested by role; adjust as needed.

## P0 (Blockers)
- Done: Ticket reply submission now uploads attachments first and posts JSON to `/api/tickets/[id]/reply`. Owner: Backend + Frontend. ETA: 1–2 days.
- Re-enable email replies or update UI to reflect “comment only” mode. Owner: Backend. ETA: 0.5–1 day.
- Implement inbound email processing endpoint (`/api/process-emails`) or remove UI entry points. Owner: Backend. ETA: 2–3 days.
- Add admin email tooling endpoints (`/api/admin/subscriptions`, `/api/admin/debug/test-graph-api`) or remove Graph UI panels. Owner: Backend. ETA: 1–2 days.
- Done: AI draft response shape + method mismatch resolved in UI. Owner: Backend + Frontend. ETA: 0.5–1 day.
- Decide Shopify ingestion path: add webhook or schedule `syncCustomers` + `syncShopifyOrders` in cron. Owner: Backend. ETA: 1–2 days.
- Resolve QBO status: implement estimates + token storage or disable routes. Owner: Backend. ETA: 1–2 days.
- Fix email attachments: read blobs by URL (not `fs.readFile`) when sending emails. Owner: Backend. ETA: 0.5–1 day.
- Clean cron config: remove `/api/cron/process-resolutions` or implement it; add missing schedules if needed. Owner: Ops/Backend. ETA: 0.25–0.5 day.
- Implement or remove resolution dashboard APIs (`/api/admin/resolution-metrics`, `/api/admin/resolution-config`, `/api/admin/resolved-tickets`). Owner: Backend + Frontend. ETA: 1–2 days.

## P1 (High Priority)
- Normalize env var names across `src/lib/env.ts`, `.env.example`, `src/config/appConfig.ts`, and Shopify/QBO routes. Owner: Backend/Ops. ETA: 0.5–1 day.
- Add ShipStation optional handling (don’t hard-fail when not configured). Owner: Backend. ETA: 0.5 day.
- Update robots/sitemap/security.txt domains and remove non-existent routes from sitemap. Owner: Ops/Frontend. ETA: 0.25–0.5 day.
- Extend `/api/health` to check KV/Blob/Graph and surface integration readiness. Owner: Backend. ETA: 0.5–1 day.

## P2 (Nice to Have)
- Replace toast stub or standardize on Sonner vs react-hot-toast (mount one Toaster). Owner: Frontend. ETA: 0.25–0.5 day.
- Remove mocked notifications/active users in ticket header or gate behind a feature flag. Owner: Frontend. ETA: 0.25 day.
- Document realtime SSE limitation or move to shared pub/sub. Owner: Backend. ETA: 0.5 day.
