import { db, customers, orders, customerScores, crmTasks, opportunities } from '@/lib/db';
import { eq, sql, and, isNull, lt } from 'drizzle-orm';

/**
 * Nightly job to calculate RFM scores, health scores, and churn risk for all customers.
 * Also creates tasks for stale quotes and rising churn risk.
 *
 * Run with: tsx src/jobs/calculateCustomerScores.ts
 */

interface CustomerOrderMetrics {
  customerId: number;
  totalRevenue: number;
  last12Revenue: number;
  orderCount: number;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number;
}

type ChurnRisk = 'low' | 'medium' | 'high';

// Calculate quintile score (1-5) for a value within a distribution
function scoreByQuintile(value: number, quintiles: number[]): number {
  if (value >= quintiles[4]) return 5;
  if (value >= quintiles[3]) return 4;
  if (value >= quintiles[2]) return 3;
  if (value >= quintiles[1]) return 2;
  return 1;
}

// Score recency (days since last order) - lower days = higher score
function scoreRecency(daysSinceLastOrder: number): number {
  if (daysSinceLastOrder <= 30) return 5;
  if (daysSinceLastOrder <= 60) return 4;
  if (daysSinceLastOrder <= 90) return 3;
  if (daysSinceLastOrder <= 180) return 2;
  return 1;
}

// Determine churn risk based on RFM scores and history
function determineChurnRisk(rScore: number, fScore: number, daysSinceLastOrder: number): ChurnRisk {
  // High churn: used to order frequently but haven't ordered recently
  if (fScore >= 3 && rScore <= 2) return 'high';
  if (daysSinceLastOrder > 180 && fScore >= 2) return 'high';

  // Medium: declining engagement
  if (rScore <= 2) return 'medium';
  if (daysSinceLastOrder > 120) return 'medium';

  return 'low';
}

// Calculate quintile boundaries from values
function calculateQuintiles(values: number[]): number[] {
  if (values.length === 0) return [0, 0, 0, 0, 0];

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  return [
    sorted[Math.floor(n * 0.2)] || 0,
    sorted[Math.floor(n * 0.4)] || 0,
    sorted[Math.floor(n * 0.6)] || 0,
    sorted[Math.floor(n * 0.8)] || 0,
    sorted[n - 1] || 0,
  ];
}

export async function calculateCustomerScores() {
  console.log('[calculateCustomerScores] Starting score calculation...');

  // 1. Aggregate order metrics per customer
  const orderMetrics = await db
    .select({
      customerId: orders.customerId,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}::numeric), 0)`.as('total_revenue'),
      last12Revenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.placedAt} > NOW() - INTERVAL '12 months' THEN ${orders.total}::numeric ELSE 0 END), 0)`.as('last_12_revenue'),
      orderCount: sql<number>`COUNT(*)::int`.as('order_count'),
      lastOrderDate: sql<Date | null>`MAX(${orders.placedAt})`.as('last_order_date'),
      daysSinceLastOrder: sql<number>`COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(${orders.placedAt}))) / 86400, 9999)::int`.as('days_since_last'),
    })
    .from(orders)
    .groupBy(orders.customerId);

  if (orderMetrics.length === 0) {
    console.log('[calculateCustomerScores] No orders found, skipping.');
    return;
  }

  console.log(`[calculateCustomerScores] Found ${orderMetrics.length} customers with orders.`);

  // 2. Calculate quintile boundaries
  const revenues = orderMetrics.map((m) => Number(m.totalRevenue));
  const frequencies = orderMetrics.map((m) => m.orderCount);

  const revenueQuintiles = calculateQuintiles(revenues);
  const frequencyQuintiles = calculateQuintiles(frequencies);

  console.log('[calculateCustomerScores] Revenue quintiles:', revenueQuintiles);
  console.log('[calculateCustomerScores] Frequency quintiles:', frequencyQuintiles);

  // 3. Get existing scores to detect churn risk escalations
  const existingScores = await db
    .select({
      customerId: customerScores.customerId,
      churnRisk: customerScores.churnRisk,
    })
    .from(customerScores);

  const existingChurnMap = new Map(existingScores.map((s) => [s.customerId, s.churnRisk]));

  // 4. Score each customer and upsert
  let updated = 0;
  let churnEscalations = 0;

  for (const m of orderMetrics) {
    const rScore = scoreRecency(m.daysSinceLastOrder);
    const fScore = scoreByQuintile(m.orderCount, frequencyQuintiles);
    const mScore = scoreByQuintile(Number(m.totalRevenue), revenueQuintiles);

    // Health score: weighted sum normalized to 0-100
    // Max raw score = 5*4 + 5*3 + 5*2 = 45
    const rawHealth = rScore * 4 + fScore * 3 + mScore * 2;
    const healthScore = Math.round((rawHealth / 45) * 100);

    const churnRisk = determineChurnRisk(rScore, fScore, m.daysSinceLastOrder);
    const previousChurnRisk = existingChurnMap.get(m.customerId) || null;

    // Upsert the score
    await db
      .insert(customerScores)
      .values({
        customerId: m.customerId,
        rScore,
        fScore,
        mScore,
        ltv: m.totalRevenue.toFixed(2),
        last12MonthsRevenue: m.last12Revenue.toFixed(2),
        healthScore,
        churnRisk,
        previousChurnRisk: previousChurnRisk as ChurnRisk | null,
        lastCalculatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerScores.customerId,
        set: {
          rScore,
          fScore,
          mScore,
          ltv: m.totalRevenue.toFixed(2),
          last12MonthsRevenue: m.last12Revenue.toFixed(2),
          healthScore,
          churnRisk,
          previousChurnRisk: previousChurnRisk as ChurnRisk | null,
          lastCalculatedAt: new Date(),
        },
      });

    updated++;

    // Detect churn escalation: went from low/medium to high
    if (
      churnRisk === 'high' &&
      previousChurnRisk &&
      previousChurnRisk !== 'high'
    ) {
      churnEscalations++;

      // Create a CHURN_WATCH task if one doesn't exist
      const existingTask = await db
        .select({ id: crmTasks.id })
        .from(crmTasks)
        .where(
          and(
            eq(crmTasks.customerId, m.customerId),
            eq(crmTasks.type, 'CHURN_WATCH'),
            eq(crmTasks.status, 'open')
          )
        )
        .limit(1);

      if (existingTask.length === 0) {
        await db.insert(crmTasks).values({
          customerId: m.customerId,
          type: 'CHURN_WATCH',
          reason: 'RISING_CHURN',
          status: 'open',
          dueAt: new Date(),
        });
        console.log(`[calculateCustomerScores] Created CHURN_WATCH task for customer ${m.customerId}`);
      }
    }
  }

  console.log(`[calculateCustomerScores] Updated ${updated} customer scores.`);
  console.log(`[calculateCustomerScores] Detected ${churnEscalations} churn escalations.`);

  // 5. Check for stale quotes and create FOLLOW_UP tasks
  await createStaleQuoteTasks();

  // 6. Refresh the materialized view
  await refreshOpportunityMetrics();

  console.log('[calculateCustomerScores] Done.');
}

async function createStaleQuoteTasks() {
  console.log('[calculateCustomerScores] Checking for stale quotes...');

  // Find opportunities in quote_sent stage where stage_changed_at > 5 days ago
  const staleOpportunities = await db
    .select({
      id: opportunities.id,
      customerId: opportunities.customerId,
      title: opportunities.title,
      ownerId: opportunities.ownerId,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.stage, 'quote_sent'),
        isNull(opportunities.closedAt),
        lt(opportunities.stageChangedAt, sql`NOW() - INTERVAL '5 days'`)
      )
    );

  let tasksCreated = 0;

  for (const opp of staleOpportunities) {
    // Check if there's already an open FOLLOW_UP task for this opportunity
    const existingTask = await db
      .select({ id: crmTasks.id })
      .from(crmTasks)
      .where(
        and(
          eq(crmTasks.opportunityId, opp.id),
          eq(crmTasks.type, 'FOLLOW_UP'),
          eq(crmTasks.status, 'open')
        )
      )
      .limit(1);

    if (existingTask.length === 0) {
      await db.insert(crmTasks).values({
        customerId: opp.customerId,
        opportunityId: opp.id,
        type: 'FOLLOW_UP',
        reason: 'STALE_QUOTE',
        status: 'open',
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        assignedToId: opp.ownerId,
      });
      tasksCreated++;
    }
  }

  console.log(`[calculateCustomerScores] Created ${tasksCreated} stale quote follow-up tasks.`);
}

async function refreshOpportunityMetrics() {
  console.log('[calculateCustomerScores] Refreshing opportunity_stage_metrics materialized view...');

  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW ticketing_prod.opportunity_stage_metrics`);
    console.log('[calculateCustomerScores] Materialized view refreshed.');
  } catch (error) {
    // View might not exist yet if migration hasn't run
    console.warn('[calculateCustomerScores] Could not refresh materialized view:', error);
  }
}

/**
 * Event-driven score recalculation for a single customer.
 * Call this when orders are created/updated, tickets closed, etc.
 * Much lighter weight than the full batch job.
 */
export async function recalculateCustomerScore(customerId: number): Promise<void> {
  // Get order metrics for this customer
  const [metrics] = await db
    .select({
      customerId: orders.customerId,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}::numeric), 0)`.as('total_revenue'),
      last12Revenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.placedAt} > NOW() - INTERVAL '12 months' THEN ${orders.total}::numeric ELSE 0 END), 0)`.as('last_12_revenue'),
      orderCount: sql<number>`COUNT(*)::int`.as('order_count'),
      lastOrderDate: sql<Date | null>`MAX(${orders.placedAt})`.as('last_order_date'),
      daysSinceLastOrder: sql<number>`COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(${orders.placedAt}))) / 86400, 9999)::int`.as('days_since_last'),
    })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .groupBy(orders.customerId);

  if (!metrics) {
    console.log(`[recalculateCustomerScore] No orders for customer ${customerId}, skipping.`);
    return;
  }

  // Get global quintile boundaries (cached or approximated)
  // For event-driven updates, we use simplified scoring to avoid full table scans
  const rScore = scoreRecency(metrics.daysSinceLastOrder);

  // Simplified frequency scoring based on common thresholds
  const fScore =
    metrics.orderCount >= 50 ? 5 :
    metrics.orderCount >= 20 ? 4 :
    metrics.orderCount >= 10 ? 3 :
    metrics.orderCount >= 5 ? 2 : 1;

  // Simplified monetary scoring based on common B2B thresholds
  const revenue = Number(metrics.totalRevenue);
  const mScore =
    revenue >= 100000 ? 5 :
    revenue >= 50000 ? 4 :
    revenue >= 20000 ? 3 :
    revenue >= 5000 ? 2 : 1;

  const rawHealth = rScore * 4 + fScore * 3 + mScore * 2;
  const healthScore = Math.round((rawHealth / 45) * 100);
  const churnRisk = determineChurnRisk(rScore, fScore, metrics.daysSinceLastOrder);

  // Get previous churn risk for escalation detection
  const [existingScore] = await db
    .select({ churnRisk: customerScores.churnRisk })
    .from(customerScores)
    .where(eq(customerScores.customerId, customerId))
    .limit(1);

  const previousChurnRisk = existingScore?.churnRisk || null;

  // Upsert the score
  await db
    .insert(customerScores)
    .values({
      customerId,
      rScore,
      fScore,
      mScore,
      ltv: revenue.toFixed(2),
      last12MonthsRevenue: Number(metrics.last12Revenue).toFixed(2),
      healthScore,
      churnRisk,
      previousChurnRisk: previousChurnRisk as ChurnRisk | null,
      lastCalculatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: customerScores.customerId,
      set: {
        rScore,
        fScore,
        mScore,
        ltv: revenue.toFixed(2),
        last12MonthsRevenue: Number(metrics.last12Revenue).toFixed(2),
        healthScore,
        churnRisk,
        previousChurnRisk: previousChurnRisk as ChurnRisk | null,
        lastCalculatedAt: new Date(),
      },
    });

  // Create CHURN_WATCH task if escalating to high
  if (churnRisk === 'high' && previousChurnRisk && previousChurnRisk !== 'high') {
    const existingTask = await db
      .select({ id: crmTasks.id })
      .from(crmTasks)
      .where(
        and(
          eq(crmTasks.customerId, customerId),
          eq(crmTasks.type, 'CHURN_WATCH'),
          eq(crmTasks.status, 'open')
        )
      )
      .limit(1);

    if (existingTask.length === 0) {
      await db.insert(crmTasks).values({
        customerId,
        type: 'CHURN_WATCH',
        reason: 'RISING_CHURN',
        status: 'open',
        dueAt: new Date(),
      });
      console.log(`[recalculateCustomerScore] Created CHURN_WATCH task for customer ${customerId}`);
    }
  }

  console.log(`[recalculateCustomerScore] Updated score for customer ${customerId}: health=${healthScore}, churnRisk=${churnRisk}`);
}

// Allow running directly with tsx/node
if (process.argv[1]?.includes('calculateCustomerScores')) {
  calculateCustomerScores()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[calculateCustomerScores] Failed:', err);
      process.exit(1);
    });
}
