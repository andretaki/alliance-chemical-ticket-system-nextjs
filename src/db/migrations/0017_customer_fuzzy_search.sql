-- Migration: Add trigram indexes for fuzzy customer search
-- Description: Enables fast fuzzy matching on customer names using pg_trgm

-- Ensure pg_trgm is available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create generated column for searchable full name (normalized)
-- This allows efficient trigram matching on "andretaki" → "Andre Taki"
ALTER TABLE ticketing_prod.customers
ADD COLUMN IF NOT EXISTS search_name TEXT
GENERATED ALWAYS AS (
  LOWER(
    COALESCE(first_name, '') ||
    COALESCE(last_name, '') ||
    ' ' ||
    COALESCE(company, '')
  )
) STORED;

-- Trigram index on normalized name for fuzzy search
CREATE INDEX IF NOT EXISTS idx_customers_search_name_trgm
ON ticketing_prod.customers USING GIN (search_name gin_trgm_ops);

-- Trigram index on email for typo-tolerant email search
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm
ON ticketing_prod.customers USING GIN (primary_email gin_trgm_ops);

-- Trigram index on company name
CREATE INDEX IF NOT EXISTS idx_customers_company_trgm
ON ticketing_prod.customers USING GIN (company gin_trgm_ops);

-- Full-text search vector for comprehensive search
ALTER TABLE ticketing_prod.customers
ADD COLUMN IF NOT EXISTS tsv tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE(first_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(last_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(company, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(primary_email, '')), 'A')
) STORED;

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_customers_tsv
ON ticketing_prod.customers USING GIN (tsv);
