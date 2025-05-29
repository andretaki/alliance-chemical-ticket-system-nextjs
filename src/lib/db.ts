import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Import all schemas that need to be available through the 'db' instance
import * as ticketingProdSchemaTables from '@/db/schema'; // Main app schema (users, tickets, etc.)
import * as ragSystemSchemaTables from './db/ragSchema';   // RAG schema (documents, chunks)

// Check for required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the connection with pooling configuration
const connectionString = process.env.DATABASE_URL;

// Check if SSL is required from the connection string or if we should enable it by default
const shouldUseSSL = connectionString.includes('sslmode=require') || 
                     connectionString.includes('ssl=true') ||
                     process.env.NODE_ENV === 'production' ||
                     connectionString.includes('.aws.neon.tech') || // Neon requires SSL
                     connectionString.includes('.supabase.') ||     // Supabase requires SSL
                     connectionString.includes('.vercel.'); // Vercel Postgres requires SSL

const client = postgres(connectionString, {
  max: 10, // Maximum number of connections in the pool
  idle_timeout: 20, // Maximum idle time in seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for better performance in serverless
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined,
  transform: {
    undefined: null, // Transform undefined to null
  },
  debug: process.env.NODE_ENV === 'development', // Enable debug logging in development
});

// Combine all schema tables into one schema object for Drizzle
const combinedSchema = {
  ...ticketingProdSchemaTables,
  ...ragSystemSchemaTables,
};

// Create the database instance
export const db = drizzle(client, { schema: combinedSchema /*, logger: true */ });

// Add connection error handling
// Note: postgres.js doesn't expose event handlers, so we'll handle errors in queries
const handleQueryError = (error: Error) => {
  console.error('Database query error:', error);
};

// Add connection pool monitoring in development
if (process.env.NODE_ENV === 'development') {
  setInterval(async () => {
    try {
      // Execute a simple query to check connection health
      await client`SELECT 1`;
      console.log('Database connection health check: OK');
    } catch (error) {
      console.error('Database connection health check failed:', error);
    }
  }, 30000); // Check every 30 seconds in development
}

// Re-export all table and enum definitions for easier access in the app
// This way, other files can import { users, tickets } from '@/lib/db'
export * from '@/db/schema';
export * from './db/ragSchema'; 