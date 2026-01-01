-- Initialize Alliance Chemical Ticket System Database
-- This script sets up the basic database structure for development

-- Create the ticketing_prod schema
CREATE SCHEMA IF NOT EXISTS ticketing_prod;

-- Set search path to include our schema
SET search_path TO ticketing_prod, public;

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON SCHEMA ticketing_prod TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ticketing_prod TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ticketing_prod TO postgres;

-- Create a development admin user (will be populated by migrations)
-- This is just to ensure the database is ready for Drizzle migrations
