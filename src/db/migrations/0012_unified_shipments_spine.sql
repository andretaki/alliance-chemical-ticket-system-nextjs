-- Migration: 0012_unified_shipments_spine.sql
-- Purpose: Create unified shipments table for multi-provider support (ShipStation, Amazon FBA, etc.)
-- Also adds Amazon SP-API token storage and amazon_shipment RAG source type

-- 1. Create shipment provider enum
DO $$ BEGIN
  CREATE TYPE ticketing_prod.shipment_provider_enum AS ENUM (
    'shipstation',
    'amazon_fba',
    'amazon_mfn',
    'shopify_fulfillment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create unified shipments table
CREATE TABLE IF NOT EXISTS ticketing_prod.shipments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES ticketing_prod.orders(id) ON DELETE SET NULL,
  provider ticketing_prod.shipment_provider_enum NOT NULL,
  external_id TEXT NOT NULL,
  order_number TEXT,
  tracking_number TEXT,
  carrier_code TEXT,
  service_code TEXT,
  ship_date TIMESTAMPTZ,
  estimated_delivery_date TIMESTAMPTZ,
  actual_delivery_date TIMESTAMPTZ,
  status TEXT,
  cost DECIMAL(12, 2),
  weight DECIMAL(10, 3),
  weight_unit TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_shipments_provider_external UNIQUE (provider, external_id)
);

-- 3. Create indexes for unified shipments table
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON ticketing_prod.shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON ticketing_prod.shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order_number ON ticketing_prod.shipments(order_number);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON ticketing_prod.shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_provider ON ticketing_prod.shipments(provider);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON ticketing_prod.shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_ship_date ON ticketing_prod.shipments(ship_date);

-- 4. Add order_id FK to existing shipstation_shipments for backfill compatibility
ALTER TABLE ticketing_prod.shipstation_shipments
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES ticketing_prod.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shipstation_shipments_order_fk
  ON ticketing_prod.shipstation_shipments(order_id);

-- 5. Add amazon_shipment to RAG source types (safe idempotent way)
DO $$ BEGIN
  ALTER TYPE ticketing_prod.rag_source_type ADD VALUE IF NOT EXISTS 'amazon_shipment';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 6. Create Amazon SP-API tokens table for OAuth storage
CREATE TABLE IF NOT EXISTS ticketing_prod.amazon_sp_tokens (
  id SERIAL PRIMARY KEY,
  marketplace_id TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Add index on updated_at for shipments incremental sync
CREATE INDEX IF NOT EXISTS idx_shipments_updated_at ON ticketing_prod.shipments(updated_at);
