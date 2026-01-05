-- Migration: Customer Search Read Model (Denormalized Search Documents)
-- Description: Creates a dedicated search table with all customer data flattened for fast retrieval
-- Architecture: Functional Core / Imperative Shell - this is a READ MODEL maintained by triggers

-- Required extensions
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- IMMUTABLE UNACCENT WRAPPER
-- =============================================================================
-- unaccent() is STABLE, not IMMUTABLE, so we need a wrapper for indexes/generated columns

CREATE OR REPLACE FUNCTION ticketing_prod.f_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- =============================================================================
-- CUSTOMER SEARCH DOCUMENTS TABLE
-- =============================================================================
-- Denormalized search document containing all searchable customer data.
-- This eliminates expensive JOINs at query time.

CREATE TABLE IF NOT EXISTS ticketing_prod.customer_search_documents (
  customer_id INTEGER PRIMARY KEY REFERENCES ticketing_prod.customers(id) ON DELETE CASCADE,

  -- Denormalized customer fields
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  is_vip BOOLEAN DEFAULT FALSE,

  -- Aggregated from customer_identities (arrays for easy searching)
  all_emails TEXT[] DEFAULT '{}',          -- All emails including identities
  all_phones TEXT[] DEFAULT '{}',          -- All phones including identities
  identity_providers TEXT[] DEFAULT '{}',  -- ['shopify', 'quickbooks', 'email']

  -- Normalized search fields (pre-computed for speed)
  search_name TEXT,                        -- "andretaki" (no spaces, lowercased, unaccented)
  search_name_tokens TEXT,                 -- "andre taki" (spaces preserved, for word_similarity)
  search_emails TEXT,                      -- All emails concatenated, lowercased
  search_phones TEXT,                      -- All phones normalized (digits only)
  search_text TEXT,                        -- Everything concatenated for FTS fallback

  -- Full-text search vector (computed by trigger, not generated - unaccent isn't immutable)
  tsv tsvector,

  -- Timestamps for cache invalidation
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_updated_at TIMESTAMPTZ
);

-- =============================================================================
-- INDEXES FOR FAST CANDIDATE RETRIEVAL (Stage A)
-- =============================================================================

-- Trigram indexes for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_csd_search_name_trgm
  ON ticketing_prod.customer_search_documents USING GIN (search_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_csd_search_name_tokens_trgm
  ON ticketing_prod.customer_search_documents USING GIN (search_name_tokens gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_csd_search_emails_trgm
  ON ticketing_prod.customer_search_documents USING GIN (search_emails gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_csd_company_trgm
  ON ticketing_prod.customer_search_documents USING GIN (company gin_trgm_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_csd_tsv
  ON ticketing_prod.customer_search_documents USING GIN (tsv);

-- Array indexes for email/phone containment
CREATE INDEX IF NOT EXISTS idx_csd_all_emails
  ON ticketing_prod.customer_search_documents USING GIN (all_emails);

CREATE INDEX IF NOT EXISTS idx_csd_all_phones
  ON ticketing_prod.customer_search_documents USING GIN (all_phones);

-- B-tree for exact matches (fastest)
CREATE INDEX IF NOT EXISTS idx_csd_primary_email_lower
  ON ticketing_prod.customer_search_documents (lower(primary_email));

CREATE INDEX IF NOT EXISTS idx_csd_search_phones
  ON ticketing_prod.customer_search_documents (search_phones);

-- =============================================================================
-- REBUILD FUNCTION
-- =============================================================================
-- Rebuilds a single customer's search document from source tables.
-- Called by triggers and can be called manually for repairs.

CREATE OR REPLACE FUNCTION ticketing_prod.rebuild_customer_search_document(p_customer_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_customer RECORD;
  v_emails TEXT[];
  v_phones TEXT[];
  v_providers TEXT[];
  v_search_name TEXT;
  v_search_name_tokens TEXT;
  v_search_emails TEXT;
  v_search_phones TEXT;
  v_search_text TEXT;
  v_tsv tsvector;
BEGIN
  -- Get customer base data
  SELECT * INTO v_customer
  FROM ticketing_prod.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    -- Customer deleted, remove search doc
    DELETE FROM ticketing_prod.customer_search_documents WHERE customer_id = p_customer_id;
    RETURN;
  END IF;

  -- Aggregate all emails and phones from identities
  SELECT
    array_agg(DISTINCT lower(email)) FILTER (WHERE email IS NOT NULL AND email != ''),
    array_agg(DISTINCT regexp_replace(phone, '[^0-9]', '', 'g')) FILTER (WHERE phone IS NOT NULL AND phone != ''),
    array_agg(DISTINCT provider) FILTER (WHERE provider IS NOT NULL)
  INTO v_emails, v_phones, v_providers
  FROM ticketing_prod.customer_identities
  WHERE customer_id = p_customer_id;

  -- Add primary email/phone to arrays
  IF v_customer.primary_email IS NOT NULL AND v_customer.primary_email != '' THEN
    v_emails := array_append(COALESCE(v_emails, '{}'), lower(v_customer.primary_email));
  END IF;
  IF v_customer.primary_phone IS NOT NULL AND v_customer.primary_phone != '' THEN
    v_phones := array_append(COALESCE(v_phones, '{}'), regexp_replace(v_customer.primary_phone, '[^0-9]', '', 'g'));
  END IF;

  -- Dedupe arrays
  SELECT array_agg(DISTINCT x) INTO v_emails FROM unnest(COALESCE(v_emails, '{}')) x WHERE x IS NOT NULL AND x != '';
  SELECT array_agg(DISTINCT x) INTO v_phones FROM unnest(COALESCE(v_phones, '{}')) x WHERE x IS NOT NULL AND x != '';

  -- Compute normalized search fields
  v_search_name := lower(ticketing_prod.f_unaccent(regexp_replace(
    COALESCE(v_customer.first_name, '') || COALESCE(v_customer.last_name, ''),
    '\s+', '', 'g'
  )));

  v_search_name_tokens := lower(ticketing_prod.f_unaccent(trim(
    COALESCE(v_customer.first_name, '') || ' ' || COALESCE(v_customer.last_name, '')
  )));

  v_search_emails := array_to_string(COALESCE(v_emails, '{}'), ' ');

  v_search_phones := array_to_string(COALESCE(v_phones, '{}'), ' ');

  v_search_text := lower(ticketing_prod.f_unaccent(
    COALESCE(v_customer.first_name, '') || ' ' ||
    COALESCE(v_customer.last_name, '') || ' ' ||
    COALESCE(v_customer.company, '') || ' ' ||
    v_search_emails || ' ' ||
    v_search_phones
  ));

  -- Compute weighted tsvector
  v_tsv :=
    setweight(to_tsvector('simple', ticketing_prod.f_unaccent(COALESCE(v_customer.first_name, ''))), 'A') ||
    setweight(to_tsvector('simple', ticketing_prod.f_unaccent(COALESCE(v_customer.last_name, ''))), 'A') ||
    setweight(to_tsvector('simple', ticketing_prod.f_unaccent(COALESCE(v_customer.company, ''))), 'B') ||
    setweight(to_tsvector('simple', COALESCE(v_search_emails, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(v_search_text, '')), 'C');

  -- Upsert the search document
  INSERT INTO ticketing_prod.customer_search_documents (
    customer_id,
    first_name,
    last_name,
    company,
    primary_email,
    primary_phone,
    is_vip,
    all_emails,
    all_phones,
    identity_providers,
    search_name,
    search_name_tokens,
    search_emails,
    search_phones,
    search_text,
    tsv,
    indexed_at,
    customer_updated_at
  ) VALUES (
    p_customer_id,
    v_customer.first_name,
    v_customer.last_name,
    v_customer.company,
    v_customer.primary_email,
    v_customer.primary_phone,
    COALESCE(v_customer.is_vip, FALSE),
    COALESCE(v_emails, '{}'),
    COALESCE(v_phones, '{}'),
    COALESCE(v_providers, '{}'),
    v_search_name,
    v_search_name_tokens,
    v_search_emails,
    v_search_phones,
    v_search_text,
    v_tsv,
    NOW(),
    v_customer.updated_at
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    company = EXCLUDED.company,
    primary_email = EXCLUDED.primary_email,
    primary_phone = EXCLUDED.primary_phone,
    is_vip = EXCLUDED.is_vip,
    all_emails = EXCLUDED.all_emails,
    all_phones = EXCLUDED.all_phones,
    identity_providers = EXCLUDED.identity_providers,
    search_name = EXCLUDED.search_name,
    search_name_tokens = EXCLUDED.search_name_tokens,
    search_emails = EXCLUDED.search_emails,
    search_phones = EXCLUDED.search_phones,
    search_text = EXCLUDED.search_text,
    tsv = EXCLUDED.tsv,
    indexed_at = NOW(),
    customer_updated_at = EXCLUDED.customer_updated_at;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger function for customers table
CREATE OR REPLACE FUNCTION ticketing_prod.trigger_rebuild_customer_search()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ticketing_prod.customer_search_documents WHERE customer_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM ticketing_prod.rebuild_customer_search_document(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for customer_identities table
CREATE OR REPLACE FUNCTION ticketing_prod.trigger_rebuild_customer_search_from_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM ticketing_prod.rebuild_customer_search_document(OLD.customer_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.customer_id IS NOT NULL THEN
    PERFORM ticketing_prod.rebuild_customer_search_document(NEW.customer_id);
  END IF;
  -- Handle customer_id changes
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.customer_id IS NOT NULL THEN
    PERFORM ticketing_prod.rebuild_customer_search_document(OLD.customer_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS trg_customers_search_rebuild ON ticketing_prod.customers;
CREATE TRIGGER trg_customers_search_rebuild
  AFTER INSERT OR UPDATE OR DELETE ON ticketing_prod.customers
  FOR EACH ROW EXECUTE FUNCTION ticketing_prod.trigger_rebuild_customer_search();

DROP TRIGGER IF EXISTS trg_identities_search_rebuild ON ticketing_prod.customer_identities;
CREATE TRIGGER trg_identities_search_rebuild
  AFTER INSERT OR UPDATE OR DELETE ON ticketing_prod.customer_identities
  FOR EACH ROW EXECUTE FUNCTION ticketing_prod.trigger_rebuild_customer_search_from_identity();

-- =============================================================================
-- INITIAL POPULATION
-- =============================================================================
-- Populate search documents for all existing customers

DO $$
DECLARE
  v_customer_id INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR v_customer_id IN SELECT id FROM ticketing_prod.customers
  LOOP
    PERFORM ticketing_prod.rebuild_customer_search_document(v_customer_id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Populated customer_search_documents for % customers', v_count;
END $$;
