# Architecture Deep Dive v2.1 (Evidence-Driven)

Scope: alliance-chemical-ticket-system-nextjs. Evidence is drawn from repo files only; no assumptions beyond code.

## 1) Executive Summary (10-15 bullets)
- Win: Outbox decouples async side effects from request path. Proof: `src/services/TicketService.ts`, `src/services/outboxService.ts`, `src/jobs/outboxProcessor.ts`, `src/app/api/cron/outbox/route.ts`. Impact: faster ticket creation and fewer user-facing failures. Fix: extend outbox to email and Shopify side effects.
- Win: RAG query path has RBAC + caching + rate limiting. Proof: `src/app/api/rag/query/route.ts`, `src/services/rag/ragRbac.ts`, `src/lib/cache.ts`, `src/lib/rateLimiting.ts`. Impact: safer, faster retrieval. Fix: reuse this pattern for other AI endpoints.
- Win: Attachment uploads enforce size/type/signature checks. Proof: `src/app/api/tickets/[id]/attachments/route.ts`, `src/lib/security.ts`. Impact: reduces upload abuse. Fix: keep and reuse validation helpers.
- Liability: Auth bypass in middleware and server session helper. Proof: `src/middleware.ts`, `src/lib/auth-helpers.ts`. Impact: all auth-required routes effectively open. Fix: re-enable real session middleware and remove mocks.
- Liability: Several API routes skip auth entirely. Proof: `src/app/api/draft-orders/[id]/route.ts`, `src/app/api/draft-orders/search/route.ts`, `src/app/api/calls/[id]/route.ts`, `src/app/api/tickets/[id]/comments/route.ts`. Impact: data exposure and unauthorized updates. Fix: enforce session + access checks on these routes.
- Liability: Schema drift between `schema.ts` and migrations. Proof: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/migrations/0000_happy_thunderball.sql`, `src/db/migrations/0016_oauth_token_locks.sql`. Impact: runtime errors and missing columns in prod. Fix: reconcile schema/migrations and regenerate.
- Risk: Unauthenticated invoice email send. Proof: `src/app/api/email/send-invoice/route.ts`. Impact: spam and data leakage via Graph sender. Fix: require auth or signed token; add rate limiting.
- Risk: Unauthenticated product sync trigger. Proof: `src/app/api/sync-products/route.ts`. Impact: API abuse and DB churn. Fix: require CRON secret or admin auth.
- Risk: Email reply is disabled while UI defaults to send. Proof: `src/app/api/tickets/[id]/reply/route.ts` (`if (false && emailRequested)`), `src/components/ticket-view/ReplyComposer.tsx` (default `sendEmail=true`). Impact: silent customer communication failures. Fix: enable email or default `sendEmail=false` until ready.
- Risk: Attachment upload lacks ticket-level access check. Proof: `src/app/api/tickets/[id]/attachments/route.ts` (no `checkTicketModifyAccess`). Impact: authenticated user can attach to arbitrary ticket IDs. Fix: enforce ticket access before upload.
- Observation: PII logged in multiple routes. Proof: `src/app/api/orders/search/route.ts`, `src/app/api/shipstation/order-details/route.ts`, `src/app/api/draft-orders/route.ts`. Impact: compliance risk in logs. Fix: redact or remove PII logs.
- Observation: Some endpoints are stubs or intentionally failing. Proof: `src/app/api/qbo/estimates/route.ts`. Impact: unclear behavior for callers. Fix: return 501 and document expected behavior.

## 2) Route Inventory Matrix (ALL `src/app/api/**`)
Auth column reflects code checks (note: session is currently mocked in `src/lib/auth-helpers.ts`).

### Admin + Auth
| Path | Methods | Auth required? | Validation | Tables touched | Side effects | Rate limit | Notes / Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/customers` | GET,POST | yes (admin) | zod (POST) | none | Shopify create + addresses | admin (POST) | logs PII; `src/app/api/admin/customers/route.ts` |
| `/api/admin/customers/ai-suggestions` | GET,POST | yes (admin) | manual | none | AI suggestions | no | `src/app/api/admin/customers/ai-suggestions/route.ts` |
| `/api/admin/customers/auto-create` | GET,POST | yes (admin/manager) | manual | `tickets` | Shopify auto-create | no | `src/app/api/admin/customers/auto-create/route.ts` |
| `/api/admin/customers/import` | POST | yes (admin) | zod | `customers`, `customer_identities`, `customer_scores` | none | admin | `src/app/api/admin/customers/import/route.ts` |
| `/api/admin/rag/diagnostics` | GET | yes (admin) | none | `rag_ingestion_jobs`, `rag_chunks`, `rag_sync_cursors` | none | admin | `src/app/api/admin/rag/diagnostics/route.ts` |
| `/api/admin/rag/reindex` | POST | yes (admin) | zod | `tickets`, `ticket_comments`, `interactions`, `orders`, `qbo_*`, `shipstation_shipments`, `customer_identities` | enqueue RAG + external sync | admin | `src/app/api/admin/rag/reindex/route.ts` |
| `/api/admin/tickets/:id/reopen` | POST | yes (admin) | manual | `tickets`, `ticket_comments` | event emit | no | `src/app/api/admin/tickets/[id]/reopen/route.ts` |
| `/api/admin/users` | GET | yes (admin) | manual | `users` | none | no | `src/app/api/admin/users/route.ts` |
| `/api/admin/users/:userId/status` | POST | yes (admin/manager) | manual | `users` | none | no | `src/app/api/admin/users/[userId]/status/route.ts` |
| `/api/auth/*` | GET,POST | unknown (auth handler) | unknown | unknown | session cookies | auth/api | `src/app/api/auth/[...all]/route.ts` |
| `/api/auth/register` | POST | no | manual + security schemas | `users` | Graph email | auth | logs email; `src/app/api/auth/register/route.ts` |
| `/api/auth/user-role` | GET | yes (mocked) | none | `users` | none | no | bypass returns admin when no user; `src/app/api/auth/user-role/route.ts` |

### Tickets + CRM + Customers
| Path | Methods | Auth required? | Validation | Tables touched | Side effects | Rate limit | Notes / Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/tickets` | GET,POST | yes | zod (POST) | `tickets`, `users`, `outbox_jobs` | outbox enqueue | api | `src/app/api/tickets/route.ts`, `src/services/TicketService.ts` |
| `/api/tickets/:id` | GET,PUT,DELETE | yes | zod (PUT) | `tickets`, `users`, `ticket_comments` | email on assign; RAG delete | api (PUT/DELETE) | `src/app/api/tickets/[id]/route.ts` |
| `/api/tickets/:id/comments` | GET,POST | POST yes, GET no | zod (POST) | `ticket_comments`, `tickets`, `users` | none | no | GET lacks auth; `src/app/api/tickets/[id]/comments/route.ts` |
| `/api/tickets/:id/attachments` | POST | yes | manual | `ticket_attachments`, `tickets` | Vercel Blob upload | no | no ticket access check; `src/app/api/tickets/[id]/attachments/route.ts` |
| `/api/tickets/:id/reply` | POST | yes | manual | `ticket_comments`, `ticket_attachments`, `tickets` | email disabled | no | `src/app/api/tickets/[id]/reply/route.ts` |
| `/api/tickets/:id/draft-ai-reply` | POST | yes | manual | `tickets`, `ticket_comments`, `ticket_attachments`, `users` | AI reply | no | no ticket access check; `src/app/api/tickets/[id]/draft-ai-reply/route.ts` |
| `/api/tickets/:id/draft-order-status` | GET | yes | manual | `tickets` | ShipStation + AI | no | `src/app/api/tickets/[id]/draft-order-status/route.ts` |
| `/api/tickets/:id/merge` | POST | yes (admin/manager) | zod | `tickets`, `ticket_comments`, `ticket_attachments` | none | no | `src/app/api/tickets/[id]/merge/route.ts` |
| `/api/tickets/:id/reopen` | POST | yes | manual | `tickets`, `ticket_comments` | event emit | no | `src/app/api/tickets/[id]/reopen/route.ts` |
| `/api/tickets/:id/shipstation-live` | GET | no | manual | `tickets` | ShipStation API | no | unauthenticated; `src/app/api/tickets/[id]/shipstation-live/route.ts` |
| `/api/attachments/:id/download` | GET | yes | custom validator | `ticket_attachments` | Blob redirect | no | `src/app/api/attachments/[id]/download/route.ts` |
| `/api/canned-responses` | GET | yes | none | `canned_responses` | none | no | `src/app/api/canned-responses/route.ts` |
| `/api/signatures` | GET,POST | yes | zod | `user_signatures` | none | no | `src/app/api/signatures/route.ts` |
| `/api/signatures/:id` | PUT,DELETE | yes | zod (PUT) | `user_signatures` | none | no | `src/app/api/signatures/[id]/route.ts` |
| `/api/users` | GET | yes | none | `users` | none | no | `src/app/api/users/route.ts` |
| `/api/tasks/:id/complete` | POST | yes | manual | `crm_tasks` | none | no | `src/app/api/tasks/[id]/complete/route.ts` |
| `/api/tasks/:id/dismiss` | POST | yes | manual | `crm_tasks` | none | no | `src/app/api/tasks/[id]/dismiss/route.ts` |
| `/api/calls/:id` | GET,PATCH | no | zod (PATCH) | `calls` | none | no | unauthenticated; `src/app/api/calls/[id]/route.ts` |
| `/api/capture-self-id` | POST | no | zod | `customers`, `customer_identities`, `interactions` | none | api | `src/app/api/capture-self-id/route.ts` |
| `/api/credit-application/submit` | POST | yes (x-api-key) | zod | `users`, `tickets`, `outbox_jobs` | outbox enqueue | no | `src/app/api/credit-application/submit/route.ts` |
| `/api/customers/search` | GET | yes | zod | `customers`, `customer_identities` | Shopify + ShipStation | no | `src/app/api/customers/search/route.ts` |
| `/api/customers/:id/360` | GET | yes | zod | `customers`, `customer_identities`, `orders`, `order_items`, `shipments`, `tickets`, `interactions` | none | no | `src/app/api/customers/[id]/360/route.ts` |
| `/api/customers/merge` | POST | yes (admin/manager) | zod | many (merge) | none | no | `src/repositories/CustomerRepository.ts` |
| `/api/customers/:id/merge-candidates` | GET | yes (admin/manager) | manual | `customers`, `customer_identities` | none | no | `src/app/api/customers/[id]/merge-candidates/route.ts` |
| `/api/opportunities` | GET,POST | yes | zod (POST) | `opportunities`, `customers`, `contacts`, `users` | none | api | `src/app/api/opportunities/route.ts` |
| `/api/opportunities/:id` | GET,PUT | yes | zod (PUT) | `opportunities`, `customers`, `contacts`, `users` | none | api (PUT) | `src/app/api/opportunities/[id]/route.ts` |

### Commerce + Email + Shipping
| Path | Methods | Auth required? | Validation | Tables touched | Side effects | Rate limit | Notes / Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/orders/search` | GET | yes | manual | `tickets` | Shopify + ShipStation + KV | no | logs query; `src/app/api/orders/search/route.ts` |
| `/api/products/direct-search` | GET | yes | manual | none | Shopify API | no | logs query; `src/app/api/products/direct-search/route.ts` |
| `/api/products/search-variant` | GET | yes | manual | none | Shopify API | no | logs query; `src/app/api/products/search-variant/route.ts` |
| `/api/draft-orders` | POST | yes (admin/manager) | manual | `tickets` (via auto-create) | Shopify draft order | admin | logs request body; `src/app/api/draft-orders/route.ts` |
| `/api/draft-orders/:id` | GET | no | manual | none | Shopify API | no | unauthenticated; `src/app/api/draft-orders/[id]/route.ts` |
| `/api/draft-orders/search` | GET | no | manual | none | Shopify REST API | no | unauthenticated; `src/app/api/draft-orders/search/route.ts` |
| `/api/draft-orders/send-invoice` | POST | yes (admin/manager) | zod | none | Shopify send invoice | no | `src/app/api/draft-orders/send-invoice/route.ts` |
| `/api/shipping-rates/calculate` | POST | yes | manual | none | Shopify shipping calc | no | `src/app/api/shipping-rates/calculate/route.ts` |
| `/api/shipstation/order-details` | GET | yes | manual | none | ShipStation API | no | logs payload; `src/app/api/shipstation/order-details/route.ts` |
| `/api/shipstation/search-customer` | GET | yes | manual | none | ShipStation API | no | `src/app/api/shipstation/search-customer/route.ts` |
| `/api/shipstation/customer-orders` | GET | yes | manual | none | ShipStation API | no | `src/app/api/shipstation/customer-orders/route.ts` |
| `/api/email/send-invoice` | POST | no | manual | `ticket_comments` | PDF + Graph email + internal API call | no | unauthenticated; `src/app/api/email/send-invoice/route.ts` |
| `/api/email/send-estimate` | POST | yes | manual | none | email send | no | `src/app/api/email/send-estimate/route.ts` |
| `/api/sync-products` | POST | no | none | `agent_products`, `agent_product_variants` | Shopify sync | no | unauthenticated; `src/app/api/sync-products/route.ts` |
| `/api/qbo/auth/connect` | GET | no | none | none | QBO auth redirect | no | `src/app/api/qbo/auth/connect/route.ts` |
| `/api/qbo/auth/callback` | GET | no | none | none | QBO token exchange | no | `src/app/api/qbo/auth/callback/route.ts` |
| `/api/qbo/estimates` | POST | yes | manual | none | none (throws) | no | stub; `src/app/api/qbo/estimates/route.ts` |

### System + Cron + RAG + Telephony
| Path | Methods | Auth required? | Validation | Tables touched | Side effects | Rate limit | Notes / Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/health` | GET,HEAD | no | none | none (SELECT 1) | none | no | `src/app/api/health/route.ts` |
| `/api/realtime` | GET | no | none | none | SSE stream | no | `src/app/api/realtime/route.ts` |
| `/api/robots` | GET | no | none | none | none | no | `src/app/api/robots/route.ts` |
| `/api/sitemap` | GET | no | none | none | none | no | `src/app/api/sitemap/route.ts` |
| `/api/security-txt` | GET | no | none | none | none | no | `src/app/api/security-txt/route.ts` |
| `/api/cron/outbox` | GET | yes (CRON secret) | none | `outbox_jobs` | outbox processing | no | `src/app/api/cron/outbox/route.ts` |
| `/api/cron/ar-late` | GET | yes (CRON secret) | none | `orders`, `outbox_jobs` | enqueue AR jobs | no | `src/app/api/cron/ar-late/route.ts` |
| `/api/cron/check-slas` | GET | yes (CRON secret) | none | `tickets`, `crm_tasks` | email alert | no | `src/app/api/cron/check-slas/route.ts` |
| `/api/cron/sync-products` | GET | yes (CRON secret) | none | `agent_products`, `agent_product_variants` | Shopify sync | no | `src/app/api/cron/sync-products/route.ts` |
| `/api/cron/update-metrics` | GET | yes (CRON secret) | none | `ticket_comments` | KV update | no | `src/app/api/cron/update-metrics/route.ts` |
| `/api/cron/customer-scores` | GET | yes (CRON secret) | none | `orders`, `customer_scores`, `crm_tasks`, `opportunities` | DB updates | no | `src/app/api/cron/customer-scores/route.ts` |
| `/api/cron/sync-amazon` | GET | yes (CRON secret) | none | `orders` (via job) | Amazon SP sync | no | `src/app/api/cron/sync-amazon/route.ts` |
| `/api/cron/sync-qbo` | GET | yes (CRON secret) | none | `qbo_customer_snapshots`, `orders` | QBO sync | no | `src/app/api/cron/sync-qbo/route.ts` |
| `/api/rag/query` | POST | yes | zod | `rag_query_log` | cache + RAG retrieval | rag | `src/app/api/rag/query/route.ts` |
| `/api/rag/similar-tickets` | GET,POST | yes | zod | rag tables (repo) | none | rag | `src/app/api/rag/similar-tickets/route.ts` |
| `/api/rag/similar-replies` | GET,POST | yes | zod | rag tables (repo) | none | rag | `src/app/api/rag/similar-replies/route.ts` |
| `/api/telephony/3cx` | POST | header secret (optional) | zod | `calls`, `customers`, `contacts`, `customer_identities`, `interactions`, `tickets` | call record + interactions | no | `src/app/api/telephony/3cx/route.ts` |

## 3) Auth and Access Control Trace (end-to-end)
- Claim: Middleware bypasses auth and assigns admin user. Proof: hard-coded user + `isAuthenticated=true` in `src/middleware.ts`. Impact: UI routes protected by middleware are open. Fix: re-enable real auth middleware and remove bypass.
- Claim: Server session helper always returns mock session. Proof: `getServerSession` in `src/lib/auth-helpers.ts` returns `mockSession`. Impact: API route auth checks always pass. Fix: restore `auth.api.getSession` call and remove mock.
- Claim: Role endpoint returns admin when no session. Proof: `src/app/api/auth/user-role/route.ts`. Impact: UI can render admin views without auth. Fix: return 401 when session missing.
- Claim: Several routes have no per-route guard. Proof: no session checks in `src/app/api/calls/[id]/route.ts`, `src/app/api/draft-orders/[id]/route.ts`, `src/app/api/draft-orders/search/route.ts`, GET in `src/app/api/tickets/[id]/comments/route.ts`. Impact: data exposure, unauthorized updates. Fix: add session + access checks.
- Claim: Webhook auth is optional. Proof: secret validation only when `TELEPHONY_WEBHOOK_SECRET` is set in `src/app/api/telephony/3cx/route.ts`. Impact: spoofed events when secret missing. Fix: require secret in all envs and 401 if missing.
- Claim: Ticket-level RBAC exists but depends on mocked session. Proof: `checkTicketViewAccess` et al in `src/lib/ticket-auth.ts` used by `src/app/api/tickets/[id]/route.ts` and `src/app/api/attachments/[id]/download/route.ts`. Impact: correct logic but ineffective today. Fix: keep logic and restore auth.

## 4) DB Canonical Truth + Drift Report
- Canonical source: `src/db/schema.ts`. Proof: `drizzle.config.ts` points `schema` to this file and outputs migrations to `src/db/migrations`. Impact: schema should be authoritative for DB evolution. Fix: reconcile migrations to match schema.
- Drift: Tables only in migrations: `oauth_token_locks`. Proof: `src/db/migrations/0016_oauth_token_locks.sql` exists; no table in `src/db/schema.ts`. Impact: table is invisible to Drizzle models. Fix: add it to schema or drop migration if obsolete.
- Drift: Columns only in schema (not in migrations) on `tickets`: `customer_id`, `first_response_at`, `first_response_due_at`, `resolution_due_at`, `sla_breached`, `sla_notified`, `sla_policy_id`, `merged_into_ticket_id`, `opportunity_id`, `ai_suggested_action`. Proof: `src/db/schema.ts` vs `src/db/migrations/0000_happy_thunderball.sql`. Impact: runtime errors if code writes to missing columns. Fix: migration to add columns and backfill defaults.
- Drift: Columns only in schema on `opportunities`: `expected_close_date`, `stage_changed_at`. Proof: `src/services/opportunityService.ts` uses `stageChangedAt`, schema defines it, migration does not. Impact: update paths may fail. Fix: add columns in migration.
- Note: `sds` column has a non-standard name with quotes. Proof: `sdsUrl` in `src/db/schema.ts` maps to `"Metafield: custom.safety_data_sheet [file_reference]"`, and migration has the same quoted name in `src/db/migrations/0000_happy_thunderball.sql`. Impact: brittle column naming. Fix: consider aliasing or migration to a normalized column name.
- Legacy drift: `drizzle/0001_product_tables.sql` defines `price_tiers`, which is absent in `src/db/schema.ts`. Impact: unused or orphaned DDL. Fix: archive or remove legacy SQL after confirming no usage.

## 5) Critical Flows (2-4)
### Flow A: Ticket creation and customer sync
- Entry: `POST /api/tickets` in `src/app/api/tickets/route.ts`.
- Validation: `CreateTicketSchema` (zod) in `src/app/api/tickets/route.ts`.
- Calls: `TicketService.createTicket` in `src/services/TicketService.ts`.
- DB: insert `tickets`, optional `users` lookup for assignee.
- Side effects: `outboxService.enqueue('customer.sync')` in `src/services/TicketService.ts` processed by `src/jobs/outboxProcessor.ts`.
- Failure modes: invalid assignee email -> 404; outbox enqueue errors are logged and do not fail the request.

### Flow B: Agent reply with attachments
- Entry: `POST /api/tickets/:id/attachments` then `POST /api/tickets/:id/reply` in `src/app/api/tickets/[id]/attachments/route.ts` and `src/app/api/tickets/[id]/reply/route.ts`.
- Validation: file size/type/signature via `SecurityValidator` (`src/lib/security.ts`); comment HTML sanitized via `sanitizeHtmlContent` in `src/lib/validators`.
- Calls: attachment upload -> Vercel Blob; comment insert in a transaction in `src/app/api/tickets/[id]/reply/route.ts`.
- DB: `ticket_attachments`, `ticket_comments`, `tickets`.
- Side effects: email send is disabled (`if (false && emailRequested)`), so only comment persists.
- Failure modes: email requests are silently ignored; attachment upload can fail per-file and return 500.

### Flow C: Customer 360 view
- Entry: `GET /api/customers/:id/360` in `src/app/api/customers/[id]/360/route.ts`.
- Validation: `RouteParamsSchema` (zod) in same file.
- Calls: `customerRepository.getCustomer360` in `src/repositories/CustomerRepository.ts`.
- DB: reads `customers`, `customer_identities`, `orders` + `order_items`, `shipments`, `tickets`, `interactions`.
- Side effects: none.
- Failure modes: missing customer -> 404.

### Flow D: RAG query
- Entry: `POST /api/rag/query` in `src/app/api/rag/query/route.ts`.
- Validation: `RagQueryRequestSchema` in `src/lib/contracts`.
- Calls: `getViewerScope` -> `ragRepository.query` -> `CacheService`.
- DB: inserts into `rag_query_log`.
- Side effects: vector/FTS retrieval and caching.
- Failure modes: RBAC deny -> 401/403; rate limit -> 429; RagAccessError -> 4xx with deny reason.

## 6) Side Effects Boundary Map
| Side effect | Boundary | Evidence | Fix direction |
| --- | --- | --- | --- |
| Email send (Graph + notification) | Leaking | `src/app/api/email/send-invoice/route.ts`, `src/app/api/tickets/[id]/route.ts`, `src/lib/email.ts` | Move to service + outbox; add auth + rate limit. |
| Shopify API (draft orders, search) | Leaking | `src/app/api/draft-orders/route.ts`, `src/app/api/products/*/route.ts`, `src/services/shopify/ShopifyService.ts` | Wrap in application service; prefer jobs for heavy ops. |
| ShipStation API | Leaking | `src/app/api/shipstation/*/route.ts`, `src/lib/shipstationService.ts` | Add caching and move heavy calls to jobs. |
| QBO + Amazon sync | Safe | `src/app/api/cron/sync-qbo/route.ts`, `src/app/api/cron/sync-amazon/route.ts` | Keep in jobs; add monitoring/retries. |
| Vercel Blob uploads | Leaking | `src/app/api/tickets/[id]/attachments/route.ts` | Enforce ticket access before upload; add audit. |
| PDF generation | Leaking | `src/app/api/email/send-invoice/route.ts` | Move to background worker and store artifact. |
| RAG ingestion/embedding | Safe | `src/services/rag/*` | Keep in service; add retry and circuit breakers. |

## 7) Risk Register (Top 10) with Exploit Scenarios
1) Claim: Auth bypass makes all guarded routes effectively open. Evidence: `src/middleware.ts`, `src/lib/auth-helpers.ts`. Exploit: unauthenticated user hits admin endpoints and is treated as admin. Impact: full data exposure/control. Fix plan: restore real auth and remove mock session; add environment-gated dev bypass. Rollback plan: toggle the bypass flag for local dev only.
2) Claim: Unauthenticated invoice email send. Evidence: `src/app/api/email/send-invoice/route.ts` has no session check. Exploit: attacker sends invoices to arbitrary recipients. Impact: spam, brand damage, data leakage. Fix plan: require auth or signed HMAC token and add rate limiting. Rollback plan: restrict endpoint to internal IPs until auth ships.
3) Claim: Draft order endpoints are public. Evidence: `src/app/api/draft-orders/[id]/route.ts`, `src/app/api/draft-orders/search/route.ts`. Exploit: scrape quotes by ID or name. Impact: customer/quote data exposure. Fix plan: add auth + role checks. Rollback plan: require shared secret header temporarily.
4) Claim: Calls endpoint is public. Evidence: `src/app/api/calls/[id]/route.ts`. Exploit: modify call notes or link to tickets. Impact: tampered CRM history. Fix plan: require session + ticket/customer access checks. Rollback plan: disable PATCH until auth is enforced.
5) Claim: Ticket comments GET has no auth. Evidence: `src/app/api/tickets/[id]/comments/route.ts`. Exploit: enumerate ticket IDs and read comments. Impact: PII leak. Fix plan: require session and `checkTicketViewAccess`. Rollback plan: return 401 for GET until fixed.
6) Claim: Attachment upload lacks ticket access check. Evidence: `src/app/api/tickets/[id]/attachments/route.ts` does not call `checkTicketModifyAccess`. Exploit: attach files to any ticket ID. Impact: data poisoning and abuse. Fix plan: enforce ticket access before upload. Rollback plan: admin-only uploads.
7) Claim: Telephony webhook secret optional. Evidence: `src/app/api/telephony/3cx/route.ts` only checks when `TELEPHONY_WEBHOOK_SECRET` is set. Exploit: spoof call events. Impact: fake interactions and tickets. Fix plan: require secret in all envs. Rollback plan: IP allowlist while provisioning secret.
8) Claim: Schema drift between code and DB. Evidence: `src/db/schema.ts` vs `src/db/migrations/0000_happy_thunderball.sql`, `src/db/migrations/0016_oauth_token_locks.sql`. Exploit: deploy fails or silent data loss. Impact: runtime errors and missing fields. Fix plan: generate migrations to match schema. Rollback plan: gate new columns behind feature flags.
9) Claim: PII logged in request logs. Evidence: `src/app/api/orders/search/route.ts`, `src/app/api/shipstation/order-details/route.ts`, `src/app/api/draft-orders/route.ts`. Exploit: log access reveals customer data. Impact: compliance risk. Fix plan: redact or remove PII logs. Rollback plan: disable request logging in prod via env.
10) Claim: Email reply pipeline disabled while UI sends email by default. Evidence: `src/app/api/tickets/[id]/reply/route.ts`, `src/components/ticket-view/ReplyComposer.tsx`. Exploit: agents believe emails are sent but they are not. Impact: missed customer responses and SLA breaches. Fix plan: enable email or default send to false with UI warning. Rollback plan: disable email toggle entirely until ready.

## 8) Refactor Roadmap (FP-friendly)
### Domain hotspots
- Auth/session + RBAC: `src/lib/auth-helpers.ts`, `src/middleware.ts`, `src/lib/ticket-auth.ts`.
- Ticket lifecycle: `src/services/TicketService.ts`, `src/app/api/tickets/*`.
- Customer identity and CRM: `src/services/crm/identityService.ts`, `src/repositories/CustomerRepository.ts`.
- Commerce sync: `src/services/shopify/ShopifyService.ts`, `src/lib/shipstationService.ts`, `src/jobs/*`.
- RAG pipeline: `src/services/rag/*`, `src/app/api/rag/*`.

### Target split
- Domain: pure rules (ticket SLA, assignment policy, identity resolution logic).
- Application: use cases (create ticket, merge customer, send invoice).
- Infra: DB + external APIs + cache.
- Interface: Next route handlers and UI.

### Safe migration steps (6-12)
1) Re-enable real auth in `src/lib/auth-helpers.ts` and remove middleware bypass in `src/middleware.ts`, gated by a single env flag for rollback.
2) Add a shared `requireSession` helper and migrate routes that currently skip auth (`calls`, `draft-orders`, `tickets/comments`).
3) Move email send operations into an application service and enqueue via outbox; replace direct sends in route handlers.
4) Introduce a `TicketRepository` layer and migrate `TicketService` to depend on it; keep SQL in one place for unit tests.
5) Reconcile schema drift: add missing columns and include `oauth_token_locks` in `src/db/schema.ts`; generate migrations and backfill defaults.
6) Convert `identityService.resolveOrCreateCustomer` usage to the newer APIs and make identity operations transactional.
7) Consolidate Shopify/ShipStation/QBO calls into a commerce service with caching and timeouts.
8) Add a centralized logger with PII redaction and replace direct `console.log` calls in API routes.

