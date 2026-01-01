import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, ragChunks, ragSources, ticketComments, tickets } from '@/lib/db';
import { RAG_DEFAULT_TOP_K, RAG_FTS_LIMIT, RAG_RRF_K, RAG_VECTOR_LIMIT } from './ragConfig';
import { embedTexts } from './ragEmbedding';
import { buildRagAccessWhere, canViewRagRow } from './ragRbac';
import { classifyIntent, extractIdentifiers, type RagIdentifiers } from './ragIntent';
import { structuredLookup } from './ragStructuredLookup';
import type { RagIntent, RagQueryFilters, RagResultItem, RagScoreBreakdown, RagSourceType, RagTruthResult, ViewerScope } from './ragTypes';
import { logInfo, logWarn } from '@/utils/logger';

interface SearchRow {
  chunkId: string;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  sourceType: RagSourceType;
  sourceUri: string;
  title: string | null;
  metadata: Record<string, any>;
  sensitivity: string;
  customerId: number | null;
  ticketId: number | null;
  threadId: string | null;
  sourceCreatedAt: Date;
  sourceUpdatedAt: Date | null;
  ftsRank?: number;
  vectorScore?: number;
}

interface HybridSearchOptions {
  topK: number;
  scope: ViewerScope;
  includeInternal?: boolean;
  customerId?: number | null;
  ticketId?: number | null;
  allowGlobal?: boolean;
  enforceTicketId?: boolean;
  sourceTypeIn?: RagSourceType[];
  excludeTicketId?: number | null;
  outgoingRepliesOnly?: boolean;
}

const NARRATIVE_SOURCE_TYPES: RagSourceType[] = ['ticket', 'ticket_comment', 'email', 'interaction'];
const STRUCTURED_INTENTS = new Set<RagIntent>(['identifier_lookup', 'payments_terms', 'logistics_shipping']);

export class RagAccessError extends Error {
  status: number;
  denyReason: string;
  filtersApplied?: Record<string, unknown>;
  intent?: RagIntent;

  constructor(message: string, options: { status?: number; denyReason: string; filtersApplied?: Record<string, unknown>; intent?: RagIntent }) {
    super(message);
    this.name = 'RagAccessError';
    this.status = options.status ?? 403;
    this.denyReason = options.denyReason;
    this.filtersApplied = options.filtersApplied;
    this.intent = options.intent;
  }
}

function resolveIncludeInternal(scope: ViewerScope, requested?: boolean): boolean {
  if (!scope.allowInternal) return false;
  return requested === true;
}

async function resolveQueryContext(params: {
  scope: ViewerScope;
  customerId?: number | null;
  ticketId?: number | null;
  includeInternal?: boolean;
  ticketCustomerId?: number | null;
  allowGlobal?: boolean;
}) {
  const includeInternal = resolveIncludeInternal(params.scope, params.includeInternal);
  const allowGlobal = params.allowGlobal === true && (params.scope.isAdmin || params.scope.isManager);
  let customerId = params.customerId ?? null;
  const ticketId = params.ticketId ?? null;
  let ticketCustomerId = params.ticketCustomerId ?? null;
  let denyReason: string | null = null;

  if (ticketId) {
    if (ticketCustomerId == null) {
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: { customerId: true },
      });
      if (!ticket) {
        denyReason = 'ticket_not_found';
      } else {
        ticketCustomerId = ticket.customerId ?? null;
      }
    }

    if (!denyReason && ticketCustomerId == null && !(params.scope.isAdmin || params.scope.isManager)) {
      denyReason = 'ticket_missing_customer';
    }

    if (!denyReason && customerId != null && ticketCustomerId != null && customerId !== ticketCustomerId) {
      denyReason = 'ticket_customer_mismatch';
    }

    if (!denyReason && customerId == null && ticketCustomerId != null) {
      customerId = ticketCustomerId;
    }

    if (!denyReason && ticketCustomerId != null && !(params.scope.isAdmin || params.scope.isManager)) {
      if (!params.scope.allowedCustomerIds.includes(ticketCustomerId)) {
        denyReason = 'ticket_out_of_scope';
      }
    }
  }

  if (!denyReason && customerId != null && !(params.scope.isAdmin || params.scope.isManager)) {
    if (!params.scope.allowedCustomerIds.includes(customerId)) {
      denyReason = 'customer_out_of_scope';
    }
  }

  if (!denyReason && !customerId && !ticketId) {
    if (!(params.scope.isAdmin || params.scope.isManager)) {
      denyReason = 'missing_context';
    } else if (!allowGlobal) {
      denyReason = 'global_not_allowed';
    }
  }

  const filtersApplied = {
    customerId,
    ticketId,
    includeInternal,
    allowGlobal,
    requestedCustomerId: params.customerId ?? null,
    requestedTicketId: params.ticketId ?? null,
    requestedIncludeInternal: params.includeInternal ?? null,
    requestedAllowGlobal: params.allowGlobal ?? null,
    ticketCustomerId,
  };

  return {
    allowed: !denyReason,
    denyReason,
    customerId,
    ticketId,
    includeInternal,
    allowGlobal,
    filtersApplied,
  };
}

function coerceNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function computeRecencyBoost(date: Date | string | null): number {
  if (!date) return 0;
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  if (!timestamp) return 0;
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 60);
}

function scoreStats(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
  };
}

function getIntentBoost(intent: RagIntent, sourceType: RagSourceType): number {
  const boosts: Record<RagIntent, Partial<Record<RagSourceType, number>>> = {
    identifier_lookup: {
      qbo_invoice: 1.4,
      qbo_estimate: 1.3,
      qbo_customer: 1.2,
      shopify_order: 1.3,
      amazon_order: 1.3,
      shipstation_shipment: 1.4,
    },
    logistics_shipping: {
      shipstation_shipment: 1.5,
      ticket: 1.1,
      ticket_comment: 1.1,
      email: 1.05,
    },
    payments_terms: {
      qbo_invoice: 1.5,
      qbo_customer: 1.4,
      qbo_estimate: 1.2,
      ticket_comment: 1.05,
    },
    account_history: {
      email: 1.3,
      ticket: 1.2,
      ticket_comment: 1.2,
      interaction: 1.1,
    },
    policy_sop: {},
    troubleshooting: {
      ticket: 1.15,
      ticket_comment: 1.1,
      email: 1.05,
    },
  };

  return boosts[intent]?.[sourceType] ?? 1;
}

function buildSnippet(text: string, maxLength = 800): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizeExecuteRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

async function fetchNeighborChunks(sourceId: string, chunkIndex: number) {
  const indices = [chunkIndex - 1, chunkIndex, chunkIndex + 1].filter((idx) => idx >= 0);
  if (!indices.length) return [];
  const rows = await db.select({ chunkText: ragChunks.chunkText, chunkIndex: ragChunks.chunkIndex })
    .from(ragChunks)
    .where(and(eq(ragChunks.sourceId, sourceId), inArray(ragChunks.chunkIndex, indices)))
    .orderBy(ragChunks.chunkIndex);
  return rows.map((row) => row.chunkText);
}

async function fetchThreadContext(threadId: string, sourceCreatedAt: Date) {
  const createdAtIso = sourceCreatedAt.toISOString();
  const [prev] = await db.select({ contentText: ragSources.contentText, sourceCreatedAt: ragSources.sourceCreatedAt })
    .from(ragSources)
    .where(and(eq(ragSources.threadId, threadId), sql`${ragSources.sourceCreatedAt} < ${createdAtIso}::timestamptz`))
    .orderBy(desc(ragSources.sourceCreatedAt))
    .limit(1);

  const [next] = await db.select({ contentText: ragSources.contentText, sourceCreatedAt: ragSources.sourceCreatedAt })
    .from(ragSources)
    .where(and(eq(ragSources.threadId, threadId), sql`${ragSources.sourceCreatedAt} > ${createdAtIso}::timestamptz`))
    .orderBy(ragSources.sourceCreatedAt)
    .limit(1);

  return [prev?.contentText, next?.contentText].filter(Boolean) as string[];
}

async function expandSnippet(row: SearchRow): Promise<string> {
  const parts = await fetchNeighborChunks(row.sourceId, row.chunkIndex);
  if (row.threadId) {
    const threadParts = await fetchThreadContext(row.threadId, row.sourceCreatedAt);
    parts.push(...threadParts);
  }
  const uniqueParts: string[] = [];
  const seen = new Set<string>();
  parts.forEach((part) => {
    if (!part || seen.has(part)) return;
    seen.add(part);
    uniqueParts.push(part);
  });
  return buildSnippet(uniqueParts.join('\n\n'));
}

async function performFtsSearch(queryText: string, options: HybridSearchOptions, extraFilter: SQL): Promise<{ rows: SearchRow[]; durationMs: number }> {
  const start = Date.now();
  const baseWhere = buildRagAccessWhere(options.scope, {
    includeInternal: options.includeInternal,
    customerId: options.customerId,
    ticketId: options.ticketId,
    allowGlobal: options.allowGlobal,
    enforceTicketId: options.enforceTicketId,
  });

  const query = sql`
    SELECT
      rag_chunks.id AS chunk_id,
      rag_chunks.source_id,
      rag_chunks.chunk_index,
      rag_chunks.chunk_text,
      rag_sources.source_type,
      rag_sources.source_uri,
      rag_sources.title,
      rag_sources.metadata,
      rag_sources.sensitivity,
      rag_sources.customer_id,
      rag_sources.ticket_id,
      rag_sources.thread_id,
      rag_sources.source_created_at,
      rag_sources.source_updated_at,
      ts_rank_cd(rag_chunks.tsv, websearch_to_tsquery('english', ${queryText})) AS fts_rank
    FROM ticketing_prod.rag_chunks
    JOIN ticketing_prod.rag_sources ON rag_sources.id = rag_chunks.source_id
    WHERE rag_chunks.tsv @@ websearch_to_tsquery('english', ${queryText})
      AND ${baseWhere}
      AND ${extraFilter}
    ORDER BY fts_rank DESC
    LIMIT ${RAG_FTS_LIMIT}
  `;

  const result = await db.execute(query);
  const rows = normalizeExecuteRows<any>(result).map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    chunkIndex: Number(row.chunk_index),
    chunkText: row.chunk_text,
    sourceType: row.source_type,
    sourceUri: row.source_uri,
    title: row.title,
    metadata: row.metadata || {},
    sensitivity: row.sensitivity,
    customerId: row.customer_id,
    ticketId: row.ticket_id,
    threadId: row.thread_id,
    sourceCreatedAt: new Date(row.source_created_at),
    sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at) : null,
    ftsRank: coerceNumber(row.fts_rank),
  }));

  return { rows, durationMs: Date.now() - start };
}

async function performVectorSearch(queryText: string, options: HybridSearchOptions, extraFilter: SQL): Promise<{ rows: SearchRow[]; durationMs: number }> {
  const start = Date.now();
  const [embedding] = await embedTexts([queryText]);
  if (!embedding) return { rows: [], durationMs: Date.now() - start };

  const vectorLiteral = `[${embedding.join(',')}]`;
  const baseWhere = buildRagAccessWhere(options.scope, {
    includeInternal: options.includeInternal,
    customerId: options.customerId,
    ticketId: options.ticketId,
    allowGlobal: options.allowGlobal,
    enforceTicketId: options.enforceTicketId,
  });

  const query = sql`
    SELECT
      rag_chunks.id AS chunk_id,
      rag_chunks.source_id,
      rag_chunks.chunk_index,
      rag_chunks.chunk_text,
      rag_sources.source_type,
      rag_sources.source_uri,
      rag_sources.title,
      rag_sources.metadata,
      rag_sources.sensitivity,
      rag_sources.customer_id,
      rag_sources.ticket_id,
      rag_sources.thread_id,
      rag_sources.source_created_at,
      rag_sources.source_updated_at,
      1 - (rag_chunks.embedding <=> CAST(${vectorLiteral} AS vector)) AS vector_score
    FROM ticketing_prod.rag_chunks
    JOIN ticketing_prod.rag_sources ON rag_sources.id = rag_chunks.source_id
    WHERE rag_chunks.embedding IS NOT NULL
      AND ${baseWhere}
      AND ${extraFilter}
    ORDER BY rag_chunks.embedding <=> CAST(${vectorLiteral} AS vector)
    LIMIT ${RAG_VECTOR_LIMIT}
  `;

  const result = await db.execute(query);
  const rows = normalizeExecuteRows<any>(result).map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    chunkIndex: Number(row.chunk_index),
    chunkText: row.chunk_text,
    sourceType: row.source_type,
    sourceUri: row.source_uri,
    title: row.title,
    metadata: row.metadata || {},
    sensitivity: row.sensitivity,
    customerId: row.customer_id,
    ticketId: row.ticket_id,
    threadId: row.thread_id,
    sourceCreatedAt: new Date(row.source_created_at),
    sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at) : null,
    vectorScore: coerceNumber(row.vector_score),
  }));

  return { rows, durationMs: Date.now() - start };
}

function buildExtraFilter(options: HybridSearchOptions): SQL {
  const filters: SQL[] = [];

  if (options.sourceTypeIn?.length) {
    filters.push(sql`${ragSources.sourceType} = ANY(ARRAY[${sql.join(options.sourceTypeIn.map(t => sql`${t}`), sql`, `)}]::rag_source_type[])`);
  }
  if (options.excludeTicketId) {
    filters.push(sql`${ragSources.ticketId} IS DISTINCT FROM ${options.excludeTicketId}`);
  }
  if (options.outgoingRepliesOnly) {
    filters.push(sql`${ragSources.metadata}->>'isOutgoingReply' = 'true'`);
  }

  return filters.length ? sql.join(filters, sql` AND `) : sql`TRUE`;
}

function normalizeIdentifier(value: string): string {
  return value.trim();
}

function buildIdentifierFilters(identifiers: RagIdentifiers) {
  const filters: SQL[] = [];
  const scoreParts: SQL[] = [];
  const exactParts: SQL[] = [];

  const addTextMatch = (expr: SQL, value: string) => {
    const normalized = normalizeIdentifier(value);
    const pattern = `%${normalized}%`;
    filters.push(sql`${expr} ILIKE ${pattern}`);
    scoreParts.push(sql`similarity(COALESCE(${expr}, ''), ${normalized})`);
    exactParts.push(sql`CASE WHEN lower(COALESCE(${expr}, '')) = lower(${normalized}) THEN 1 ELSE 0 END`);
  };

  identifiers.orderNumbers.forEach((value) => {
    addTextMatch(sql`${ragSources.metadata}->>'orderNumber'`, value);
    addTextMatch(sql`${ragSources.metadata}->>'externalId'`, value);
  });

  identifiers.invoiceNumbers.forEach((value) => {
    addTextMatch(sql`${ragSources.metadata}->>'invoiceNumber'`, value);
    addTextMatch(sql`${ragSources.metadata}->>'qboInvoiceId'`, value);
  });

  identifiers.poNumbers.forEach((value) => {
    addTextMatch(sql`${ragSources.metadata}->>'poNumber'`, value);
    addTextMatch(sql`${ragSources.metadata}->>'estimateNumber'`, value);
    addTextMatch(sql`${ragSources.metadata}->>'qboEstimateId'`, value);
  });

  identifiers.trackingNumbers.forEach((value) => {
    addTextMatch(sql`${ragSources.metadata}->>'trackingNumber'`, value);
  });

  identifiers.skus.forEach((value) => {
    addTextMatch(sql`${ragSources.metadata}->>'sku'`, value);
    filters.push(sql`${ragSources.metadata}->'itemSkus' ? ${normalizeIdentifier(value)}`);
    exactParts.push(sql`CASE WHEN ${ragSources.metadata}->'itemSkus' ? ${normalizeIdentifier(value)} THEN 1 ELSE 0 END`);
  });

  return { filters, scoreParts, exactParts };
}

async function metadataIdentifierSearch(
  identifiers: RagIdentifiers,
  options: HybridSearchOptions
): Promise<RagResultItem[]> {
  const { filters, scoreParts, exactParts } = buildIdentifierFilters(identifiers);
  if (!filters.length) return [];

  const baseWhere = buildRagAccessWhere(options.scope, {
    includeInternal: options.includeInternal,
    customerId: options.customerId,
    ticketId: options.ticketId,
    allowGlobal: options.allowGlobal,
    enforceTicketId: options.enforceTicketId,
  });
  const extraFilter = buildExtraFilter(options);
  const similaritySql = scoreParts.length
    ? sql`GREATEST(${sql.join(scoreParts, sql`, `)})`
    : sql`0`;
  const exactSql = exactParts.length
    ? sql`(${sql.join(exactParts, sql` + `)})`
    : sql`0`;
  const scoreSql = sql`(${similaritySql}) + (${exactSql}) * 10`;

  const query = sql`
    SELECT
      rag_sources.id AS source_id,
      rag_sources.source_type,
      rag_sources.source_uri,
      rag_sources.title,
      rag_sources.metadata,
      rag_sources.sensitivity,
      rag_sources.customer_id,
      rag_sources.ticket_id,
      rag_sources.thread_id,
      rag_sources.source_created_at,
      rag_sources.source_updated_at,
      rag_sources.content_text,
      ${scoreSql} AS match_score
    FROM ticketing_prod.rag_sources
    WHERE ${baseWhere}
      AND ${extraFilter}
      AND (${sql.join(filters, sql` OR `)})
    ORDER BY match_score DESC
    LIMIT ${options.topK}
  `;

  const result = await db.execute(query);
  const rows = normalizeExecuteRows<any>(result);
  const allowedRows = rows.filter((row) => canViewRagRow(options.scope, {
    customerId: row.customer_id,
    sensitivity: row.sensitivity,
    metadata: row.metadata || {},
  }, { includeInternal: options.includeInternal }));

  return allowedRows.map((row) => {
    const matchScore = coerceNumber(row.match_score) || 0;
    const recencyBoost = computeRecencyBoost(row.source_updated_at || row.source_created_at);
    const finalScore = matchScore * (1 + recencyBoost * 0.1);
    return {
      sourceId: row.source_id,
      sourceType: row.source_type,
      sourceUri: row.source_uri,
      title: row.title,
      snippet: buildSnippet(row.content_text || ''),
      metadata: row.metadata || {},
      customerId: row.customer_id ?? null,
      ticketId: row.ticket_id ?? null,
      sensitivity: row.sensitivity ?? null,
      sourceCreatedAt: new Date(row.source_created_at).toISOString(),
      sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
      score: {
        fusionScore: matchScore,
        recencyBoost,
        finalScore,
      },
    };
  });
}

function mergeEvidenceResults(primary: RagResultItem[], secondary: RagResultItem[], topK: number) {
  const bySource = new Map<string, RagResultItem>();
  const add = (item: RagResultItem) => {
    const existing = bySource.get(item.sourceId);
    const score = item.score?.finalScore ?? 0;
    const existingScore = existing?.score?.finalScore ?? 0;
    if (!existing || score > existingScore) {
      bySource.set(item.sourceId, item);
    }
  };

  primary.forEach(add);
  secondary.forEach(add);

  return Array.from(bySource.values())
    .sort((a, b) => (b.score?.finalScore ?? 0) - (a.score?.finalScore ?? 0))
    .slice(0, topK);
}

async function hybridSearch(queryText: string, intent: RagIntent, options: HybridSearchOptions): Promise<{ results: RagResultItem[]; debug: { ftsMs: number; vectorMs: number; fusionMs: number; ftsCount: number; vectorCount: number; fusedCount: number; finalCount: number; scoreStats: { fts: ReturnType<typeof scoreStats>; vector: ReturnType<typeof scoreStats>; fused: ReturnType<typeof scoreStats> } } }> {
  if (!queryText.trim()) {
    return {
      results: [],
      debug: {
        ftsMs: 0,
        vectorMs: 0,
        fusionMs: 0,
        ftsCount: 0,
        vectorCount: 0,
        fusedCount: 0,
        finalCount: 0,
        scoreStats: { fts: null, vector: null, fused: null },
      },
    };
  }
  const extraFilter = buildExtraFilter(options);
  const [ftsResult, vecResult] = await Promise.all([
    performFtsSearch(queryText, options, extraFilter),
    performVectorSearch(queryText, options, extraFilter),
  ]);
  const ftsRows = ftsResult.rows;
  const vecRows = vecResult.rows;

  const fusionStart = Date.now();
  const ftsRankMap = new Map<string, number>();
  ftsRows.forEach((row, index) => ftsRankMap.set(row.chunkId, index + 1));
  const vecRankMap = new Map<string, number>();
  vecRows.forEach((row, index) => vecRankMap.set(row.chunkId, index + 1));

  const combinedMap = new Map<string, SearchRow>();
  [...ftsRows, ...vecRows].forEach((row) => {
    if (!combinedMap.has(row.chunkId)) combinedMap.set(row.chunkId, row);
  });

  const candidates = Array.from(combinedMap.values()).map((row) => {
    const rankFts = ftsRankMap.get(row.chunkId);
    const rankVec = vecRankMap.get(row.chunkId);
    const fusionScore =
      (rankFts ? 1 / (RAG_RRF_K + rankFts) : 0) +
      (rankVec ? 1 / (RAG_RRF_K + rankVec) : 0);

    const recencyBoost = computeRecencyBoost(row.sourceUpdatedAt || row.sourceCreatedAt);
    const intentBoost = getIntentBoost(intent, row.sourceType);
    const ticketBoost = options.ticketId && row.ticketId === options.ticketId ? 1.1 : 1;
    const finalScore = fusionScore * intentBoost * (1 + recencyBoost * 0.2) * ticketBoost;

    const score: RagScoreBreakdown = {
      ftsRank: row.ftsRank,
      vectorScore: row.vectorScore,
      fusionScore,
      recencyBoost,
      finalScore,
    };

    return { row, score };
  });

  const bySource = new Map<string, { row: SearchRow; score: RagScoreBreakdown }>();
  candidates.forEach((candidate) => {
    const existing = bySource.get(candidate.row.sourceId);
    if (!existing || (candidate.score.finalScore || 0) > (existing.score.finalScore || 0)) {
      bySource.set(candidate.row.sourceId, candidate);
    }
  });

  const filtered = Array.from(bySource.values())
    .filter((entry) => canViewRagRow(options.scope, {
      customerId: entry.row.customerId,
      sensitivity: entry.row.sensitivity,
      metadata: entry.row.metadata,
    }, { includeInternal: options.includeInternal }))
    .sort((a, b) => (b.score.finalScore || 0) - (a.score.finalScore || 0))
    .slice(0, options.topK);
  const fusionMs = Date.now() - fusionStart;

  const results: RagResultItem[] = [];
  for (const entry of filtered) {
    const snippet = await expandSnippet(entry.row);
    results.push({
      sourceId: entry.row.sourceId,
      sourceType: entry.row.sourceType,
      sourceUri: entry.row.sourceUri,
      title: entry.row.title,
      snippet,
      metadata: entry.row.metadata,
      customerId: entry.row.customerId ?? null,
      ticketId: entry.row.ticketId ?? null,
      sensitivity: entry.row.sensitivity ?? null,
      sourceCreatedAt: entry.row.sourceCreatedAt.toISOString(),
      sourceUpdatedAt: entry.row.sourceUpdatedAt ? entry.row.sourceUpdatedAt.toISOString() : null,
      score: entry.score,
    });
  }

  const ftsScores = ftsRows.map((row) => row.ftsRank ?? 0).filter((value) => value > 0);
  const vectorScores = vecRows.map((row) => row.vectorScore ?? 0).filter((value) => value > 0);
  const fusedScores = results.map((result) => result.score.finalScore ?? 0).filter((value) => value > 0);

  return {
    results,
    debug: {
      ftsMs: ftsResult.durationMs,
      vectorMs: vecResult.durationMs,
      fusionMs,
      ftsCount: ftsRows.length,
      vectorCount: vecRows.length,
      fusedCount: combinedMap.size,
      finalCount: results.length,
      scoreStats: {
        fts: scoreStats(ftsScores),
        vector: scoreStats(vectorScores),
        fused: scoreStats(fusedScores),
      },
    },
  };
}

function confidenceLabel(intent: RagIntent, truthResults: RagTruthResult[], evidenceResults: RagResultItem[]): 'low' | 'medium' | 'high' {
  if ((intent === 'identifier_lookup' || intent === 'payments_terms' || intent === 'logistics_shipping') && truthResults.length > 0) {
    return 'high';
  }
  if (!evidenceResults.length) return 'low';
  const topScore = evidenceResults[0].score.finalScore || 0;
  if (topScore > 0.05) return 'medium';
  return 'low';
}

export async function queryRag(params: {
  queryText: string;
  scope: ViewerScope;
  filters?: RagQueryFilters;
  customerId?: number | null;
  ticketId?: number | null;
  topK?: number;
  withDebug?: boolean;
}) {
  const { queryText, scope, filters } = params;
  const topK = params.topK || RAG_DEFAULT_TOP_K;

  if (!queryText.trim()) {
    return {
      intent: 'account_history' as RagIntent,
      truthResults: [],
      evidenceResults: [],
      confidence: 'low' as const,
    };
  }

  const identifiers = extractIdentifiers(queryText);
  const intent = classifyIntent(queryText, identifiers);
  const access = await resolveQueryContext({
    scope,
    customerId: params.customerId ?? null,
    ticketId: params.ticketId ?? null,
    includeInternal: filters?.includeInternal,
    allowGlobal: filters?.allowGlobal,
  });

  if (!access.allowed) {
    const denyFilters = {
      ...access.filtersApplied,
      requestedSourceTypeIn: filters?.sourceTypeIn ?? null,
    };
    logWarn('rag.access_denied', {
      userId: scope.userId,
      denyReason: access.denyReason,
      customerId: access.customerId,
      ticketId: access.ticketId,
      allowGlobal: access.allowGlobal,
    });
    throw new RagAccessError('RAG access denied', {
      denyReason: access.denyReason || 'access_denied',
      filtersApplied: denyFilters,
      intent,
    });
  }

  const structuredStart = Date.now();
  const truthResults = STRUCTURED_INTENTS.has(intent)
    ? await structuredLookup({ identifiers, intent, scope, customerId: access.customerId })
    : [];
  const structuredMs = Date.now() - structuredStart;

  const baseSearchOptions = {
    topK,
    scope,
    includeInternal: access.includeInternal,
    customerId: access.customerId,
    ticketId: access.ticketId,
    allowGlobal: access.allowGlobal,
    enforceTicketId: access.ticketId != null && access.customerId == null,
    sourceTypeIn: filters?.sourceTypeIn,
  };

  const metadataResults = intent === 'identifier_lookup'
    ? await metadataIdentifierSearch(identifiers, baseSearchOptions)
    : [];

  const structuredFirst = truthResults.length > 0 && !filters?.sourceTypeIn;
  const hybridOptions = structuredFirst
    ? { ...baseSearchOptions, sourceTypeIn: NARRATIVE_SOURCE_TYPES }
    : baseSearchOptions;

  const { results: hybridResults, debug } = await hybridSearch(queryText, intent, hybridOptions);
  const mergeStart = Date.now();
  const evidenceResults = intent === 'identifier_lookup'
    ? mergeEvidenceResults(metadataResults, hybridResults, topK)
    : hybridResults;
  const mergeMs = Date.now() - mergeStart;

  const confidence = confidenceLabel(intent, truthResults, evidenceResults);
  const retrievalPath = truthResults.length
    ? (evidenceResults.length ? 'structured_plus_hybrid' : 'structured_only')
    : (evidenceResults.length ? 'hybrid_only' : 'no_results');
  const metadataSourceIds = new Set(metadataResults.map((item) => item.sourceId));
  const debugLimit = 10;
  const evidenceReasons = evidenceResults.slice(0, debugLimit).map((item) => {
    const matchedBy = item.score?.ftsRank ? 'fts' : item.score?.vectorScore ? 'vector' : 'metadata';
    return {
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      customerId: item.customerId ?? null,
      ticketId: item.ticketId ?? null,
      sensitivity: item.sensitivity ?? null,
      matchedBy,
      score: item.score,
      filtersApplied: {
        ...access.filtersApplied,
        appliedSourceTypeIn: hybridOptions.sourceTypeIn ?? null,
        requestedSourceTypeIn: baseSearchOptions.sourceTypeIn ?? null,
        ticketFilterApplied: hybridOptions.enforceTicketId ?? null,
      },
      signals: {
        fts: Boolean(item.score?.ftsRank),
        vector: Boolean(item.score?.vectorScore),
        metadata: metadataSourceIds.has(item.sourceId),
      },
    };
  });
  const filtersApplied = {
    ...access.filtersApplied,
    appliedSourceTypeIn: hybridOptions.sourceTypeIn ?? null,
    requestedSourceTypeIn: baseSearchOptions.sourceTypeIn ?? null,
    ticketFilterApplied: hybridOptions.enforceTicketId ?? null,
    identifiers,
  };
  const returnedCount = (truthResults.length || 0) + (evidenceResults.length || 0);
  if (returnedCount === 0) {
    logInfo('rag.retrieval.empty', {
      userId: scope.userId,
      intent,
      customerId: access.customerId,
      ticketId: access.ticketId,
      filtersApplied,
      topK,
    });
  }

  return {
    intent,
    truthResults,
    evidenceResults,
    confidence,
    debug: params.withDebug
      ? {
          structuredMs,
          mergeMs,
          retrievalPath,
          pathUsed: retrievalPath,
          timings: {
            structuredMs,
            ftsMs: debug.ftsMs,
            vectorMs: debug.vectorMs,
            fusionMs: debug.fusionMs,
            mergeMs,
          },
          filtersApplied,
          evidenceReasons,
          ...debug,
        }
      : undefined,
  };
}

export async function findSimilarTickets(params: {
  ticketId: number;
  scope: ViewerScope;
  topK?: number;
}) {
  const { ticketId, scope } = params;
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: { comments: true },
  });

  if (!ticket) return [];

  const customerId = ticket.customerId ?? null;
  const includeInternal = resolveIncludeInternal(scope);
  const access = await resolveQueryContext({
    scope,
    customerId,
    ticketId,
    includeInternal,
    ticketCustomerId: customerId,
  });
  if (!access.allowed) return [];
  const commentText = (ticket.comments || [])
    .filter((comment) => includeInternal || !comment.isInternalNote)
    .map((comment) => comment.commentText)
    .slice(0, 6)
    .join('\n');

  const queryText = [ticket.title, ticket.description || '', commentText].filter(Boolean).join('\n');

  const { results } = await hybridSearch(queryText, 'account_history', {
    topK: params.topK || RAG_DEFAULT_TOP_K,
    scope,
    includeInternal: access.includeInternal,
    customerId: access.customerId,
    excludeTicketId: ticketId,
    sourceTypeIn: ['ticket', 'ticket_comment', 'email'],
  });

  const grouped = new Map<number, RagResultItem>();
  results.forEach((result) => {
    const relatedTicketId = Number(result.metadata.ticketId || result.metadata.ticket_id || result.metadata.ticket);
    if (!relatedTicketId || relatedTicketId === ticketId) return;
    const normalized: RagResultItem = {
      ...result,
      sourceUri: `/tickets/${relatedTicketId}`,
      title: result.title || `Ticket #${relatedTicketId}`,
    };
    const existing = grouped.get(relatedTicketId);
    if (!existing || (normalized.score.finalScore || 0) > (existing.score.finalScore || 0)) {
      grouped.set(relatedTicketId, normalized);
    }
  });

  return Array.from(grouped.values()).sort((a, b) => (b.score.finalScore || 0) - (a.score.finalScore || 0)).slice(0, params.topK || RAG_DEFAULT_TOP_K);
}

export async function findSimilarReplies(params: {
  ticketId: number;
  scope: ViewerScope;
  topK?: number;
  includeInternal?: boolean;
}) {
  const { ticketId, scope, includeInternal = false } = params;
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: { comments: true },
  });

  if (!ticket) return [];

  const customerId = ticket.customerId ?? null;
  const resolvedIncludeInternal = resolveIncludeInternal(scope, includeInternal);
  const access = await resolveQueryContext({
    scope,
    customerId,
    ticketId,
    includeInternal: resolvedIncludeInternal,
    ticketCustomerId: customerId,
  });
  if (!access.allowed) return [];
  const customerComment = (ticket.comments || []).find((comment) => comment.isFromCustomer);
  const queryText = [ticket.title, ticket.description || '', customerComment?.commentText || ''].filter(Boolean).join('\n');

  const { results } = await hybridSearch(queryText, 'troubleshooting', {
    topK: params.topK || RAG_DEFAULT_TOP_K,
    scope,
    includeInternal: access.includeInternal,
    customerId: access.customerId,
    excludeTicketId: ticketId,
    sourceTypeIn: ['ticket_comment'],
    outgoingRepliesOnly: true,
  });

  return results;
}
