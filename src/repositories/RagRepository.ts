import { enqueueRagJob } from '@/services/rag/ragIngestionService';
import {
  findSimilarReplies,
  findSimilarTickets,
  queryRag,
} from '@/services/rag/ragRetrievalService';
import type { RagIngestionOperation } from '@/services/rag/ragTypes';
import type { RagQueryFilters, ViewerScope } from '@/services/rag/ragTypes';

export class RagRepository {
  query(params: {
    queryText: string;
    scope: ViewerScope;
    filters?: RagQueryFilters;
    customerId?: number | null;
    ticketId?: number | null;
    topK?: number;
    withDebug?: boolean;
  }) {
    return queryRag(params);
  }

  findSimilarTickets(params: {
    ticketId: number;
    scope: ViewerScope;
    topK?: number;
  }) {
    return findSimilarTickets(params);
  }

  findSimilarReplies(params: {
    ticketId: number;
    scope: ViewerScope;
    topK?: number;
    includeInternal?: boolean;
  }) {
    return findSimilarReplies(params);
  }

  enqueueIngestionJob(sourceType: string, sourceId: string, operation?: RagIngestionOperation) {
    return enqueueRagJob(sourceType as any, sourceId, operation);
  }
}

export const ragRepository = new RagRepository();
