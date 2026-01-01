import { ragIngestionStatusEnum, ragSensitivityEnum, ragSourceTypeEnum } from '@/lib/db';

export type RagSourceType = typeof ragSourceTypeEnum.enumValues[number];
export type RagSensitivity = typeof ragSensitivityEnum.enumValues[number];
export type RagIngestionStatus = typeof ragIngestionStatusEnum.enumValues[number];

export type RagIngestionOperation = 'upsert' | 'delete' | 'reindex';

export type RagIntent =
  | 'identifier_lookup'
  | 'account_history'
  | 'policy_sop'
  | 'logistics_shipping'
  | 'payments_terms'
  | 'troubleshooting';

export interface RagQueryFilters {
  sourceTypeIn?: RagSourceType[];
  includeInternal?: boolean;
  allowGlobal?: boolean;
  departments?: string[];
  createdAfter?: string;
  createdBefore?: string;
  identifiers?: {
    orderNumber?: string;
    invoiceNumber?: string;
    trackingNumber?: string;
    sku?: string;
    poNumber?: string;
  };
}

export interface ViewerScope {
  userId: string;
  role: 'admin' | 'manager' | 'user';
  isAdmin: boolean;
  isManager: boolean;
  isExternal: boolean;
  allowInternal: boolean;
  allowedCustomerIds: number[];
  allowedDepartments: string[];
}

export interface RagScoreBreakdown {
  ftsRank?: number;
  vectorScore?: number;
  fusionScore?: number;
  recencyBoost?: number;
  rerankScore?: number;
  finalScore?: number;
}

export interface RagResultItem {
  sourceId: string;
  sourceType: RagSourceType;
  sourceUri: string;
  title?: string | null;
  snippet: string;
  metadata: Record<string, unknown>;
  customerId?: number | null;
  ticketId?: number | null;
  sensitivity?: RagSensitivity | null;
  sourceCreatedAt: string;
  sourceUpdatedAt?: string | null;
  score: RagScoreBreakdown;
}

export interface RagTruthResult {
  type: string;
  label: string;
  sourceUri?: string | null;
  snippet?: string;
  data: Record<string, unknown>;
  score?: RagScoreBreakdown;
}
