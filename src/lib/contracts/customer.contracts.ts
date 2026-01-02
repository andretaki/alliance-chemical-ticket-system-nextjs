import { z } from 'zod';
import { OrderSchema, FrequentProductSchema } from './orders.contracts';

/**
 * Customer Contracts
 *
 * Shared types for customer identity resolution and overview data.
 */

// Provider enum
export const ProviderSchema = z.enum([
  'shopify',
  'amazon',
  'qbo',
  'shipstation',
  'klaviyo',
  'manual',
  'self_reported',
]);
export type Provider = z.infer<typeof ProviderSchema>;

// Match method enum
export const MatchMethodSchema = z.enum([
  'externalId',
  'email',
  'phone',
  'addressHash',
  'none',
]);
export type MatchMethod = z.infer<typeof MatchMethodSchema>;

/**
 * CustomerIdentity - A single identity link
 */
export const CustomerIdentitySchema = z.object({
  id: z.number(),
  provider: z.string(),
  externalId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date().optional(),
});

export type CustomerIdentity = z.infer<typeof CustomerIdentitySchema>;

/**
 * CustomerContact - A contact person
 */
export const CustomerContactSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string().nullable(),
  notes: z.string().nullable(),
});

export type CustomerContact = z.infer<typeof CustomerContactSchema>;

/**
 * CustomerScores - Health and churn data
 */
export const CustomerScoresSchema = z.object({
  healthScore: z.number().nullable(),
  churnRisk: z.enum(['low', 'medium', 'high']).nullable(),
  ltv: z.string().nullable(),
  last12MonthsRevenue: z.string().nullable(),
  rScore: z.number().nullable().optional(),
  fScore: z.number().nullable().optional(),
  mScore: z.number().nullable().optional(),
  lastCalculatedAt: z.string().nullable(),
});

export type CustomerScores = z.infer<typeof CustomerScoresSchema>;

/**
 * QboSnapshot - QuickBooks AR snapshot
 */
export const QboSnapshotSchema = z.object({
  balance: z.string(),
  currency: z.string(),
  terms: z.string().nullable(),
  lastInvoiceDate: z.string().nullable().optional(),
  lastPaymentDate: z.string().nullable().optional(),
  snapshotTakenAt: z.string(),
});

export type QboSnapshot = z.infer<typeof QboSnapshotSchema>;

/**
 * ResolutionResult - Identity resolution outcome
 */
export const ResolutionResultSchema = z.object({
  customerId: z.number().nullable(),
  isNew: z.boolean(),
  isAmbiguous: z.boolean(),
  matchedBy: MatchMethodSchema,
  ambiguousCustomerIds: z.array(z.number()).optional(),
});

export type ResolutionResult = z.infer<typeof ResolutionResultSchema>;

/**
 * UpsertResult - Identity service upsert outcome
 */
export const UpsertResultSchema = z.object({
  customerId: z.number(),
  action: z.enum(['created', 'updated', 'ambiguous', 'linked']),
});

export type UpsertResult = z.infer<typeof UpsertResultSchema>;

/**
 * CustomerOverview - Full customer 360 view
 *
 * Mirrors the repository output used by the customer 360 page and API responses.
 */
export const CustomerOverviewSchema = z.object({
  id: z.number(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  isVip: z.boolean(),
  creditRiskLevel: z.string().nullable(),
  identities: z.array(CustomerIdentitySchema),
  contacts: z.array(CustomerContactSchema),
  recentOrders: z.array(OrderSchema),
  openTickets: z.array(z.object({
    id: z.number(),
    title: z.string(),
    status: z.string(),
    priority: z.string(),
    updatedAt: z.string(),
  })),
  openOpportunities: z.array(z.object({
    id: z.number(),
    title: z.string(),
    stage: z.string(),
    estimatedValue: z.string().nullable(),
    currency: z.string(),
    ownerName: z.string().nullable(),
    updatedAt: z.string(),
  })),
  recentCalls: z.array(z.object({
    id: z.number(),
    direction: z.string(),
    fromNumber: z.string(),
    toNumber: z.string(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationSeconds: z.number().nullable(),
    contactName: z.string().nullable(),
    ticketId: z.number().nullable(),
    opportunityId: z.number().nullable(),
    recordingUrl: z.string().nullable(),
    notes: z.string().nullable(),
  })),
  scores: CustomerScoresSchema.nullable(),
  qboSnapshot: QboSnapshotSchema.nullable(),
  frequentProducts: z.array(FrequentProductSchema),
  lateOrdersCount: z.number(),
  openTicketsCount: z.number(),
  totalOrders: z.number(),
  openTasks: z.array(z.object({
    id: z.number(),
    type: z.string(),
    reason: z.string().nullable(),
    status: z.string(),
    dueAt: z.string().nullable(),
    opportunityId: z.number().nullable(),
    opportunityTitle: z.string().nullable(),
    ticketId: z.number().nullable(),
    createdAt: z.string(),
  })),
});

export type CustomerOverview = z.infer<typeof CustomerOverviewSchema>;

/**
 * MergeCandidate - potential duplicate customer match
 */
export const MergeCandidateSchema = z.object({
  id: z.number(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  matchedOn: z.array(z.enum(['email', 'phone'])),
});

export type MergeCandidate = z.infer<typeof MergeCandidateSchema>;

/**
 * CustomerMergeResult - merge operation summary
 */
export const CustomerMergeResultSchema = z.object({
  mergedCount: z.number(),
});

export type CustomerMergeResult = z.infer<typeof CustomerMergeResultSchema>;
