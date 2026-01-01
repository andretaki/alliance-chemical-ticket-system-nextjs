-- Migration: Customer Identity Spine
-- Adds 'shipstation' to provider_enum for customer identity tracking
-- Adds uniqueness + validity constraints to prevent duplicate/empty identities

-- Add 'shipstation' to provider_enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'shipstation'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'provider_enum' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'ticketing_prod'))
    ) THEN
        ALTER TYPE ticketing_prod.provider_enum ADD VALUE 'shipstation';
    END IF;
END$$;

-- CRITICAL: Unique constraint on provider+external_id to prevent duplicates
-- Partial index only where external_id is not null (allows multiple null external_ids per provider)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_identities_provider_external
ON ticketing_prod.customer_identities (provider, external_id)
WHERE external_id IS NOT NULL;

-- CRITICAL: Check constraint ensuring at least one identifier exists
-- Prevents inserting completely empty/useless identity rows
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_customer_identities_has_identifier'
        AND conrelid = 'ticketing_prod.customer_identities'::regclass
    ) THEN
        ALTER TABLE ticketing_prod.customer_identities
        ADD CONSTRAINT chk_customer_identities_has_identifier
        CHECK (external_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);
    END IF;
END$$;

-- Add index for faster identity lookups by metadata identityType
CREATE INDEX IF NOT EXISTS idx_customer_identities_metadata_gin
ON ticketing_prod.customer_identities USING GIN (metadata jsonb_path_ops);

-- Add composite index for address hash lookups
CREATE INDEX IF NOT EXISTS idx_customer_identities_provider_external_hash
ON ticketing_prod.customer_identities (provider, external_id)
WHERE external_id LIKE 'address_hash:%';

-- Index for email lookups (if not already exists from schema)
CREATE INDEX IF NOT EXISTS idx_customer_identities_email_lower
ON ticketing_prod.customer_identities (LOWER(email))
WHERE email IS NOT NULL;

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_customer_identities_phone
ON ticketing_prod.customer_identities (phone)
WHERE phone IS NOT NULL;
