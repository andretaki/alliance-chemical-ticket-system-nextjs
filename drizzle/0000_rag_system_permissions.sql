-- Create the rag_system schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS rag_system;

-- Grant usage on the schema to the application user
GRANT USAGE ON SCHEMA rag_system TO app_user;

-- Grant select permissions on all tables in the schema
GRANT SELECT ON ALL TABLES IN SCHEMA rag_system TO app_user;

-- Grant insert, update, delete permissions on specific tables
-- Uncomment these if your application needs write access to these tables
-- GRANT INSERT, UPDATE, DELETE ON rag_system.documents TO app_user;
-- GRANT INSERT, UPDATE, DELETE ON rag_system.chunks TO app_user;
-- GRANT INSERT, UPDATE, DELETE ON rag_system.shopify_sync_products TO app_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA rag_system
GRANT SELECT ON TABLES TO app_user;

-- Uncomment this if you want to automatically grant write permissions to future tables
-- ALTER DEFAULT PRIVILEGES IN SCHEMA rag_system
-- GRANT INSERT, UPDATE, DELETE ON TABLES TO app_user; 