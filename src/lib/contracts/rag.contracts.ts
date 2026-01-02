import { z } from 'zod';
import { ApiErrorSchema } from './api.contracts';

/**
 * RAG Contracts
 *
 * Shared types for RAG query requests and responses.
 */

// RAG source type enum
const RAG_SOURCE_TYPES = [
  'ticket',
  'ticket_comment',
  'email',
  'interaction',
  'qbo_invoice',
  'qbo_estimate',
  'qbo_customer',
  'shopify_order',
  'shopify_customer',
  'amazon_customer',
  'amazon_order',
  'amazon_shipment',
  'shipstation_customer',
  'shipstation_shipment',
  'order',
] as const;
export const RagSourceTypeSchema = z.enum(RAG_SOURCE_TYPES);
export type RagSourceType = z.infer<typeof RagSourceTypeSchema>;

// RAG sensitivity enum
const RAG_SENSITIVITIES = ['public', 'internal'] as const;
export const RagSensitivitySchema = z.enum(RAG_SENSITIVITIES);
export type RagSensitivity = z.infer<typeof RagSensitivitySchema>;

// RAG intent enum
export const RagIntentSchema = z.enum([
  'identifier_lookup',
  'account_history',
  'policy_sop',
  'logistics_shipping',
  'payments_terms',
  'troubleshooting',
]);
export type RagIntent = z.infer<typeof RagIntentSchema>;

// Confidence level
export const RagConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type RagConfidence = z.infer<typeof RagConfidenceSchema>;

/**
 * ViewerScope - RBAC context for RAG queries
 */
export const ViewerScopeSchema = z.object({
  userId: z.string(),
  role: z.enum(['admin', 'manager', 'user']),
  isAdmin: z.boolean(),
  isManager: z.boolean(),
  isExternal: z.boolean(),
  allowInternal: z.boolean(),
  allowedCustomerIds: z.array(z.number()),
  allowedDepartments: z.array(z.string()),
});

export type ViewerScope = z.infer<typeof ViewerScopeSchema>;

/**
 * RagScoreBreakdown - Score components for a result
 */
export const RagScoreBreakdownSchema = z.object({
  ftsRank: z.number().optional(),
  vectorScore: z.number().optional(),
  fusionScore: z.number().optional(),
  recencyBoost: z.number().optional(),
  rerankScore: z.number().optional(),
  finalScore: z.number().optional(),
});

export type RagScoreBreakdown = z.infer<typeof RagScoreBreakdownSchema>;

/**
 * RagResultItem - A single evidence result
 */
export const RagResultItemSchema = z.object({
  sourceId: z.string(),
  sourceType: RagSourceTypeSchema,
  sourceUri: z.string(),
  title: z.string().nullable().optional(),
  snippet: z.string(),
  metadata: z.record(z.unknown()),
  customerId: z.number().nullable().optional(),
  ticketId: z.number().nullable().optional(),
  sensitivity: RagSensitivitySchema.nullable().optional(),
  sourceCreatedAt: z.string(),
  sourceUpdatedAt: z.string().nullable().optional(),
  score: RagScoreBreakdownSchema,
});

export type RagResultItem = z.infer<typeof RagResultItemSchema>;

/**
 * RagTruthResult - A structured lookup result
 */
export const RagTruthResultSchema = z.object({
  type: z.string(),
  label: z.string(),
  sourceUri: z.string().nullable().optional(),
  snippet: z.string().optional(),
  data: z.record(z.unknown()),
  score: RagScoreBreakdownSchema.optional(),
});

export type RagTruthResult = z.infer<typeof RagTruthResultSchema>;

/**
 * RagQueryFilters - Query filter options
 */
export const RagQueryFiltersSchema = z.object({
  sourceTypeIn: z.array(RagSourceTypeSchema).optional(),
  includeInternal: z.boolean().optional(),
  allowGlobal: z.boolean().optional(),
  departments: z.array(z.string()).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  identifiers: z.object({
    orderNumber: z.string().optional(),
    invoiceNumber: z.string().optional(),
    trackingNumber: z.string().optional(),
    sku: z.string().optional(),
    poNumber: z.string().optional(),
  }).optional(),
});

export type RagQueryFilters = z.infer<typeof RagQueryFiltersSchema>;

/**
 * RagQueryRequest - API request body
 */
export const RagQueryRequestSchema = z.object({
  queryText: z.string().min(1),
  customerId: z.number().optional(),
  ticketId: z.number().optional(),
  filters: RagQueryFiltersSchema.optional(),
  topK: z.number().min(1).max(50).optional(),
  debug: z.boolean().optional(),
});

export type RagQueryRequest = z.infer<typeof RagQueryRequestSchema>;

/**
 * RagQueryResponse - API response body
 */
export const RagQueryResponseSchema = z.object({
  intent: RagIntentSchema,
  truthResults: z.array(RagTruthResultSchema).optional(),
  evidenceResults: z.array(RagResultItemSchema),
  confidence: RagConfidenceSchema,
  debug: z.record(z.unknown()).optional(),
});

export type RagQueryResponse = z.infer<typeof RagQueryResponseSchema>;

/**
 * RagAccessError response
 */
export const RagAccessErrorDetailsSchema = z.object({
  denyReason: z.string(),
});

export type RagAccessErrorDetails = z.infer<typeof RagAccessErrorDetailsSchema>;

export const RagAccessErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema.extend({
    details: RagAccessErrorDetailsSchema.optional(),
  }),
});

export type RagAccessErrorResponse = z.infer<typeof RagAccessErrorResponseSchema>;

export const RagSimilarResultsResponseSchema = z.object({
  results: z.array(RagResultItemSchema),
});

export type RagSimilarResultsResponse = z.infer<typeof RagSimilarResultsResponseSchema>;
