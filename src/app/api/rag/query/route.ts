import crypto from 'crypto';
import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { CacheService } from '@/lib/cache';
import { db, ragQueryLog } from '@/lib/db';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { RagQueryRequestSchema, RagQueryResponseSchema } from '@/lib/contracts';
import { getViewerScope } from '@/services/rag/ragRbac';
import { ragRepository } from '@/repositories/RagRepository';
import { RagAccessError } from '@/services/rag/ragRetrievalService';

function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const vercelIP = request.headers.get('x-vercel-forwarded-for');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (vercelIP) {
    return vercelIP;
  }

  return 'unknown';
}

export async function POST(request: NextRequest) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  const scope = await getViewerScope();
  if (!scope) {
    return apiError('unauthorized', 'Unauthorized', undefined, { status: 401 });
  }

  const parsed = RagQueryRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('invalid_request', 'Invalid request', parsed.error.flatten(), { status: 400 });
  }

  const { queryText, customerId, ticketId, filters, topK, debug } = parsed.data;
  const allowDebug = Boolean(debug && scope.isAdmin);

  const ip = getClientIP(request);
  const userLimiter = await rateLimiters.rag.check(`rag:user:${session.user.id}`);
  const ipLimiter = await rateLimiters.rag.check(`rag:ip:${ip}`);

  if (!userLimiter.allowed || !ipLimiter.allowed) {
    const reset = Math.min(userLimiter.resetTime, ipLimiter.resetTime);
    return apiError(
      'rate_limited',
      'RAG rate limit exceeded. Please try again later.',
      { resetTime: new Date(reset).toISOString() },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  const cacheKey = crypto
    .createHash('sha256')
    .update(JSON.stringify({ userId: session.user.id, queryText, customerId, ticketId, filters, topK }))
    .digest('hex');

  const cached = await CacheService.get<any>('RAG_QUERY', cacheKey);
  if (cached) {
    const parsedResult = RagQueryResponseSchema.parse(
      allowDebug ? cached : { ...cached, debug: undefined }
    );
    return apiSuccess(parsedResult);
  }

  let result;
  try {
    result = await ragRepository.query({
      queryText,
      scope,
      filters: filters as any,
      customerId: customerId ?? null,
      ticketId: ticketId ?? null,
      topK,
      withDebug: true,
    });
  } catch (error) {
    if (error instanceof RagAccessError) {
      return apiError(
        'rag_access_denied',
        'RAG access denied',
        { denyReason: error.denyReason },
        { status: error.status }
      );
    }
    throw error;
  }

  const topEvidence = result.evidenceResults.slice(0, 5).map((item) => ({
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    score: item.score?.finalScore ?? null,
  }));
  const topTruth = (result.truthResults || []).slice(0, 3).map((item) => ({
    type: item.type,
    label: item.label,
  }));

  const returnedCount = (result.truthResults?.length || 0) + (result.evidenceResults?.length || 0);
  const debugInfo = {
    ...(result.debug ?? {}),
    topEvidence,
    topTruth,
    topK: topK || 10,
    returnedCount,
  };

  await db.insert(ragQueryLog).values({
    userId: session.user.id,
    queryText,
    queryIntent: result.intent,
    customerId: customerId ?? null,
    ticketId: ticketId ?? null,
    filters: filters || {},
    topK: topK || 10,
    returnedCount,
    confidence: result.confidence,
    ftsLatencyMs: result.debug?.ftsMs ?? null,
    vectorLatencyMs: result.debug?.vectorMs ?? null,
    structuredLatencyMs: result.debug?.structuredMs ?? null,
    rerankLatencyMs: null,
    debugInfo,
    createdAt: new Date(),
  });

  await CacheService.set('RAG_QUERY', cacheKey, result);

  if (!allowDebug) {
    const parsedResult = RagQueryResponseSchema.parse({ ...result, debug: undefined });
    return apiSuccess(parsedResult);
  }

  const parsedResult = RagQueryResponseSchema.parse(result);
  return apiSuccess(parsedResult);
}
