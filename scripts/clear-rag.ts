#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const { db } = await import('@/lib/db');
const { sql } = await import('drizzle-orm');

await db.execute(sql.raw(`
  TRUNCATE
    ticketing_prod.rag_chunks,
    ticketing_prod.rag_sources,
    ticketing_prod.rag_ingestion_jobs
  CASCADE
`));
console.log('Cleared RAG tables');
process.exit(0);
