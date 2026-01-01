import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { getViewerScope } from '@/services/rag/ragRbac';
import { findSimilarReplies } from '@/services/rag/ragRetrievalService';

const schema = z.object({
  ticketId: z.preprocess((value) => Number(value), z.number().int().positive()),
  topK: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().min(1).max(20).optional()),
  includeInternal: z.preprocess((value) => value === 'true' || value === true, z.boolean().optional()),
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
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const scope = await getViewerScope();
  if (!scope) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = getClientIP(request);
  const userLimiter = await rateLimiters.rag.check(`rag:user:${session.user.id}`);
  const ipLimiter = await rateLimiters.rag.check(`rag:ip:${ip}`);
  if (!userLimiter.allowed || !ipLimiter.allowed) {
    const reset = Math.min(userLimiter.resetTime, ipLimiter.resetTime);
    return NextResponse.json({ error: 'Too Many Requests', resetTime: new Date(reset).toISOString() }, { status: 429 });
  }

  const results = await findSimilarReplies({
    ticketId: parsed.data.ticketId,
    scope,
    topK: parsed.data.topK,
    includeInternal: parsed.data.includeInternal,
  });

  return NextResponse.json({ results });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const payload = {
    ticketId: url.searchParams.get('ticketId'),
    topK: url.searchParams.get('topK'),
    includeInternal: url.searchParams.get('includeInternal'),
  };
  return handle(request, payload);
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  return handle(request, payload);
}
