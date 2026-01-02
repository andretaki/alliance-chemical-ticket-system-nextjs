/**
 * Shared Type Contracts
 *
 * This module exports Zod schemas and TypeScript types for use in:
 * - API request/response validation
 * - Service layer type safety
 * - Component prop types
 *
 * Usage:
 * ```ts
 * import { CustomerOverviewSchema, type CustomerOverview } from '@/types/contracts';
 *
 * // Validate API response
 * const data = CustomerOverviewSchema.parse(response.json());
 *
 * // Use type for props
 * function CustomerCard({ customer }: { customer: CustomerOverview }) {}
 * ```
 */

// CRM contracts
export {
  CrmTaskTypeSchema,
  type CrmTaskType,
  ChurnRiskSchema,
  type ChurnRisk,
  OpportunityStageSchema,
  type OpportunityStage,
  WhoToTalkToRowSchema,
  type WhoToTalkToRow,
  PipelineHealthRowSchema,
  type PipelineHealthRow,
  StaleOpportunitySchema,
  type StaleOpportunity,
  OpenTaskSchema,
  type OpenTask,
  WinRateSchema,
  type WinRate,
  CrmDashboardStatsSchema,
  type CrmDashboardStats,
  parseQueryResult,
  parseQueryResults,
} from './crm.contracts';

// API contracts
export {
  ApiErrorSchema,
  type ApiError,
  ApiErrorResponseSchema,
  type ApiErrorResponse,
  ApiResponseSchema,
  type ApiResponse,
} from './api.contracts';

// Customer contracts
export {
  ProviderSchema,
  type Provider,
  MatchMethodSchema,
  type MatchMethod,
  CustomerIdentitySchema,
  type CustomerIdentity,
  CustomerContactSchema,
  type CustomerContact,
  CustomerScoresSchema,
  type CustomerScores,
  QboSnapshotSchema,
  type QboSnapshot,
  ResolutionResultSchema,
  type ResolutionResult,
  UpsertResultSchema,
  type UpsertResult,
  CustomerOverviewSchema,
  type CustomerOverview,
  MergeCandidateSchema,
  type MergeCandidate,
  CustomerMergeResultSchema,
  type CustomerMergeResult,
} from './customer.contracts';

// RAG contracts
export {
  RagSourceTypeSchema,
  type RagSourceType,
  RagSensitivitySchema,
  type RagSensitivity,
  RagIntentSchema,
  type RagIntent,
  RagConfidenceSchema,
  type RagConfidence,
  ViewerScopeSchema,
  type ViewerScope,
  RagScoreBreakdownSchema,
  type RagScoreBreakdown,
  RagResultItemSchema,
  type RagResultItem,
  RagTruthResultSchema,
  type RagTruthResult,
  RagQueryFiltersSchema,
  type RagQueryFilters,
  RagQueryRequestSchema,
  type RagQueryRequest,
  RagQueryResponseSchema,
  type RagQueryResponse,
  RagAccessErrorDetailsSchema,
  type RagAccessErrorDetails,
  RagAccessErrorResponseSchema,
  type RagAccessErrorResponse,
  RagSimilarResultsResponseSchema,
  type RagSimilarResultsResponse,
} from './rag.contracts';

// Order contracts
export {
  OrderProviderSchema,
  type OrderProvider,
  OrderStatusSchema,
  type OrderStatus,
  FinancialStatusSchema,
  type FinancialStatus,
  OrderItemSchema,
  type OrderItem,
  OrderSchema,
  type Order,
  ShipmentSchema,
  type Shipment,
  FrequentProductSchema,
  type FrequentProduct,
  OrdersByProviderSchema,
  type OrdersByProvider,
} from './orders.contracts';
