# Alliance Chemical Ticket System - CRM/Ticketing Audit Report

**Date:** 2025-12-28
**Auditor:** Claude Code
**Scope:** Full feature inventory, gap analysis, and broken areas identification

---

## Executive Summary

The Alliance Chemical Ticket System is a Next.js 15 application with a comprehensive ticketing and CRM system. The codebase is well-structured with good separation of concerns. **Key finding: Authentication is currently bypassed in middleware** - this is the most critical issue.

### Quick Stats
- **Unit Tests:** 25 passing (3 test suites)
- **Build Status:** Passing (no type errors)
- **Estimated Feature Completeness:** ~70% for ticketing, ~60% for CRM

---

## 1. Current Feature Inventory

### Ticketing System

| Feature | Status | Notes |
|---------|--------|-------|
| Create/View/Edit Tickets | ✅ Implemented | Full CRUD with validation |
| Ticket Status Workflow | ✅ Implemented | new → open → in_progress → pending_customer → closed |
| Ticket Priority | ✅ Implemented | low, medium, high, urgent |
| Ticket Types | ✅ Implemented | 13 e-commerce specific types |
| Ticket Assignment | ✅ Implemented | Assign to users, AI suggestions |
| Comments (Public) | ✅ Implemented | External customer-facing replies |
| Comments (Internal Notes) | ✅ Implemented | `isInternalNote` flag |
| Outgoing Replies | ✅ Implemented | Email replies via MS Graph |
| Attachments | ✅ Implemented | Vercel Blob storage |
| Email-to-Ticket | ✅ Implemented | MS Graph integration |
| Ticket Merge | ✅ Implemented | Merge duplicate tickets |
| Reopen Tickets | ✅ Implemented | Admin/API endpoints |
| Search & Filter | ✅ Implemented | Status, priority, assignee, text search |
| Pagination | ✅ Implemented | Page-based with configurable limit |
| SLA Policies | ✅ Implemented | First response + resolution time |
| Business Hours | ✅ Implemented | Day-of-week based |
| SLA Breach Detection | ✅ Implemented | Cron job at `/api/cron/check-slas` |
| AI Draft Replies | ✅ Implemented | Multiple AI providers |
| Canned Responses | ✅ Implemented | Macros/templates for replies |
| Quarantine (Spam Filter) | ✅ Implemented | AI-powered email filtering |
| Ticket Sentiment | ✅ Implemented | AI-detected sentiment |
| AI Summary | ✅ Implemented | Auto-generated summaries |
| Tags/Custom Fields | 🔴 Missing | Only fixed types, no custom fields |
| Ticket Templates | 🟡 Partial | Canned responses only, no full templates |
| Ticket Queues/Routing | 🔴 Missing | No queue-based routing rules |
| Collision Detection | 🔴 Missing | No "someone is viewing this" |
| Time Tracking | 🔴 Missing | No time-to-resolution tracking |
| Full Audit Log | 🔴 Missing | No change history per ticket |

### CRM System

| Feature | Status | Notes |
|---------|--------|-------|
| Customers | ✅ Implemented | Multi-identity support |
| Customer Identities | ✅ Implemented | Shopify, QBO, manual, Amazon, Klaviyo |
| Contacts | ✅ Implemented | Linked to customers |
| Customer Detail View | ✅ Implemented | Orders, tickets, calls, opportunities |
| VIP Flag | ✅ Implemented | `isVip` field on customers |
| Credit Risk Level | ✅ Implemented | `creditRiskLevel` field |
| Opportunities | ✅ Implemented | Full pipeline support |
| Pipeline Stages | ✅ Implemented | lead → quote_sent → won/lost |
| Pipeline Health Dashboard | ✅ Implemented | Stale quotes, win rate |
| Opportunity Owner | ✅ Implemented | Assigned user tracking |
| Stage Change Tracking | ✅ Implemented | `stageChangedAt` timestamp |
| Stale Opportunity Detection | ✅ Implemented | 14-day threshold |
| Orders | ✅ Implemented | With line items |
| Order History | ✅ Implemented | Displayed on customer view |
| Late Payment Flag | ✅ Implemented | AR overdue detection |
| Customer Scores (RFM) | ✅ Implemented | Recency, Frequency, Monetary |
| Health Score | ✅ Implemented | 0-100 scale |
| Churn Risk | ✅ Implemented | low/medium/high |
| CRM Tasks | ✅ Implemented | FOLLOW_UP, CHURN_WATCH, etc. |
| "Who to Talk To" View | ✅ Implemented | High-churn customers sorted by LTV |
| Win Rate Tracking | ✅ Implemented | Last 90 days |
| Calls/Telephony | ✅ Implemented | 3CX integration |
| Call Recording URL | ✅ Implemented | Stored per call |
| Interactions Log | ✅ Implemented | All customer touchpoints |
| QBO Customer Snapshot | ✅ Implemented | Balance, terms, payment history |
| Frequent Products | ✅ Implemented | Computed from order history |
| Activities/Meetings | 🔴 Missing | Only calls and tasks |
| Email Open/Click Tracking | 🔴 Missing | No email engagement |
| Lead Scoring | 🔴 Missing | No lead qualification |
| Custom Pipeline Stages | 🔴 Missing | Fixed 4 stages only |
| Forecasting/Quotas | 🔴 Missing | No revenue projections |
| Custom Fields | 🔴 Missing | No extensible fields |

### Users & Authentication

| Feature | Status | Notes |
|---------|--------|-------|
| User Registration | ✅ Implemented | Email/password |
| User Roles | ✅ Implemented | admin, manager, user |
| Ticketing Roles | ✅ Implemented | Admin, PM, Developer, Submitter, Viewer |
| User Approval Flow | ✅ Implemented | pending → approved/rejected |
| Role-Based Access | 🟡 Partial | Middleware exists but **BYPASSED** |
| Password Reset | 🔴 Missing | TODO in code |
| User Signatures | ✅ Implemented | For email replies |
| OAuth/SSO | 🔴 Missing | Only credentials auth |

### Reporting & Analytics

| Feature | Status | Notes |
|---------|--------|-------|
| Ticket Dashboard | ✅ Implemented | Charts for status, priority, type |
| CRM Dashboard | ✅ Implemented | Pipeline, churn, tasks |
| Resolution Dashboard | ✅ Implemented | `/admin/resolution-dashboard` |
| Win Rate Stats | ✅ Implemented | In CRM dashboard |
| Pipeline Value | ✅ Implemented | Sum of open opportunities |
| Ticket Volume Reports | 🔴 Missing | No historical trending |
| Response Time Reports | 🔴 Missing | No SLA metrics dashboard |
| Agent Performance | 🔴 Missing | No per-agent stats |
| Export to CSV/Excel | 🔴 Missing | No data export |

### Integrations

| Feature | Status | Notes |
|---------|--------|-------|
| Shopify | ✅ Implemented | Products, draft orders, order sync |
| ShipStation | ✅ Implemented | Customer/order lookup |
| QuickBooks Online | ✅ Implemented | OAuth, estimates, customer sync |
| Microsoft Graph | ✅ Implemented | Email processing |
| 3CX Telephony | ✅ Implemented | Call events webhook |
| Resend (Email) | ✅ Implemented | Outbound notifications |
| Vercel Blob | ✅ Implemented | File storage |
| Vercel KV | ✅ Implemented | Caching/rate limiting |
| Gmail/Outlook Direct | 🔴 Missing | Only app-level MS Graph |
| Slack Notifications | 🔴 Missing | No Slack integration |
| Zapier/Webhooks | 🔴 Missing | No outbound webhooks |

---

## 2. Feature Matrix

| Area | Feature | Status | Location | Notes |
|------|---------|--------|----------|-------|
| Ticketing | CRUD | ✅ | `src/services/TicketService.ts`, `src/app/api/tickets/` | Complete |
| Ticketing | Comments | ✅ | `src/app/api/tickets/[id]/comments/route.ts` | Internal + external |
| Ticketing | Attachments | ✅ | `src/app/api/tickets/[id]/attachments/route.ts` | Vercel Blob |
| Ticketing | SLA | ✅ | `src/services/slaService.ts`, `src/app/api/cron/check-slas/` | Business hours aware |
| Ticketing | Email Ingest | ✅ | `src/lib/graphService.ts` | MS Graph subscription |
| Ticketing | Merge | ✅ | `src/app/api/tickets/[id]/merge/route.ts` | Complete |
| Ticketing | Tags | 🔴 | N/A | Not implemented |
| Ticketing | Audit Log | 🔴 | N/A | Not implemented |
| CRM | Customers | ✅ | `src/services/crm/customerService.ts` | With identities |
| CRM | Opportunities | ✅ | `src/services/opportunityService.ts` | Full pipeline |
| CRM | Tasks | ✅ | `src/services/crm/crmDashboardService.ts` | Complete/dismiss |
| CRM | Calls | ✅ | `src/services/telephony/TelephonyService.ts` | 3CX integration |
| CRM | Scores | ✅ | `src/jobs/calculateCustomerScores.ts` | RFM + health |
| CRM | Activities | 🔴 | N/A | Only calls/tasks exist |
| Auth | Login | ✅ | `src/lib/auth.ts` | better-auth |
| Auth | RBAC | ⚠️ | `src/middleware.ts` | **BYPASSED** |
| Auth | Password Reset | 🔴 | `src/lib/auth.ts:30` | TODO comment |
| Admin | User Mgmt | ✅ | `src/app/manage-users/page.tsx` | Approval flow |
| Admin | Settings | 🟡 | `src/app/admin/settings/page.tsx` | Placeholder only |
| Admin | Orders | ⚠️ | N/A | Dead link in sidebar |

---

## 3. Gaps / Missing Features

### Critical Gaps

1. **Role-Based Access Control** - Middleware is completely bypassed with hardcoded admin user
2. **Password Reset** - Not implemented (TODO in code)
3. **Admin Settings Page** - Just a placeholder "Coming Soon"

### Standard Ticketing Features Missing

1. **Ticket Queues** - No queue-based assignment or routing rules
2. **SLA Dashboard** - No metrics view for SLA performance
3. **Collision Detection** - No indicator when multiple agents view same ticket
4. **Time Tracking** - No logged time per ticket
5. **Audit Log** - No change history tracking
6. **Tags/Labels** - Only fixed types, no flexible tagging
7. **Ticket Templates** - Only canned responses, not full ticket templates
8. **Bulk Actions** - No bulk status change, assign, etc.

### Standard CRM Features Missing

1. **Activities/Meetings** - Can only log calls and tasks
2. **Email Tracking** - No open/click tracking for outbound emails
3. **Lead Scoring** - No qualification scoring
4. **Custom Pipeline Stages** - Fixed to 4 stages
5. **Custom Fields** - No extensible fields on any entity
6. **Forecasting** - No revenue projections or quotas
7. **Campaign Management** - No marketing campaigns

### Integration Gaps

1. **Outbound Webhooks** - No way to push events to external systems
2. **Slack** - No notifications to Slack channels
3. **Calendar Sync** - No Google/Outlook calendar integration
4. **Direct Email** - Only app-level MS Graph, no user mailbox

---

## 4. Broken / Risky Areas

### Critical Issues

| Issue | Severity | Location | Status |
|-------|----------|----------|--------|
| Auth middleware bypassed | CRITICAL | `src/middleware.ts:17-25` | **Intentionally kept bypassed** |
| ~~Dead link: /admin/orders~~ | ~~HIGH~~ | ~~`src/components/Sidebar.tsx:358`~~ | **FIXED** - Now links to /admin/quarantine |
| ~~Dead link: /admin/manage-users~~ | ~~HIGH~~ | ~~`src/components/Sidebar.tsx:351`~~ | **FIXED** - Now links to /manage-users |
| Admin Settings placeholder | MEDIUM | `src/app/admin/settings/page.tsx` | "Coming Soon" message |

### Service Stubs

| File | Issue | Impact |
|------|-------|--------|
| ~~`src/services/pricingService.ts`~~ | ~~Logs "STUB"~~ | **FIXED** - Was unused dead code, cleaned up |
| `src/services/ticketingIntegrationService.ts:14-38` | All methods are stubs | Integration won't work |
| `src/components/ui/separator.tsx:1` | "Temporary stub" comment | UI incomplete |
| `src/components/ui/use-toast.ts:1-4` | "Temporary stub" - TODO comment | Toast notifications don't work |
| `src/components/ui/scroll-area.tsx:1` | "Temporary stub" comment | May cause layout issues |
| `src/components/ui/skeleton.tsx:1` | "Temporary stub" comment | Loading states may break |
| `src/components/ui/alert.tsx:1` | "Temporary stub" comment | Alerts may not render |

### Test Configuration Issue

~~Running `npm test` includes Playwright tests in Jest causing 5 test suites to fail.~~

**FIXED:** Added `'<rootDir>/tests/e2e/'` to `testPathIgnorePatterns` in `jest.config.cjs`.

### TODO/FIXME Items

| Location | Issue |
|----------|-------|
| `src/middleware.ts:17` | "TODO: Remove this bypass when auth is ready" |
| `src/lib/auth.ts:30` | "TODO: Implement password reset email sending" |
| `src/components/TicketViewClient.tsx:80` | "TODO: Add toast notification for better UX" |
| `src/app/api/canned-responses/route.ts:35` | "TODO: Add POST/PUT/DELETE" for admin UI |
| `src/app/api/tickets/[id]/comments/route.ts:161` | "TODO: Add role-based filtering for internal notes" |
| `src/app/api/qbo/estimates/route.ts:51` | "TODO: Implement QuickBooks integration" |
| `src/components/ui/use-toast.ts:4` | "TODO: Implement actual toast system" |

### Potential Runtime Issues

1. **SLA Service Constructor** - Calls async `loadBusinessHours()` in constructor without await
2. **QBO Integration** - Returns "not implemented" when credentials missing instead of graceful fallback
3. **No database connection pooling config visible** - May cause connection exhaustion under load

---

## 5. Recommended Next Steps (Prioritized)

### P0 - Critical (Do Immediately)

| # | Task | Impact | Effort | Approach |
|---|------|--------|--------|----------|
| 1 | **Re-enable authentication** | HIGH | S | Remove bypass in `src/middleware.ts`, restore session checks |
| 2 | **Fix sidebar dead links** | HIGH | S | Change `/admin/manage-users` to `/manage-users`, remove `/admin/orders` or create page |
| 3 | **Fix Jest/Playwright conflict** | MEDIUM | S | Add e2e to `testPathIgnorePatterns` in jest.config.cjs |

### P1 - High Priority (Next Sprint)

| # | Task | Impact | Effort | Approach |
|---|------|--------|--------|----------|
| 4 | **Implement password reset** | HIGH | M | Add reset token generation, email sending, and reset page |
| 5 | **Replace UI stubs** | MEDIUM | M | Install proper shadcn/ui components for toast, separator, etc. |
| 6 | **Build Admin Settings page** | MEDIUM | M | Add SLA policy editor, business hours config, canned response CRUD |
| 7 | **Add audit log** | HIGH | M | Create `ticket_events` table, log all status/assignment changes |

### P2 - Medium Priority (Backlog)

| # | Task | Impact | Effort | Approach |
|---|------|--------|--------|----------|
| 8 | **Add ticket tags** | MEDIUM | M | Create `tags` table, `ticket_tags` junction, update UI |
| 9 | **SLA metrics dashboard** | MEDIUM | M | New page with breach rate, avg response time, by priority |
| 10 | **Implement collision detection** | LOW | M | WebSocket or polling with "X is viewing" indicator |

### P3 - Nice to Have

| # | Task | Impact | Effort | Approach |
|---|------|--------|--------|----------|
| 11 | **Custom fields** | LOW | L | JSON schema for custom fields, dynamic UI rendering |
| 12 | **Slack integration** | LOW | M | Webhook on ticket create, SLA breach |
| 13 | **Time tracking** | LOW | M | Start/stop timer UI, aggregate per ticket |

---

## Appendix: File Reference

### Key Service Files
- `src/services/TicketService.ts` - Core ticket operations
- `src/services/crm/customerService.ts` - Customer overview
- `src/services/crm/identityService.ts` - Multi-provider identity resolution
- `src/services/crm/crmDashboardService.ts` - CRM dashboard data
- `src/services/opportunityService.ts` - Opportunity CRUD
- `src/services/telephony/TelephonyService.ts` - 3CX call handling
- `src/services/notificationService.ts` - Email notifications
- `src/services/slaService.ts` - SLA calculations

### Key API Routes
- `src/app/api/tickets/` - Ticket CRUD
- `src/app/api/opportunities/` - Opportunity CRUD
- `src/app/api/customers/` - Customer search
- `src/app/api/cron/` - Background jobs
- `src/app/api/telephony/3cx/` - 3CX webhook

### Key Frontend Pages
- `src/app/dashboard/page.tsx` - Main dashboard
- `src/app/tickets/page.tsx` - Ticket list
- `src/app/customers/[id]/page.tsx` - Customer detail
- `src/app/crm/page.tsx` - CRM dashboard
- `src/app/opportunities/page.tsx` - Pipeline view
- `src/app/tasks/page.tsx` - Task list

---

*Generated by Claude Code audit on 2025-12-28*
