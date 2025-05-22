import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

// Check for required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the connection with pooling configuration
const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString, {
  max: 10, // Maximum number of connections in the pool
  idle_timeout: 20, // Maximum idle time in seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for better performance in serverless
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  transform: {
    undefined: null, // Transform undefined to null
  },
  debug: process.env.NODE_ENV === 'development', // Enable debug logging in development
});

// Create the database instance
export const db = drizzle(client, { schema });

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