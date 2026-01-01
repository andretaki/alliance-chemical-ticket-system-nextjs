import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });

  try {
    // Check applied migrations
    const applied = await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log('Applied migrations:', applied);

    // Check if RAG tables exist
    const tables = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'ticketing_prod'
      AND table_name LIKE 'rag_%'
      ORDER BY table_name
    `;
    console.log('RAG tables:', tables.map(r => r.table_name));

    // Check if vector extension exists
    const extensions = await client`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    console.log('pgvector extension:', extensions.length > 0 ? 'installed' : 'NOT INSTALLED');

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
