import { z } from 'zod';

/**
 * CRM Dashboard Contracts
 *
 * Shared Zod schemas for CRM dashboard data - used for both:
 * 1. Runtime validation of raw SQL query results
 * 2. TypeScript type inference for components
 */

// Churn risk enum
export const ChurnRiskSchema = z.enum(['low', 'medium', 'high']);
export type ChurnRisk = z.infer<typeof ChurnRiskSchema>;

// Opportunity stage enum
export const OpportunityStageSchema = z.enum(['lead', 'quote_sent', 'won', 'lost']);
export type OpportunityStage = z.infer<typeof OpportunityStageSchema>;

// Task type enum
export const CrmTaskTypeSchema = z.enum([
  'FOLLOW_UP',
  'CHURN_WATCH',
  'VIP_TICKET',
  'AR_OVERDUE',
  'SLA_BREACH',
  'MERGE_REVIEW',
  'MERGE_REQUIRED',
]);
export type CrmTaskType = z.infer<typeof CrmTaskTypeSchema>;

/**
 * WhoToTalkToRow - "Who to talk to today" list item
 */
export const WhoToTalkToRowSchema = z.object({
  customerId: z.number(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  isVip: z.boolean(),

  // Scores
  healthScore: z.number().nullable(),
  churnRisk: ChurnRiskSchema.nullable(),
  ltv: z.string().nullable(),
  last12MonthsRevenue: z.string().nullable(),

  // Activity - dates come as strings from SQL, convert to Date
  lastOrderDate: z.coerce.date().nullable(),
  lastTicketDate: z.coerce.date().nullable(),
  lastCallDate: z.coerce.date().nullable(),

  // Open items
  openTicketCount: z.number(),
  openOpportunityCount: z.number(),
});

export type WhoToTalkToRow = z.infer<typeof WhoToTalkToRowSchema>;

/**
 * PipelineHealthRow - Pipeline stage summary
 */
export const PipelineHealthRowSchema = z.object({
  stage: OpportunityStageSchema,
  count: z.number(),
  totalValue: z.number(),
  staleCount: z.number(),
});

export type PipelineHealthRow = z.infer<typeof PipelineHealthRowSchema>;

/**
 * StaleOpportunity - Quote needing follow-up
 */
export const StaleOpportunitySchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string().nullable(),
  company: z.string().nullable(),
  title: z.string(),
  estimatedValue: z.string().nullable(),
  daysInStage: z.number(),
  ownerName: z.string().nullable(),
});

export type StaleOpportunity = z.infer<typeof StaleOpportunitySchema>;

/**
 * OpenTask - CRM task item
 */
export const OpenTaskSchema = z.object({
  id: z.number(),
  type: z.string(),
  reason: z.string().nullable(),
  customerId: z.number().nullable(),
  customerName: z.string().nullable(),
  opportunityId: z.number().nullable(),
  opportunityTitle: z.string().nullable(),
  ticketId: z.number().nullable(),
  dueAt: z.coerce.date().nullable(),
  assigneeName: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type OpenTask = z.infer<typeof OpenTaskSchema>;

/**
 * WinRate - Win/loss stats
 */
export const WinRateSchema = z.object({
  won: z.number(),
  lost: z.number(),
  winRate: z.number(),
});

export type WinRate = z.infer<typeof WinRateSchema>;

/**
 * CrmDashboardStats - Summary stats
 */
export const CrmDashboardStatsSchema = z.object({
  highChurnCustomers: z.number(),
  staleQuotes: z.number(),
  openTasks: z.number(),
  pipelineValue: z.number(),
});

export type CrmDashboardStats = z.infer<typeof CrmDashboardStatsSchema>;

/**
 * Helper to parse raw SQL result with error handling
 */
export function parseQueryResult<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[${context}] Schema validation failed:`, result.error.flatten());
    throw new Error(`Data validation failed in ${context}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Helper to parse array of raw SQL results
 */
export function parseQueryResults<T>(
  schema: z.ZodType<T>,
  data: unknown[],
  context: string
): T[] {
  return data.map((item, index) => {
    const result = schema.safeParse(item);
    if (!result.success) {
      console.error(`[${context}] Row ${index} validation failed:`, result.error.flatten());
      throw new Error(`Row ${index} validation failed in ${context}: ${result.error.message}`);
    }
    return result.data;
  });
}
