#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import postgres from 'postgres';
import fs from 'fs';

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const client = postgres(dbUrl, { max: 1 });

  try {
    // Check if vector extension is available
    console.log('\n📦 Checking pgvector extension...');
    try {
      await client`CREATE EXTENSION IF NOT EXISTS vector`;
      console.log('✅ pgvector extension enabled');
    } catch (e: any) {
      if (e.message.includes('not available') || e.message.includes('could not open')) {
        console.error('❌ pgvector is not available on this Neon project');
        console.error('   Go to Neon Console > Project > Extensions > Enable "vector"');
        process.exit(1);
      }
      throw e;
    }

    // Enable pg_trgm for fuzzy search
    await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    console.log('✅ pg_trgm extension enabled');

    // Get applied migrations
    const applied = await client`SELECT hash FROM drizzle.__drizzle_migrations`;
    const appliedSet = new Set(applied.map(r => r.hash));
    console.log(`\n📋 Already applied: ${applied.length} migrations`);

    // Find migration files
    const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && /^\d{4}_/.test(f))
      .sort();

    console.log(`\n📁 Found ${files.length} migration files`);

    // Run pending migrations
    let ran = 0;
    for (const file of files) {
      const tag = file.replace('.sql', '');
      if (appliedSet.has(tag)) {
        console.log(`⏭️  Skipping ${tag} (already applied)`);
        continue;
      }

      console.log(`\n🚀 Running ${tag}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await client.unsafe(sql);
        await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${tag}, ${Date.now().toString()})`;
        console.log(`✅ ${tag} applied successfully`);
        ran++;
      } catch (e: any) {
        // If error is "already exists", mark as applied anyway
        if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
          console.log(`⚠️  ${tag} had conflicts (objects already exist), marking as applied`);
          await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${tag}, ${Date.now().toString()})`;
          ran++;
        } else {
          console.error(`❌ ${tag} failed:`, e.message);
          throw e;
        }
      }
    }

    console.log(`\n✨ Done! Applied ${ran} new migrations.`);

    // Verify RAG tables
    const tables = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'ticketing_prod'
      AND table_name LIKE 'rag_%'
      ORDER BY table_name
    `;
    console.log('\n📊 RAG tables:', tables.map(r => r.table_name).join(', ') || 'none');

  } catch (e: any) {
    console.error('💥 Error:', e.message);
    process.exit(1);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
