# CRM Ticketing App Analysis Prompt

You have access to a Next.js 15 CRM/ticketing application with RAG (Retrieval-Augmented Generation) capabilities. The system integrates with Shopify, Amazon, QuickBooks Online (QBO), and ShipStation to provide unified customer identity resolution and order management.

## Your Task

Perform a comprehensive analysis of this codebase focusing on three areas:

1. **Usability Issues** — User-facing friction, confusing workflows, missing feedback
2. **Continuity Problems** — Inconsistent patterns, broken data flows, state management gaps
3. **Architectural Flaws** — Structural weaknesses, race conditions, security holes, scalability concerns

---

## Analysis Instructions

### PART 1: Data Flow Tracing

Trace these critical flows end-to-end and identify breaks:

**A. Customer Identity Resolution**
- Start at `src/services/crm/identityService.ts`
- Trace how `resolveOrCreateCustomer()` and `resolveCustomerAdvanced()` are called from sync jobs
- Check for race conditions when concurrent webhooks resolve the same customer
- Verify address hash fallback logic for Amazon orders without buyer email
- Find what happens when `isAmbiguous: true` is returned — is it surfaced to UI?

**B. Order Sync Pipeline**
- Examine `src/jobs/syncShopifyOrders.ts` and `src/jobs/syncAmazonOrders.ts`
- Check if `lateFlag` is being incorrectly overwritten during sync
- Verify cursor persistence handles partial failures correctly
- Look for N+1 queries in order item fetching

**C. RAG Query Flow**
- Start at `/api/rag/query` route
- Trace through `ragRetrievalService.ts` and `ragRbac.ts`
- Verify RBAC rules in `buildRagAccessWhere()` match `canViewRagRow()` post-filter
- Check if errors propagate with meaningful messages to frontend
- Look for cases where NULL customerId could bypass access controls

**D. Customer 360 View**
- Start at `src/app/customers/[id]/page.tsx`
- Trace data aggregation in `customerService.ts`
- Check if `UnifiedOrdersPanel` handles all provider types
- Verify QBO snapshot data is actually being synced

---

### PART 2: Schema & Type Safety Audit

**Database Schema (`src/db/schema.ts`):**
- List all `jsonb` metadata fields and check if any have Zod validation
- Find foreign keys that could create orphaned records on delete
- Identify missing indexes for common query patterns
- Check enum definitions match actual usage in code

**Type Safety:**
- Search for `as any`, `as unknown as`, and `// @ts-ignore`
- Find API routes that return untyped responses
- Check if frontend components have matching types for API responses
- Look for date handling inconsistencies (Date objects vs ISO strings)

---

### PART 3: Specific Issue Hunting

Look for these known problem patterns:

**Race Conditions:**
```
- Identity resolution without transaction isolation
- Concurrent webhook handlers modifying same customer
- Optimistic updates without conflict resolution
```

**Data Corruption Risks:**
```
- Address hash truncation/collision potential
- Sync jobs overwriting fields managed by other jobs (e.g., lateFlag, dueAt)
- Ambiguous customer matches being silently dropped
```

**Security Holes:**
```
- RAG sources with NULL customerId bypassing scoping
- Orphaned RAG data from deleted customers still queryable
- Missing rate limiting on expensive endpoints
- API keys potentially exposed in client bundles
```

**Missing Functionality:**
```
- Customer merge UI for duplicate resolution
- QBO customer snapshot sync job
- Health check endpoints
- Structured logging (vs console.log)
```

**Dead Code:**
```
- Unused props in components
- Exported functions never imported
- Feature flags that are always on/off
```

---

### PART 4: UI/UX Review

For each major user flow, evaluate:

**Ticket Management:**
- Is ticket creation intuitive? Required fields marked?
- Does status progression make sense?
- Are SLA breach warnings visible?
- Is the merge flow (for duplicate tickets) discoverable?

**Customer 360:**
- Does the unified orders panel show all providers?
- Is it clear which data comes from which source?
- Are loading/error states handled gracefully?
- Can users easily navigate to related tickets/orders?

**RAG/AI Features:**
- Is it clear when AI suggestions are available?
- Are AI-generated responses clearly labeled?
- What happens when RAG fails? Is there a fallback?
- Can users provide feedback on AI quality?

**CRM Dashboard:**
- Is the "who to talk to today" list actionable?
- Are stale opportunities highlighted?
- Is pipeline health visualization accurate?
- Do task priorities make sense?

---

### PART 5: Background Job Analysis

For each job in `src/jobs/`:

1. **Idempotency:** Can it be run twice safely?
2. **Error Handling:** What happens on partial failure?
3. **Cursor Management:** Is progress saved correctly?
4. **Rate Limiting:** Does it respect external API limits?
5. **Monitoring:** Are failures logged/alerted?

Key jobs to examine:
- `syncShopifyOrders.ts`
- `syncAmazonOrders.ts`
- `syncShipstationShipments.ts` (if exists)
- `arLateJob.ts`
- `ragIngestionWorker.ts`
- `ragCleanupOrphans.ts`

---

## Output Format

Structure your findings as:

```markdown
## Executive Summary
[2-3 sentences on overall health]

## Critical Issues (Data Loss/Security Risk)
| Issue | Location | Evidence | Impact | Fix |
|-------|----------|----------|--------|-----|

## Major Issues (Broken Functionality)
| Issue | Location | Evidence | Impact | Fix |
|-------|----------|----------|--------|-----|

## Moderate Issues (UX/Maintainability)
| Issue | Location | Evidence | Impact | Fix |
|-------|----------|----------|--------|-----|

## Minor Issues (Polish)
| Issue | Location | Evidence | Impact | Fix |
|-------|----------|----------|--------|-----|

## Positive Patterns
[List things done well]

## Architecture Diagram
[ASCII diagram of current data flows with problem areas marked]

## Prioritized Remediation Plan
[Ordered list with time estimates]
```

---

## Key Files to Start With

```
src/db/schema.ts                          # Database schema - source of truth
src/services/crm/identityService.ts       # Customer resolution - known issues
src/services/crm/customerService.ts       # Customer 360 aggregation
src/services/rag/ragRetrievalService.ts   # RAG query engine
src/services/rag/ragRbac.ts               # RAG access control
src/jobs/syncShopifyOrders.ts             # Order sync - lateFlag issue
src/jobs/syncAmazonOrders.ts              # Order sync - address hash fallback
src/jobs/arLateJob.ts                     # AR management - never resets flag
src/components/customers/UnifiedOrdersPanel.tsx  # Missing providers
src/app/api/rag/query/route.ts            # RAG API endpoint
src/app/customers/[id]/page.tsx           # Customer detail page
```

---

## Context From Previous Review

A prior architectural review identified these issues (verify if fixed):

1. ~~JSX error in `CrmDashboardClient.tsx`~~ — Check if fixed
2. ~~Field name `subject` vs `title` mismatch in `/api/customers/[id]/360`~~ — Check if fixed
3. `lateFlag` never resets after payment
4. `lateFlag` overwritten by sync jobs
5. Race conditions in identity resolution
6. 16-char address hash collision risk
7. RAG sources with NULL customerId bypass scoping
8. No customer merge UI
9. Missing providers in `UnifiedOrdersPanel.providerConfig`
10. `ordersByProvider` prop defined but never used

---

## Don't Forget To Check

- [ ] Are all enums in schema.ts actually used consistently?
- [ ] Do all foreign key cascades make sense (CASCADE vs SET NULL)?
- [ ] Are there any circular dependencies between services?
- [ ] Is error handling consistent across all API routes?
- [ ] Are environment variables validated at startup?
- [ ] Is there any sensitive data logged?
- [ ] Are database queries using proper parameterization?
- [ ] Is authentication checked on all protected routes?

Begin your analysis now.
