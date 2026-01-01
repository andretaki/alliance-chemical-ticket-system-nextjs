import { db, customers, customerScores, orders, tickets, calls, opportunities, crmTasks } from '@/lib/db';
import { eq, sql, desc, and, or, isNull, ne } from 'drizzle-orm';

/**
 * CRM Dashboard Service
 *
 * Provides data for:
 * 1. "Who to talk to today" view
 * 2. Pipeline health view
 * 3. Open tasks
 */

export interface WhoToTalkToRow {
  customerId: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  isVip: boolean;

  // Scores
  healthScore: number | null;
  churnRisk: 'low' | 'medium' | 'high' | null;
  ltv: string | null;
  last12MonthsRevenue: string | null;

  // Activity
  lastOrderDate: Date | null;
  lastTicketDate: Date | null;
  lastCallDate: Date | null;

  // Open items
  openTicketCount: number;
  openOpportunityCount: number;
}

export interface PipelineHealthRow {
  stage: 'lead' | 'quote_sent' | 'won' | 'lost';
  count: number;
  totalValue: number;
  staleCount: number;
}

export interface StaleOpportunity {
  id: number;
  customerId: number;
  customerName: string | null;
  company: string | null;
  title: string;
  estimatedValue: string | null;
  daysInStage: number;
  ownerName: string | null;
}

export interface OpenTask {
  id: number;
  type: string;
  reason: string | null;
  customerId: number | null;
  customerName: string | null;
  opportunityId: number | null;
  opportunityTitle: string | null;
  ticketId: number | null;
  dueAt: Date | null;
  assigneeName: string | null;
  createdAt: Date;
}

/**
 * Get the "Who to talk to today" list.
 * Default: high churn_risk customers sorted by LTV descending.
 */
export async function getWhoToTalkToday(options?: {
  churnRisk?: 'low' | 'medium' | 'high';
  minLtv?: number;
  limit?: number;
}): Promise<WhoToTalkToRow[]> {
  const { churnRisk = 'high', minLtv = 0, limit = 25 } = options || {};

  const result = await db
    .select({
      customerId: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      company: customers.company,
      primaryEmail: customers.primaryEmail,
      primaryPhone: customers.primaryPhone,
      isVip: customers.isVip,

      healthScore: customerScores.healthScore,
      churnRisk: customerScores.churnRisk,
      ltv: customerScores.ltv,
      last12MonthsRevenue: customerScores.last12MonthsRevenue,

      lastOrderDate: sql<Date | null>`(SELECT MAX(placed_at) FROM ticketing_prod.orders WHERE customer_id = ${customers.id})`,
      lastTicketDate: sql<Date | null>`(SELECT MAX(created_at) FROM ticketing_prod.tickets WHERE customer_id = ${customers.id})`,
      lastCallDate: sql<Date | null>`(SELECT MAX(started_at) FROM ticketing_prod.calls WHERE customer_id = ${customers.id})`,

      openTicketCount: sql<number>`(SELECT COUNT(*) FROM ticketing_prod.tickets WHERE customer_id = ${customers.id} AND status != 'closed')::int`,
      openOpportunityCount: sql<number>`(SELECT COUNT(*) FROM ticketing_prod.opportunities WHERE customer_id = ${customers.id} AND closed_at IS NULL)::int`,
    })
    .from(customers)
    .leftJoin(customerScores, eq(customerScores.customerId, customers.id))
    .where(
      and(
        eq(customerScores.churnRisk, churnRisk),
        sql`${customerScores.ltv}::numeric >= ${minLtv}`
      )
    )
    .orderBy(desc(sql`${customerScores.ltv}::numeric`))
    .limit(limit);

  return result;
}

/**
 * Get pipeline health summary: count and value by stage.
 */
export async function getPipelineHealth(): Promise<PipelineHealthRow[]> {
  // Get metrics from the materialized view if available, otherwise compute directly
  const result = await db
    .select({
      stage: opportunities.stage,
      count: sql<number>`COUNT(*)::int`,
      totalValue: sql<number>`COALESCE(SUM(${opportunities.estimatedValue}::numeric), 0)`,
      staleCount: sql<number>`SUM(CASE WHEN ${opportunities.stage} = 'quote_sent' AND NOW() - ${opportunities.stageChangedAt} > INTERVAL '14 days' THEN 1 ELSE 0 END)::int`,
    })
    .from(opportunities)
    .where(isNull(opportunities.closedAt))
    .groupBy(opportunities.stage);

  return result;
}

/**
 * Get stale opportunities (quote_sent > 14 days).
 */
export async function getStaleOpportunities(limit = 20): Promise<StaleOpportunity[]> {
  const result = await db.execute(sql`
    SELECT
      o.id,
      o.customer_id as "customerId",
      COALESCE(c.first_name || ' ' || c.last_name, c.company) as "customerName",
      c.company,
      o.title,
      o.estimated_value as "estimatedValue",
      EXTRACT(EPOCH FROM (NOW() - o.stage_changed_at)) / 86400 as "daysInStage",
      u.name as "ownerName"
    FROM ticketing_prod.opportunities o
    LEFT JOIN ticketing_prod.customers c ON c.id = o.customer_id
    LEFT JOIN ticketing_prod.users u ON u.id = o.owner_id
    WHERE o.stage = 'quote_sent'
      AND o.closed_at IS NULL
      AND NOW() - o.stage_changed_at > INTERVAL '14 days'
    ORDER BY o.estimated_value::numeric DESC NULLS LAST
    LIMIT ${limit}
  `);

  return result as unknown as StaleOpportunity[];
}

/**
 * Get win rate by stage over the last N days.
 */
export async function getWinRateByStage(days = 90): Promise<{ won: number; lost: number; winRate: number }> {
  const result = await db.execute(sql`
    SELECT
      SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) as lost
    FROM ticketing_prod.opportunities
    WHERE closed_at IS NOT NULL
      AND closed_at > NOW() - INTERVAL '${sql.raw(days.toString())} days'
  `);

  const rows = result as unknown as { won: string; lost: string }[];
  const row = rows[0];
  const won = parseInt(row?.won || '0', 10);
  const lost = parseInt(row?.lost || '0', 10);
  const total = won + lost;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

  return { won, lost, winRate };
}

/**
 * Get open CRM tasks for the task list.
 */
export async function getOpenTasks(options?: {
  assigneeId?: string;
  type?: string;
  limit?: number;
}): Promise<OpenTask[]> {
  const { assigneeId, type, limit = 50 } = options || {};

  const result = await db.execute(sql`
    SELECT
      t.id,
      t.type,
      t.reason,
      t.customer_id as "customerId",
      COALESCE(c.first_name || ' ' || c.last_name, c.company) as "customerName",
      t.opportunity_id as "opportunityId",
      o.title as "opportunityTitle",
      t.ticket_id as "ticketId",
      t.due_at as "dueAt",
      u.name as "assigneeName",
      t.created_at as "createdAt"
    FROM ticketing_prod.crm_tasks t
    LEFT JOIN ticketing_prod.customers c ON c.id = t.customer_id
    LEFT JOIN ticketing_prod.opportunities o ON o.id = t.opportunity_id
    LEFT JOIN ticketing_prod.users u ON u.id = t.assigned_to_id
    WHERE t.status = 'open'
      ${assigneeId ? sql`AND t.assigned_to_id = ${assigneeId}` : sql``}
      ${type ? sql`AND t.type = ${type}` : sql``}
    ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
    LIMIT ${limit}
  `);

  return result as unknown as OpenTask[];
}

/**
 * Mark a task as done.
 */
export async function completeTask(taskId: number): Promise<void> {
  await db
    .update(crmTasks)
    .set({
      status: 'done',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crmTasks.id, taskId));
}

/**
 * Dismiss a task.
 */
export async function dismissTask(taskId: number): Promise<void> {
  await db
    .update(crmTasks)
    .set({
      status: 'dismissed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crmTasks.id, taskId));
}

/**
 * Get open tasks for a specific opportunity.
 */
export async function getOpenTasksForOpportunity(opportunityId: number): Promise<OpenTask[]> {
  const result = await db.execute(sql`
    SELECT
      t.id,
      t.type,
      t.reason,
      t.customer_id as "customerId",
      COALESCE(c.first_name || ' ' || c.last_name, c.company) as "customerName",
      t.opportunity_id as "opportunityId",
      o.title as "opportunityTitle",
      t.ticket_id as "ticketId",
      t.due_at as "dueAt",
      u.name as "assigneeName",
      t.created_at as "createdAt"
    FROM ticketing_prod.crm_tasks t
    LEFT JOIN ticketing_prod.customers c ON c.id = t.customer_id
    LEFT JOIN ticketing_prod.opportunities o ON o.id = t.opportunity_id
    LEFT JOIN ticketing_prod.users u ON u.id = t.assigned_to_id
    WHERE t.status = 'open'
      AND t.opportunity_id = ${opportunityId}
    ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
  `);

  return result as unknown as OpenTask[];
}

/**
 * Get summary stats for the CRM dashboard.
 */
export async function getCrmDashboardStats(): Promise<{
  highChurnCustomers: number;
  staleQuotes: number;
  openTasks: number;
  pipelineValue: number;
}> {
  const [churnResult, staleResult, tasksResult, pipelineResult] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(customerScores)
      .where(eq(customerScores.churnRisk, 'high')),

    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.stage, 'quote_sent'),
          isNull(opportunities.closedAt),
          sql`NOW() - ${opportunities.stageChangedAt} > INTERVAL '14 days'`
        )
      ),

    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(crmTasks)
      .where(eq(crmTasks.status, 'open')),

    db
      .select({ total: sql<number>`COALESCE(SUM(${opportunities.estimatedValue}::numeric), 0)` })
      .from(opportunities)
      .where(
        and(
          isNull(opportunities.closedAt),
          or(eq(opportunities.stage, 'lead'), eq(opportunities.stage, 'quote_sent'))
        )
      ),
  ]);

  return {
    highChurnCustomers: churnResult[0]?.count || 0,
    staleQuotes: staleResult[0]?.count || 0,
    openTasks: tasksResult[0]?.count || 0,
    pipelineValue: Number(pipelineResult[0]?.total || 0),
  };
}
