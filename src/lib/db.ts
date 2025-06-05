import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Import all schemas that need to be available through the 'db' instance
import * as ticketingProdSchemaTables from '@/db/schema'; // Main app schema (users, tickets, etc.)
import * as ragSystemSchemaTables from './db/ragSchema';   // RAG schema (documents, chunks)

// Check for required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the connection with optimized serverless configuration
const connectionString = process.env.DATABASE_URL;

// Check if SSL is required from the connection string or if we should enable it by default
const shouldUseSSL = connectionString.includes('sslmode=require') || 
                     connectionString.includes('ssl=true') ||
                     process.env.NODE_ENV === 'production' ||
                     connectionString.includes('.aws.neon.tech') || // Neon requires SSL
                     connectionString.includes('.supabase.') ||     // Supabase requires SSL
                     connectionString.includes('.vercel.'); // Vercel Postgres requires SSL

// Optimized configuration for Vercel serverless
const client = postgres(connectionString, {
  // Connection pool settings optimized for serverless
  max: process.env.NODE_ENV === 'production' ? 5 : 10, // Smaller pool for production serverless
  idle_timeout: 20, // Maximum idle time in seconds
  connect_timeout: 10, // Connection timeout in seconds
  
  // Serverless optimizations
  prepare: false, // Disable prepared statements for better serverless performance
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined,
  
  // Data transformation
  transform: {
    undefined: null, // Transform undefined to null
  },
  
  // Connection management for serverless
  connection: {
    application_name: 'alliance-chemical-nextjs',
  },
  
  // Optimize for short-lived serverless functions
  max_lifetime: 60 * 10, // 10 minutes max connection lifetime
  
  // Enable debug logging only in development
  debug: process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true',
  
  // Serverless-friendly error handling
  onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
  
  // Optimize fetch settings for serverless
  fetch_types: false, // Disable automatic type fetching for better performance
});

// Combine all schema tables into one schema object for Drizzle
const combinedSchema = {
  ...ticketingProdSchemaTables,
  ...ragSystemSchemaTables,
};

// Create the database instance
export const db = drizzle(client, { 
  schema: combinedSchema,
  logger: process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true'
});

// Add connection error handling for serverless
const handleConnectionError = (error: Error) => {
  console.error('Database connection error:', error);
  // In serverless, connection errors are often transient
  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    console.log('Network error detected - this may be transient in serverless environment');
  }
};

// Health check function for serverless (lightweight)
export const checkDbHealth = async (): Promise<boolean> => {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    handleConnectionError(error as Error);
    return false;
  }
};

// Graceful shutdown for serverless (cleanup function)
export const closeDbConnection = async (): Promise<void> => {
  try {
    await client.end();
    console.log('Database connection closed gracefully');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

// Re-export all table and enum definitions for easier access in the app
export * from '@/db/schema';

// Optional: Add monitoring in development only
if (process.env.NODE_ENV === 'development' && process.env.DB_MONITORING === 'true') {
  setInterval(async () => {
    try {
      const isHealthy = await checkDbHealth();
      console.log(`Database health check: ${isHealthy ? 'OK' : 'FAILED'}`);
    } catch (error) {
      console.error('Database health check failed:', error);
    }
  }, 30000); // Check every 30 seconds in development
} 