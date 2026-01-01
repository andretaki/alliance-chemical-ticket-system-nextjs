#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';

// Load env FIRST before any other imports
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Set test credentials
process.env.MICROSOFT_GRAPH_CLIENT_ID = 'test';
process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'test';
process.env.MICROSOFT_GRAPH_TENANT_ID = 'test';
process.env.SHARED_MAILBOX_ADDRESS = 'shared@example.com';

// Dynamic imports after env is loaded
const { db, ragIngestionJobs } = await import('@/lib/db');
const { integrations } = await import('@/lib/env');
const { processRagIngestionBatch } = await import('@/services/rag/ragIngestionService');
const { inArray, and, or, eq, lte, isNull } = await import('drizzle-orm');

async function main() {
  console.log('Integrations:', integrations);
  console.log('');

  // Check pending jobs
  const now = new Date();
  const jobs = await db
    .select()
    .from(ragIngestionJobs)
    .where(
      and(
        inArray(ragIngestionJobs.status, ['pending', 'failed']),
        or(isNull(ragIngestionJobs.nextRetryAt), lte(ragIngestionJobs.nextRetryAt, now))
      )
    )
    .limit(10);

  console.log('Jobs matching query:', jobs.length);
  for (const job of jobs) {
    console.log(`  ${job.sourceType}/${job.sourceId}: status=${job.status}, nextRetryAt=${job.nextRetryAt}`);
  }

  if (jobs.length === 0) {
    console.log('\nNo jobs to process!');

    // Check all jobs
    const allJobs = await db.select().from(ragIngestionJobs).limit(10);
    console.log('\nAll jobs in table:', allJobs.length);
    for (const job of allJobs) {
      console.log(`  ${job.sourceType}/${job.sourceId}: status=${job.status}`);
    }
  } else {
    console.log('\nAttempting to process...');
    try {
      await processRagIngestionBatch(25);
      console.log('✅ Processing completed');
    } catch (e: any) {
      console.error('❌ Processing failed:', e.message);
    }

    // Check status after processing
    const after = await db.select().from(ragIngestionJobs).limit(10);
    console.log('\nJobs after processing:');
    for (const job of after) {
      console.log(`  ${job.sourceType}/${job.sourceId}: status=${job.status}, attempts=${job.attempts}, error=${job.errorMessage?.slice(0, 100)}`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
