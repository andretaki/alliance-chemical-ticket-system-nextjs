# MVP Readiness Gaps

Note: Auth/RBAC items are deferred by request. See "Deferred (Auth/RBAC)".

## Blockers (non-auth MVP)
- Environment variable naming drift will break integrations in production (docs/env schema vs runtime usage): `src/lib/env.ts` + `.env.example` vs `src/config/appConfig.ts` (SHOPIFY_STORE/SHOPIFY_ACCESS_TOKEN), `src/app/api/draft-orders/search/route.ts` (SHOPIFY_STORE_DOMAIN/SHOPIFY_ACCESS_TOKEN), `src/app/api/qbo/estimates/route.ts` (QBO_CONSUMER_KEY/SECRET), `src/lib/graphService.ts` (MICROSOFT_GRAPH_*).
- Shopify ingestion is not scheduled: no Shopify webhook route exists, and the sync jobs are only invoked manually or via `src/jobs/ragSync.ts`. There is no cron route that calls `syncShopifyOrders`/`syncShopifyCustomers` or `syncCustomers`. See `src/jobs/syncShopifyOrders.ts`, `src/jobs/syncShopifyCustomers.ts`, `src/jobs/syncCustomers.ts`, `src/jobs/ragSync.ts`, `vercel.json`.
- Inbound email processing is referenced in UI but not implemented: `/api/process-emails` does not exist, and admin tooling endpoints are missing (`/api/admin/subscriptions`, `/api/admin/debug/test-graph-api`). Also, `/admin/email-processing` page is linked but missing. See `src/components/EmailProcessingButton.tsx`, `src/components/ProcessEmailsSidebarButton.tsx`, `src/app/admin/page.tsx`, `src/components/admin/SubscriptionManager.tsx`, `src/components/admin/GraphApiTester.tsx`.
- Resolved: Ticket reply submission now uploads attachments via `/api/tickets/[id]/attachments` and posts JSON to `/api/tickets/[id]/reply`. Email delivery is still disabled. See `src/components/ticket-view/TicketViewClient.tsx` and `src/app/api/tickets/[id]/reply/route.ts`.
- Email replies are disabled in the reply API (`if (false && requestBody.sendAsEmail...)`), while the UI defaults to “send email.” This creates false confirmation of email delivery. See `src/app/api/tickets/[id]/reply/route.ts` and `src/components/ticket-view/ReplyComposer.tsx`.
- Resolved: UI now reads `draftMessage` and uses `GET` for order status drafts. See `src/components/ticket-view/TicketViewClient.tsx`, `src/app/api/tickets/[id]/draft-ai-reply/route.ts`, `src/app/api/tickets/[id]/draft-order-status/route.ts`.
- QBO integration is not MVP-ready: estimates route is a stub and throws by design (`src/app/api/qbo/estimates/route.ts`), and token storage is file-based (not serverless-safe) in `src/lib/qboTokenStore.ts`.
- Email attachments cannot be sent: attachments are stored as Vercel Blob URLs (`src/app/api/tickets/[id]/attachments/route.ts`) but email sending reads local files via `fs.readFile` (`src/lib/email.ts`).
- Vercel cron config references a missing route (`vercel.json` includes `/api/cron/process-resolutions` but no route exists). Several cron endpoints exist but are not scheduled (e.g., `src/app/api/cron/sync-qbo/route.ts`, `src/app/api/cron/customer-scores/route.ts`, `src/app/api/cron/check-slas/route.ts`).
- Robots/sitemap and security.txt are hard-coded to the Vercel preview domain and include pages that do not exist (`/about`, `/contact`, `/privacy`, `/terms`). See `src/app/api/robots/route.ts`, `src/app/api/sitemap/route.ts`, `src/app/api/security-txt/route.ts`.
- Resolution admin pages call missing APIs (`/api/admin/resolution-metrics`, `/api/admin/resolution-config`, `/api/admin/resolved-tickets`). See `src/app/admin/resolution-dashboard/page.tsx` and `src/components/resolution/*`.

## Deferred (Auth/RBAC)
- Auth is bypassed across middleware, helpers, and client auth shims, so the app is effectively public. See `src/middleware.ts`, `src/lib/auth-helpers.ts`, `src/lib/auth-client.ts`, `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/customers/page.tsx`, `src/app/customers/[id]/page.tsx`, `src/app/tickets/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/settings/page.tsx`, `src/app/admin/customers/create/page.tsx`.
- Internal APIs are reachable without auth/role checks because `/api` is excluded from middleware. At minimum: `src/app/api/users/route.ts`, `src/app/api/orders/search/route.ts`, `src/app/api/draft-orders/search/route.ts`, `src/app/api/draft-orders/[id]/route.ts`, `src/app/api/tickets/[id]/shipstation-live/route.ts`, `src/app/api/calls/[id]/route.ts`, `src/app/api/email/send-invoice/route.ts`, `src/app/api/realtime/route.ts`, `src/app/api/sync-products/route.ts`, `src/app/api/qbo/auth/connect/route.ts`.
- Ticket comments GET does not enforce ticket access and references a non-existent role (`staff`). It should use `checkTicketViewAccess` and align roles with `user_role`. See `src/app/api/tickets/[id]/comments/route.ts` and `src/db/schema.ts`.
- QBO OAuth flow uses a static `state` and has no admin gate; anyone can initiate/complete auth. See `src/lib/qboService.ts`, `src/app/api/qbo/auth/connect/route.ts`, `src/app/api/qbo/auth/callback/route.ts`.

## High Priority (data/config integrity)
- Env schema coverage gaps: variables used in code but missing from `src/lib/env.ts` and/or `.env.example` include `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_API_VERSION`, `NEXT_PUBLIC_SHOPIFY_STORE_URL`, `SHOPIFY_AUTO_CREATE_CUSTOMERS`, `CREDIT_APP_API_KEY`, `SLA_ALERT_EMAIL`, `INTERNAL_EMAIL_DOMAIN`, `MICROSOFT_GRAPH_USER_EMAIL`, `SALES_TEAM_EMAIL`, `CREDIT_APPLICATION_URL`, `SHIPSTATION_API_ENDPOINT`, `NEXT_PUBLIC_SHARED_MAILBOX_ADDRESS`, and the Amazon SP-API vars (present in schema but missing in `.env.example`).
- Cache and rate limiting degrade silently without KV (fallback is per-instance and non-distributed). See `src/lib/cache.ts` and `src/lib/rateLimiting.ts`.
- Realtime SSE broadcast is in-memory only; updates do not fan out across serverless instances. See `src/lib/realtimeBroadcast.ts` and `src/app/api/realtime/route.ts`.
- Telephony webhook secret is optional; when unset the endpoint is open to the public. See `src/app/api/telephony/3cx/route.ts`.
- Order status and order search hard-fail if ShipStation is not configured. `getOrderTrackingInfo` throws, which bubbles out of `/api/orders/search` and `/api/tickets/[id]/draft-order-status`. See `src/lib/shipstationService.ts`, `src/app/api/orders/search/route.ts`, `src/app/api/tickets/[id]/draft-order-status/route.ts`.

## Medium Priority (UX/ops)
- Toasts are stubbed; user feedback will be console-only. See `src/components/ui/use-toast.ts` and TODO in `src/components/TicketViewClient.tsx`.
- Ticket header uses mocked notifications/active users. See `src/components/ticket-view/TicketHeaderBar.tsx`.
- Pricing service is not wired and contains TODOs (volume discounts). See `src/services/pricingService.ts`.
- RAG embeddings fall back to deterministic mock embeddings when OPENAI keys are missing, which limits quality. See `src/services/rag/ragEmbedding.ts` and `src/services/rag/ragConfig.ts`.
- Ticketing integration is a stub and unused. See `src/services/ticketingIntegrationService.ts`.
- Health check only validates DB; does not report KV/Blob/Graph/integration health. See `src/app/api/health/route.ts`.
- `react-hot-toast` is used in several admin/resolution components, but only Sonner’s `<Toaster />` is mounted in `src/app/layout.tsx`, so those toasts will not render.

## Ops/Env Checklist (confirm before launch)
- Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXTAUTH_URL` or `BETTER_AUTH_URL`, `CRON_SECRET`.
- Public endpoints with API keys/secrets: `CREDIT_APP_API_KEY`, `TELEPHONY_WEBHOOK_SECRET`.
- Integrations: `SHOPIFY_*`, `MICROSOFT_GRAPH_*` + `SHARED_MAILBOX_ADDRESS`, `SHIPSTATION_*`, `QBO_*`.
- Infrastructure: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`.
