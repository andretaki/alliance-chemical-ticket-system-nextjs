import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, ragIngestionJobs, ticketComments, tickets } from '@/lib/db';
import { enqueueRagJob, processRagIngestionBatch } from '@/services/rag/ragIngestionService';
import { queryRag } from '@/services/rag/ragRetrievalService';
import type { ViewerScope } from '@/services/rag/ragTypes';

async function main() {
  const ticketId = Number(process.env.RAG_SMOKE_TICKET_ID);
  const queryText = process.env.RAG_SMOKE_QUERY;

  if (!ticketId || Number.isNaN(ticketId) || !queryText) {
    console.error('Usage: RAG_SMOKE_TICKET_ID=<id> RAG_SMOKE_QUERY="<query>" npm run rag:smoke');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && process.env.RAG_SMOKE_ALLOW_WRITE !== 'true') {
    console.error('Refusing to run in production without RAG_SMOKE_ALLOW_WRITE=true');
    process.exit(1);
  }

  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    console.error(`Ticket ${ticketId} not found.`);
    process.exit(1);
  }

  const jobIds: string[] = [];
  const ticketJob = await enqueueRagJob('ticket', String(ticketId), 'reindex', 1);
  if (ticketJob?.id) jobIds.push(ticketJob.id);

  const commentRows = await db.select({ id: ticketComments.id })
    .from(ticketComments)
    .where(eq(ticketComments.ticketId, ticketId));
  for (const row of commentRows) {
    const job = await enqueueRagJob('ticket_comment', String(row.id), 'reindex', 1);
    if (job?.id) jobIds.push(job.id);
  }

  if (!jobIds.length) {
    console.error('No ingestion jobs enqueued. Aborting.');
    process.exit(1);
  }

  for (let i = 0; i < 20; i += 1) {
    await processRagIngestionBatch(25);
    const [pending] = await db.select({ count: sql<number>`count(*)` })
      .from(ragIngestionJobs)
      .where(and(
        inArray(ragIngestionJobs.id, jobIds),
        inArray(ragIngestionJobs.status, ['pending', 'processing', 'failed'])
      ));
    if (!pending || Number(pending.count) === 0) break;
  }

  const scope: ViewerScope = {
    userId: 'rag-smoke',
    role: 'admin',
    isAdmin: true,
    isManager: false,
    isExternal: false,
    allowInternal: true,
    allowedCustomerIds: [],
    allowedDepartments: ['*'],
  };

  const result = await queryRag({
    queryText,
    scope,
    customerId: ticket.customerId ?? null,
    ticketId,
    topK: 5,
    withDebug: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[ragSmoke] Failed:', error);
  process.exit(1);
});
