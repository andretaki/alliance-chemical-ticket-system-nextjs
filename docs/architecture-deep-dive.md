# Alliance Chemical Ticket System - Architecture Deep Dive

Area: core flows (tickets, customer 360, rag, commerce sync)  
Depth: deep  
Output: md  

---

## 1) Executive Summary
- The system is a Next.js 15 CRM/ticketing app with customer 360 views and rag search, backed by Postgres/Drizzle (`src/app`, `src/db/schema.ts`).
- Tickets are created via `/api/tickets` and linked to customers asynchronously using an outbox job (`src/app/api/tickets/route.ts`, `src/services/outboxService.ts`, `src/jobs/outboxProcessor.ts`).
- Customer 360 pages aggregate identities, orders, tickets, calls, tasks, and qbo snapshots into a single view (`src/repositories/CustomerRepository.ts`, `src/app/customers/[id]/page.tsx`).
- Rag uses hybrid fts + vector retrieval, with structured lookup for orders/invoices/shipments and rbac filters (`src/services/rag/ragRetrievalService.ts`, `src/services/rag/ragStructuredLookup.ts`, `src/services/rag/ragRbac.ts`).
- Shopify/Amazon/ShipStation/QBO integrations use resilience patterns and cursor-based sync jobs (`src/services/shopify/ShopifyService.ts`, `src/lib/amazonSpService.ts`, `src/lib/shipstationService.ts`, `src/lib/qboService.ts`, `src/jobs`).
- Win: identity resolution uses serializable transactions to avoid duplicate customers under concurrency (`src/services/crm/identityService.ts`).
- Win: outbox decouples ticket creation from downstream workflows (`src/services/outboxService.ts`).
- Win: rag ingestion pipeline supports chunking, embeddings, retries, and job dedupe (`src/services/rag/ragIngestionService.ts`).
- Liability: auth is globally bypassed in middleware and session helper, making most routes effectively public (`src/middleware.ts`, `src/lib/auth-helpers.ts`).
- Liability: email replies are disabled server-side while UI defaults to send, causing false confirmations (`src/app/api/tickets/[id]/reply/route.ts`, `src/components/ticket-view/ReplyComposer.tsx`).
- Liability: env var naming drift increases integration fragility across Shopify/QBO/Graph (`src/lib/env.ts`, `src/config/appConfig.ts`, `src/app/api/draft-orders/search/route.ts`).
- Correctness risk: ticket comments GET uses a non-existent role and lacks ticket access checks (`src/app/api/tickets/[id]/comments/route.ts`, `src/db/schema.ts`).

---

## 2) System Map
- `src/app`: Next.js pages, layouts, and API handlers (`src/app/api`, `src/app/tickets`, `src/app/customers`).
- `src/db`: Drizzle schema and SQL migrations for `ticketing_prod` (`src/db/schema.ts`, `src/db/migrations`).
- `src/repositories`: Query composition and aggregation (Customer/Order/Rag) (`src/repositories`).
- `src/services`: Business workflows, rag, crm identity, integrations (`src/services`).
- `src/agents`: ai/draft order helpers (`src/agents`).
- `src/jobs`: batch syncs and cron-driven work (shopify/amazon/qbo, rag, outbox) (`src/jobs`).
- `src/scripts`: cli utilities for sync and rag checks (`src/scripts`).
- `src/lib`: shared utilities (env, db, auth, email, rate limit, cache) (`src/lib`).
- `src/utils`: logging and helper utilities (`src/utils`).
- Duplicate responsibility: ticket updates happen in both service layer and API routes (`src/services/TicketService.ts`, `src/app/api/tickets/[id]/route.ts`).

---

## 3) Data Model Map (Drizzle + Migrations)
Schema is `ticketing_prod` per `src/db/schema.ts`. Root `drizzle/` SQL files define overlapping product tables and an extra `price_tiers` table that is not represented in Drizzle (`drizzle/0001_product_tables.sql`, `src/db/schema.ts`).

### Auth and Users
- `users`: PK `id` (text uuid); key fields `email`, `role`, `approvalStatus`, `ticketingRole`, `isExternal`; index `idx_users_role` (`src/db/schema.ts`).
- `accounts`: PK `(provider, provider_account_id)`; FK `user_id -> users.id` (`src/db/schema.ts`).
- `sessions`: PK `session_token`; FK `user_id -> users.id` (`src/db/schema.ts`).
- `verification_tokens`: PK `(identifier, token)` (`src/db/schema.ts`).

### Tickets and Communication
- `tickets`: PK `id`; FKs to `users`, `customers`, `opportunities`, `sla_policies`; unique `external_message_id`; indexes on status, assignee, reporter, SLA, createdAt, updatedAt (`src/db/schema.ts`).
- `ticket_comments`: PK `id`; FK `ticket_id -> tickets.id`; unique `external_message_id`; indexes on ticket, commenter, createdAt (`src/db/schema.ts`).
- `ticket_attachments`: PK `id`; FKs to `tickets`, `ticket_comments`, `users`; indexes on ticket/comment/uploader (`src/db/schema.ts`).

### CRM and Identity
- `customers`: PK `id`; indexes on primary email/phone/company (`src/db/schema.ts`).
- `customer_identities`: PK `id`; FK `customer_id`; unique `(provider, external_id)`; indexes on provider/email/phone (`src/db/schema.ts`).
- `contacts`: PK `id`; FK `customer_id`; indexes on customer/email (`src/db/schema.ts`).
- `opportunities`: PK `id`; FKs to customers/contacts/users; indexes on stage/owner/division (`src/db/schema.ts`).
- `crm_tasks`: PK `id`; FKs to customers/opportunities/tickets/users; indexes on customer/status/assignee (`src/db/schema.ts`).
- `customer_scores`: PK `customer_id`; churn/health indexes (`src/db/schema.ts`).
- `qbo_customer_snapshots`: PK `id`; unique `customer_id`; index on `qbo_customer_id` (`src/db/schema.ts`).

### Orders and Shipments
- `orders`: PK `id`; FK `customer_id`; unique `(provider, external_id)`; indexes on orderNumber/customer/lateFlag (`src/db/schema.ts`).
- `order_items`: PK `id`; FK `order_id`; index on `order_id` (`src/db/schema.ts`).
- `shipstation_shipments`: PK `id`; unique `shipstation_shipment_id`; FKs to orders/customers; indexes on order/tracking/customer (`src/db/schema.ts`).
- `shipments`: PK `id`; unique `(provider, external_id)`; FKs to orders/customers; indexes on provider/tracking/status/shipDate (`src/db/schema.ts`).

### Rag
- `rag_sources`: PK uuid; unique `(source_type, source_id)`; FKs to customers/tickets/users and self (`parent_id`); indexes on customer/ticket/type/thread (`src/db/schema.ts`).
- `rag_chunks`: PK uuid; FK `source_id` cascade; unique `(source_id, chunk_index)`; check constraint on chunk_index; tsvector column for fts (`src/db/schema.ts`).
- `rag_ingestion_jobs`: PK uuid; indexes on status/source; FK `result_source_id -> rag_sources.id` (`src/db/schema.ts`).
- `rag_sync_cursors`: PK `source_type`; cursor jsonb (`src/db/schema.ts`).
- `rag_query_log`: PK id; stores query, filters, and latencies (`src/db/schema.ts`).

### Ops and Misc
- `outbox_jobs`: PK `id`; indexes on status/topic (`src/db/schema.ts`).
- `calls`: PK `id`; unique `(provider, provider_call_id)`; FKs to customers/contacts/tickets/opportunities (`src/db/schema.ts`).
- `user_signatures`: PK `id`; FK `user_id` (`src/db/schema.ts`).
- `subscriptions`: PK `id`; unique `subscription_id`; FK `creator_id` (`src/db/schema.ts`).
- `quarantined_emails`: PK `id`; reviewer FK (`src/db/schema.ts`).
- `agent_products`, `agent_product_variants`: Shopify product mirror in `ticketing_prod` (`src/db/schema.ts`).
- `credit_applications`: PK `id`; indexes on email/status/submittedAt (`src/db/schema.ts`).
- `qbo_invoices`, `qbo_estimates`: qbo structured data for rag/truth lookups (`src/db/schema.ts`).
- `amazon_sp_tokens`: PK `id`; unique `marketplace_id` (`src/db/schema.ts`).
- `sds`: PK `id` (double precision) (`src/db/schema.ts`).

### Mismatches
- `oauth_token_locks` exists in migrations but not in Drizzle schema (`src/db/migrations/0016_oauth_token_locks.sql`, `src/db/schema.ts`).
- Root `drizzle/` SQL defines `agent_products` in public schema and `price_tiers` not present in Drizzle (`drizzle/0001_product_tables.sql`, `src/db/schema.ts`).

---

## 4) Critical Flows

### Flow A: Ticket Creation -> Customer Sync
- Entry: `POST /api/tickets` (`src/app/api/tickets/route.ts`).
- Validation: `CreateTicketSchema` zod (`src/app/api/tickets/route.ts`).
- Calls: `TicketService.createTicket` then `outboxService.enqueue('customer.sync')` (`src/services/TicketService.ts`, `src/services/outboxService.ts`).
- DB: insert `tickets`, insert `outbox_jobs` (`src/db/schema.ts`).
- Side effects: async outbox processing links customer and creates interaction (`src/jobs/outboxProcessor.ts`).
- Failure modes: outbox uses deprecated non-transactional identity resolution (`src/jobs/outboxProcessor.ts`, `src/services/crm/identityService.ts`).

### Flow B: Ticket Reply + Attachments
- Entry: `ReplyComposer` -> `/api/tickets/[id]/attachments` -> `/api/tickets/[id]/reply` (`src/components/ticket-view/ReplyComposer.tsx`, `src/app/api/tickets/[id]/attachments/route.ts`, `src/app/api/tickets/[id]/reply/route.ts`).
- Validation: file size/type/signature checks; html sanitize (`src/app/api/tickets/[id]/attachments/route.ts`, `src/lib/security.ts`, `src/app/api/tickets/[id]/reply/route.ts`).
- DB: store attachments with blob urls; create comment and link attachments in a transaction (`src/db/schema.ts`, `src/app/api/tickets/[id]/reply/route.ts`).
- Side effects: blob upload; email send is disabled by `if (false)` (`src/app/api/tickets/[id]/reply/route.ts`).
- Failure modes: UI defaults to "send email" while server does not send; attachments cannot be emailed because `fs.readFile` expects local paths (`src/components/ticket-view/ReplyComposer.tsx`, `src/lib/email.ts`).

### Flow C: Customer 360
- Entry: `/customers/[id]` page (`src/app/customers/[id]/page.tsx`).
- Calls: `customerService.getOverviewById` -> `CustomerRepository.getOverviewById` (`src/services/crm/customerService.ts`, `src/repositories/CustomerRepository.ts`).
- DB: customers, identities, orders/items, tickets, tasks, calls, scores, qbo snapshots (`src/repositories/CustomerRepository.ts`).
- Failure modes: auth bypassed on page; data empty if sync jobs are not run (`src/app/customers/[id]/page.tsx`, `src/jobs`).

### Flow D: Rag Query (Customer Memory)
- Entry: `POST /api/rag/query` (`src/app/api/rag/query/route.ts`).
- Validation: schema + rate limit + viewer scope (`src/app/api/rag/query/route.ts`, `src/services/rag/ragRbac.ts`).
- Calls: `ragRepository.query` -> `queryRag` -> structured lookup + hybrid search + rbac filters (`src/repositories/RagRepository.ts`, `src/services/rag/ragRetrievalService.ts`, `src/services/rag/ragStructuredLookup.ts`).
- DB: `rag_sources`, `rag_chunks`, `rag_query_log` plus structured truth tables (`src/db/schema.ts`).
- Side effects: embeddings, kv cache, query logging (`src/services/rag/ragEmbedding.ts`, `src/lib/cache.ts`, `src/app/api/rag/query/route.ts`).

---

## 5) Invariants and Rules (with Enforcement)
- Ticket status/priority/type enums are enforced by DB enums and API zod (both) (`src/db/schema.ts`, `src/app/api/tickets/route.ts`).
- Orders must be unique by `(provider, external_id)` (db only) (`src/db/schema.ts`).
- Rag chunk index bounds enforced by db check constraint (db only) (`src/db/schema.ts`).
- Rag access requires context unless admin and allowGlobal (code only) (`src/services/rag/ragRetrievalService.ts`, `src/services/rag/ragRbac.ts`).
- Ticket view/edit/comment permissions are code-only and currently bypassed by mocked sessions (code only, bypassed) (`src/lib/ticket-auth.ts`, `src/lib/auth-helpers.ts`).
- Attachment validation limits are code-only (code only) (`src/app/api/tickets/[id]/attachments/route.ts`).
- AR late flag is only managed by AR job; sync jobs omit lateFlag updates (code only) (`src/jobs/arLateJob.ts`, `src/jobs/syncShopifyOrders.ts`).

---

## 6) Side Effects Map (Containment)
- Email via Microsoft Graph (ticket replies, notifications) - leaking into routes (`src/lib/graphService.ts`, `src/lib/email.ts`, `src/app/api/email/send-invoice/route.ts`).
- Shopify admin api - safe boundary in service layer (`src/services/shopify/ShopifyService.ts`).
- ShipStation api - safe boundary in lib service (`src/lib/shipstationService.ts`).
- Amazon sp-api - safe boundary in lib service (`src/lib/amazonSpService.ts`).
- QBO api - safe boundary in lib service (`src/lib/qboService.ts`).
- Rag embeddings - safe boundary in rag service (`src/services/rag/ragEmbedding.ts`).
- Vercel blob uploads - leaking into route handler (`src/app/api/tickets/[id]/attachments/route.ts`).
- KV cache and rate limiting - safe boundary in lib (`src/lib/cache.ts`, `src/lib/rateLimiting.ts`).
- Telephony webhook - mixed route + service (`src/app/api/telephony/3cx/route.ts`, `src/services/telephony/TelephonyService.ts`).

---

## 7) Testing and Observability
- Jest config exists, but `tests/` is excluded from `tsconfig` (tests are not typechecked) (`jest.config.cjs`, `tsconfig.json`, `tests`).
- Playwright e2e tests are configured (`playwright.config.ts`, `tests/e2e`).
- Logging is inconsistent (structured logger plus ad hoc console logs); rag query logs include query text (pii risk) (`src/utils/logger.ts`, `src/lib/logger.ts`, `src/app/api/rag/query/route.ts`).

---

## 8) Risk Register (Ranked)
1. Auth bypass makes protected routes public (`src/middleware.ts`, `src/lib/auth-helpers.ts`).
2. Email replies disabled while UI defaults to sending, causing silent failures (`src/app/api/tickets/[id]/reply/route.ts`, `src/components/ticket-view/ReplyComposer.tsx`).
3. Blob attachments cannot be emailed due to `fs.readFile` on url (`src/lib/email.ts`, `src/app/api/tickets/[id]/attachments/route.ts`).
4. Ticket comments GET exposes internal notes due to missing access check and invalid role (`src/app/api/tickets/[id]/comments/route.ts`, `src/db/schema.ts`).
5. Env var drift across config and routes breaks integrations (`src/lib/env.ts`, `src/config/appConfig.ts`, `src/app/api/draft-orders/search/route.ts`).
6. Missing cron endpoint referenced in `vercel.json` (`vercel.json`, `src/app/api/cron`).
7. Outbox customer sync uses deprecated identity resolver without serializable tx (dup risk) (`src/jobs/outboxProcessor.ts`, `src/services/crm/identityService.ts`).
8. `oauth_token_locks` not in ORM schema (migration drift) (`src/db/migrations/0016_oauth_token_locks.sql`, `src/db/schema.ts`).
9. Mixed logging and pii exposure in console logs (`src/app/api/tickets/[id]/reply/route.ts`, `src/services/shopify/ShopifyService.ts`).
10. Tests excluded from typecheck (`tsconfig.json`, `tests`).

---

## 9) Refactor Opportunities (ROI Ranked)
1. Restore real auth and apply API guards (security) (`src/middleware.ts`, `src/lib/auth-helpers.ts`, `src/app/api`).
2. Align email reply UX with backend and fix attachment delivery (`src/components/ticket-view/ReplyComposer.tsx`, `src/app/api/tickets/[id]/reply/route.ts`, `src/lib/email.ts`).
3. Replace deprecated identity resolution in outbox path (`src/jobs/outboxProcessor.ts`, `src/services/crm/identityService.ts`).
4. Consolidate env names and config lookups (`src/lib/env.ts`, `src/config/appConfig.ts`).
5. Add `oauth_token_locks` to Drizzle schema and reconcile root `drizzle/` SQL (`src/db/schema.ts`, `src/db/migrations`, `drizzle`).

---

## 10) Migration Plan (Safe Incremental)
1. Add a feature flag to restore real sessions and middleware gating; rollback by toggling flag (`src/lib/auth-helpers.ts`, `src/middleware.ts`).
2. Apply auth checks to critical API routes (tickets, customers, admin); rollback per route (`src/app/api`).
3. Fix ticket comments GET to use `checkTicketViewAccess` and correct roles; rollback per route (`src/app/api/tickets/[id]/comments/route.ts`, `src/lib/ticket-auth.ts`).
4. Update email reply flow to enable or clearly disable sending in UI; rollback to disabled path (`src/app/api/tickets/[id]/reply/route.ts`, `src/components/ticket-view/ReplyComposer.tsx`).
5. Update attachment email handling to fetch blob urls instead of `fs.readFile`; rollback to "attachments not supported" notice (`src/lib/email.ts`).
6. Replace `resolveOrCreateCustomer` in outbox with `resolveCustomerAdvanced` (`src/jobs/outboxProcessor.ts`).
7. Add `oauth_token_locks` to Drizzle schema; keep raw SQL as fallback (`src/db/schema.ts`, `src/db/migrations/0016_oauth_token_locks.sql`).
8. Align `vercel.json` cron schedules with existing routes (`vercel.json`, `src/app/api/cron`).

---

## 11) Addendum - CRM Prompt Highlights (Selected)

### Critical Issues (Data Loss / Security Risk)
| Issue | Location | Evidence | Impact | Fix |
|---|---|---|---|---|
| Auth bypass makes protected routes public | `src/middleware.ts`, `src/lib/auth-helpers.ts` | Mock session and bypassed middleware | Unauthorized access to tickets/customers | Restore real session checks and middleware gates |
| Ticket comments GET allows internal notes for invalid role | `src/app/api/tickets/[id]/comments/route.ts`, `src/db/schema.ts` | Role check uses `staff`, not in `user_role` enum | Sensitive notes exposure | Use `checkTicketViewAccess` and align roles |
| Email replies disabled while UI defaults to send | `src/app/api/tickets/[id]/reply/route.ts`, `src/components/ticket-view/ReplyComposer.tsx` | `if (false && ...)` gate | Silent comms failure | Enable email or disable UI toggle |

### Major Issues (Broken Functionality)
| Issue | Location | Evidence | Impact | Fix |
|---|---|---|---|---|
| Blob attachments cannot be emailed | `src/app/api/tickets/[id]/attachments/route.ts`, `src/lib/email.ts` | Attachments stored as blob urls; email reads local fs | Missing attachments on replies | Fetch blob urls or store bytes |
| Missing cron route referenced by schedule | `vercel.json`, `src/app/api/cron` | `/api/cron/process-resolutions` not present | Scheduled job fails | Add route or remove schedule |
| Env var drift breaks Shopify/QBO | `src/lib/env.ts`, `src/config/appConfig.ts`, `src/app/api/draft-orders/search/route.ts` | Different variable names used | Integration failures | Consolidate env map + validate |

### Moderate Issues (UX / Maintainability)
| Issue | Location | Evidence | Impact | Fix |
|---|---|---|---|---|
| Tests excluded from typecheck | `tsconfig.json`, `tests` | `tests` in exclude | Type errors in tests | Add separate tsconfig for tests |
| Realtime SSE is in-memory only | `src/lib/realtimeBroadcast.ts`, `src/app/api/realtime/route.ts` | Uses process memory set | No fanout in serverless | Move to shared pubsub or document |
| Mixed logging styles with pii risk | `src/utils/logger.ts`, `src/lib/logger.ts`, `src/app/api/tickets/[id]/reply/route.ts` | Console logs include emails/ids | Pii exposure | Standardize logging + scrub fields |

### Positive Patterns
- Serializable identity resolution with merge review tasks (`src/services/crm/identityService.ts`).
- Outbox pattern for async workflows (`src/services/outboxService.ts`, `src/jobs/outboxProcessor.ts`).
- Rag ingestion pipeline with retries, dedupe, and embedding cache (`src/services/rag/ragIngestionService.ts`, `src/services/rag/ragEmbedding.ts`).

### Architecture Diagram (ASCII)
```
UI (Next.js pages/components)
  -> API routes (src/app/api/*)
     -> Services / Repositories
        -> DB (ticketing_prod schema)
        -> Outbox / Jobs (src/jobs/*)
        -> External APIs (Shopify, QBO, Amazon, ShipStation, Graph)
        -> Rag ingestion + retrieval
```

### Prioritized Remediation Plan (Estimates)
1. Restore auth and middleware gates (1-2 days) (`src/middleware.ts`, `src/lib/auth-helpers.ts`).
2. Align email reply UX and attachment handling (0.5-1 day) (`src/lib/email.ts`, `src/app/api/tickets/[id]/reply/route.ts`).
3. Replace deprecated identity calls in outbox (0.5 day) (`src/jobs/outboxProcessor.ts`).
4. Consolidate env names and add missing vars (0.5 day) (`src/lib/env.ts`, `src/config/appConfig.ts`).
5. Fix cron schedules vs routes (0.25 day) (`vercel.json`, `src/app/api/cron`).

---

If you meant a different prompt than the repo `crm-analysis-prompt.md`, paste it and I will extend this report accordingly.
