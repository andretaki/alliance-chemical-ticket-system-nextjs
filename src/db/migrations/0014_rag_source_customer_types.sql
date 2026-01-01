-- Migration: 0014_rag_source_customer_types.sql
-- Purpose: Add customer source types to rag_source_type enum

DO $$ BEGIN
  ALTER TYPE ticketing_prod.rag_source_type ADD VALUE IF NOT EXISTS 'amazon_customer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE ticketing_prod.rag_source_type ADD VALUE IF NOT EXISTS 'shipstation_customer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
