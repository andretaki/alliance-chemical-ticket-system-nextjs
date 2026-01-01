#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });

  try {
    const jobs = await client`
      SELECT source_type, source_id, status, attempts, error_message
      FROM ticketing_prod.rag_ingestion_jobs
      ORDER BY created_at DESC
      LIMIT 20
    `;
    console.log('RAG ingestion jobs:');
    for (const job of jobs) {
      console.log(`  ${job.source_type}/${job.source_id}: ${job.status} (attempts: ${job.attempts})`);
      if (job.error_message) {
        console.log(`    error: ${job.error_message.slice(0, 200)}`);
      }
    }

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
