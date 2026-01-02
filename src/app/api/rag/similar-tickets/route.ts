import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { RagSimilarResultsResponseSchema } from '@/lib/contracts';
import { getViewerScope } from '@/services/rag/ragRbac';
import { ragRepository } from '@/repositories/RagRepository';

const schema = z.object({
  ticketId: z.preprocess((value) => Number(value), z.number().int().positive()),
  topK: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().min(1).max(20).optional()),
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

async function handle(request: NextRequest, payload: unknown) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  const scope = await getViewerScope();
  if (!scope) {
    return apiError('unauthorized', 'Unauthorized', undefined, { status: 401 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return apiError('invalid_request', 'Invalid request', parsed.error.flatten(), { status: 400 });
  }

  const ip = getClientIP(request);
  const userLimiter = await rateLimiters.rag.check(`rag:user:${session.user.id}`);
  const ipLimiter = await rateLimiters.rag.check(`rag:ip:${ip}`);
  if (!userLimiter.allowed || !ipLimiter.allowed) {
    const reset = Math.min(userLimiter.resetTime, ipLimiter.resetTime);
    return apiError(
      'rate_limited',
      'RAG rate limit exceeded. Please try again later.',
      { resetTime: new Date(reset).toISOString() },
      { status: 429 }
    );
  }

  try {
    const results = await ragRepository.findSimilarTickets({
      ticketId: parsed.data.ticketId,
      scope,
      topK: parsed.data.topK,
    });

    const payloadData = RagSimilarResultsResponseSchema.parse({ results });
    return apiSuccess(payloadData);
  } catch (err) {
    console.error('[rag.similar-tickets] Failed to load results:', err);
    return apiError('server_error', 'Failed to load similar tickets', undefined, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const payload = {
    ticketId: url.searchParams.get('ticketId'),
    topK: url.searchParams.get('topK'),
  };
  return handle(request, payload);
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  return handle(request, payload);
}
