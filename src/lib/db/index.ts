import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as ragSchema from './ragSchema';

// Get database connection string from environment variable
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create the postgres client
const client = postgres(connectionString);

// Create the drizzle client with both schemas
export const db = drizzle(client, {
  schema: {
    ...schema,
    ...ragSchema,
  },
});

// Export the client for direct access if needed
export { client }; 