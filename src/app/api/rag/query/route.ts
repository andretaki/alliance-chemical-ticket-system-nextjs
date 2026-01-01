import crypto from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { CacheService } from '@/lib/cache';
import { db, ragQueryLog } from '@/lib/db';
import { getViewerScope } from '@/services/rag/ragRbac';
import { queryRag, RagAccessError } from '@/services/rag/ragRetrievalService';

const idSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}, z.number().int().positive().optional());

const filtersSchema = z.object({
  sourceTypeIn: z.array(z.string()).optional(),
  includeInternal: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true';
  }, z.boolean().optional()),
  allowGlobal: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true';
  }, z.boolean().optional()),
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
}).passthrough();

const querySchema = z.object({
  queryText: z.string().min(1),
  customerId: idSchema,
  ticketId: idSchema,
  filters: filtersSchema.optional(),
  topK: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number().int().min(1).max(50).optional()),
  debug: z.boolean().optional(),
});

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
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const scope = await getViewerScope();
  if (!scope) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { queryText, customerId, ticketId, filters, topK, debug } = parsed.data;
  const allowDebug = Boolean(debug && scope.isAdmin);

  const ip = getClientIP(request);
  const userLimiter = await rateLimiters.rag.check(`rag:user:${session.user.id}`);
  const ipLimiter = await rateLimiters.rag.check(`rag:ip:${ip}`);

  if (!userLimiter.allowed || !ipLimiter.allowed) {
    const reset = Math.min(userLimiter.resetTime, ipLimiter.resetTime);
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'RAG rate limit exceeded. Please try again later.',
        resetTime: new Date(reset).toISOString(),
      },
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
    return NextResponse.json(allowDebug ? cached : { ...cached, debug: undefined });
  }

  let result;
  try {
    result = await queryRag({
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
      return NextResponse.json(
        { error: 'Forbidden', reason: error.denyReason },
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
    return NextResponse.json({ ...result, debug: undefined });
  }

  return NextResponse.json(result);
}
