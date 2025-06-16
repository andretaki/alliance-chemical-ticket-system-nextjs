import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Import the main schema tables
import * as ticketingProdSchemaTables from '@/db/schema';

// Check for required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the connection with optimized serverless configuration
const connectionString = process.env.DATABASE_URL;

const client = postgres(connectionString, {
  // Connection pool settings optimized for serverless
  max: process.env.NODE_ENV === 'production' ? 5 : 10,
  idle_timeout: 20, // seconds
  connect_timeout: 10, // seconds
  
  prepare: false, // Disable prepared statements for better serverless performance
});

// Create the single, exported database instance
export const db = drizzle(client, {
  schema: ticketingProdSchemaTables,
  logger: process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true'
});

console.log("Database client initialized successfully.");

// Re-export all table and enum definitions for easier access
export * from '@/db/schema';
