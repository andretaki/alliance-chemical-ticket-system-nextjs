import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { env } from '@/lib/env';

// Import the main schema tables
import * as ticketingProdSchemaTables from '@/db/schema';

// Lazy initialization to avoid build-time errors when DATABASE_URL is not set
let _db: PostgresJsDatabase<typeof ticketingProdSchemaTables> | null = null;

function getDb(): PostgresJsDatabase<typeof ticketingProdSchemaTables> {
  if (_db) return _db;

  const client = postgres(env.DATABASE_URL, {
    // Connection pool settings optimized for serverless
    max: env.NODE_ENV === 'production' ? 5 : 10,
    idle_timeout: 20, // seconds
    connect_timeout: 10, // seconds
    prepare: false, // Disable prepared statements for better serverless performance
  });

  _db = drizzle(client, {
    schema: ticketingProdSchemaTables,
    logger: env.NODE_ENV === 'development' && env.DEBUG_SQL === 'true'
  });

  return _db;
}

// Export a proxy that lazily initializes the db
export const db = new Proxy({} as PostgresJsDatabase<typeof ticketingProdSchemaTables>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  }
});

// Re-export all table and enum definitions for easier access
export * from '@/db/schema';
