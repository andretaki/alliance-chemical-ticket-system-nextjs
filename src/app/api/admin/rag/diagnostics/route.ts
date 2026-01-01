import { NextResponse, type NextRequest } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { db, ragChunks, ragIngestionJobs, ragSyncCursors } from '@/lib/db';

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

export async function GET(request: NextRequest) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const ip = getClientIP(request);
  const limiter = await rateLimiters.admin.check(`rag:admin:${ip}`);
  if (!limiter.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const [failedJobs, jobStats, cursors, missingEmbeddingRows] = await Promise.all([
    db.query.ragIngestionJobs.findMany({
      where: eq(ragIngestionJobs.status, 'failed'),
      orderBy: desc(ragIngestionJobs.completedAt),
      limit: 50,
    }),
    db.select({
      status: ragIngestionJobs.status,
      count: sql<number>`count(*)`,
    })
      .from(ragIngestionJobs)
      .groupBy(ragIngestionJobs.status),
    db.query.ragSyncCursors.findMany(),
    db.select({
      id: ragChunks.id,
      sourceId: ragChunks.sourceId,
    })
      .from(ragChunks)
      .where(sql`${ragChunks.embedding} IS NULL`)
      .limit(50),
  ]);

  const [missingEmbeddingCountRow] = await db.select({
    count: sql<number>`count(*)`,
  })
    .from(ragChunks)
    .where(sql`${ragChunks.embedding} IS NULL`);

  const stats = jobStats.reduce<Record<string, number>>((acc, row) => {
    acc[String(row.status)] = Number(row.count);
    return acc;
  }, {});

  return NextResponse.json({
    jobs: {
      stats,
      failed: failedJobs,
    },
    embeddings: {
      missingCount: Number(missingEmbeddingCountRow?.count || 0),
      missingSamples: missingEmbeddingRows,
    },
    cursors,
  });
}
