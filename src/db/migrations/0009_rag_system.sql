-- Migration: RAG ingestion + retrieval subsystem
-- Description: Adds RAG tables, structured truth tables, and search indexes

-- Required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RAG enums
DO $$ BEGIN
  CREATE TYPE ticketing_prod.rag_source_type AS ENUM (
    'ticket',
    'ticket_comment',
    'email',
    'interaction',
    'qbo_invoice',
    'qbo_estimate',
    'qbo_customer',
    'shopify_order',
    'shopify_customer',
    'amazon_order',
    'shipstation_shipment',
    'order'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ticketing_prod.rag_sensitivity AS ENUM ('public', 'internal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ticketing_prod.rag_ingestion_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- QBO invoices/estimates (structured truth)
CREATE TABLE IF NOT EXISTS ticketing_prod.qbo_invoices (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  qbo_invoice_id TEXT NOT NULL UNIQUE,
  qbo_customer_id TEXT,
  doc_number TEXT,
  status TEXT,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  txn_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbo_invoices_id ON ticketing_prod.qbo_invoices(qbo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_doc_number ON ticketing_prod.qbo_invoices(doc_number);
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_customer ON ticketing_prod.qbo_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_qbo_invoices_qbo_customer ON ticketing_prod.qbo_invoices(qbo_customer_id);

CREATE TABLE IF NOT EXISTS ticketing_prod.qbo_estimates (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  qbo_estimate_id TEXT NOT NULL UNIQUE,
  qbo_customer_id TEXT,
  doc_number TEXT,
  status TEXT,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  txn_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbo_estimates_id ON ticketing_prod.qbo_estimates(qbo_estimate_id);
CREATE INDEX IF NOT EXISTS idx_qbo_estimates_doc_number ON ticketing_prod.qbo_estimates(doc_number);
CREATE INDEX IF NOT EXISTS idx_qbo_estimates_customer ON ticketing_prod.qbo_estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_qbo_estimates_qbo_customer ON ticketing_prod.qbo_estimates(qbo_customer_id);

-- ShipStation shipments (structured truth)
CREATE TABLE IF NOT EXISTS ticketing_prod.shipstation_shipments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  shipstation_shipment_id BIGINT NOT NULL UNIQUE,
  shipstation_order_id BIGINT,
  order_number TEXT,
  tracking_number TEXT,
  carrier_code TEXT,
  service_code TEXT,
  ship_date TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  status TEXT,
  cost DECIMAL(12,2),
  weight DECIMAL(10,3),
  weight_unit TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipstation_shipments_order_number ON ticketing_prod.shipstation_shipments(order_number);
CREATE INDEX IF NOT EXISTS idx_shipstation_shipments_tracking ON ticketing_prod.shipstation_shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipstation_shipments_customer ON ticketing_prod.shipstation_shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_shipments_order_id ON ticketing_prod.shipstation_shipments(shipstation_order_id);

-- RAG core tables
CREATE TABLE IF NOT EXISTS ticketing_prod.rag_sources (
  id UUID PRIMARY KEY,
  source_type ticketing_prod.rag_source_type NOT NULL,
  source_id TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  ticket_id INTEGER REFERENCES ticketing_prod.tickets(id) ON DELETE SET NULL,
  thread_id TEXT,
  parent_id UUID REFERENCES ticketing_prod.rag_sources(id) ON DELETE SET NULL,
  sensitivity ticketing_prod.rag_sensitivity NOT NULL DEFAULT 'public',
  owner_user_id TEXT REFERENCES ticketing_prod.users(id) ON DELETE SET NULL,
  title TEXT,
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  source_created_at TIMESTAMPTZ NOT NULL,
  source_updated_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reindexed_at TIMESTAMPTZ,
  UNIQUE (source_type, source_id),
  UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_rag_sources_customer ON ticketing_prod.rag_sources(customer_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_ticket ON ticketing_prod.rag_sources(ticket_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_thread ON ticketing_prod.rag_sources(thread_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_type_created ON ticketing_prod.rag_sources(source_type, source_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_sources_metadata_gin ON ticketing_prod.rag_sources USING GIN (metadata);

CREATE TABLE IF NOT EXISTS ticketing_prod.rag_chunks (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES ticketing_prod.rag_sources(id) ON DELETE CASCADE,
  chunk_index SMALLINT NOT NULL,
  chunk_count SMALLINT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_hash TEXT NOT NULL,
  token_count SMALLINT,
  embedding VECTOR(1536),
  embedded_at TIMESTAMPTZ,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  UNIQUE (source_id, chunk_hash),
  CONSTRAINT chk_rag_chunks_index CHECK (chunk_index >= 0 AND chunk_index < chunk_count)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_tsv ON ticketing_prod.rag_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw ON ticketing_prod.rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS ticketing_prod.rag_ingestion_jobs (
  id UUID PRIMARY KEY,
  source_type ticketing_prod.rag_source_type NOT NULL,
  source_id TEXT NOT NULL,
  operation VARCHAR(16) NOT NULL,
  status ticketing_prod.rag_ingestion_status_enum NOT NULL DEFAULT 'pending',
  priority SMALLINT NOT NULL DEFAULT 0,
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  error_code TEXT,
  result_source_id UUID REFERENCES ticketing_prod.rag_sources(id) ON DELETE SET NULL,
  result_chunk_count SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_status ON ticketing_prod.rag_ingestion_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_rag_jobs_source ON ticketing_prod.rag_ingestion_jobs(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rag_jobs_inflight ON ticketing_prod.rag_ingestion_jobs(source_type, source_id) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS ticketing_prod.rag_sync_cursors (
  source_type ticketing_prod.rag_source_type PRIMARY KEY,
  cursor_value JSONB,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  items_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ticketing_prod.rag_query_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  query_text TEXT NOT NULL,
  query_intent TEXT,
  customer_id INTEGER,
  ticket_id INTEGER,
  filters JSONB NOT NULL DEFAULT '{}',
  top_k INTEGER NOT NULL DEFAULT 10,
  returned_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT,
  fts_latency_ms INTEGER,
  vector_latency_ms INTEGER,
  structured_latency_ms INTEGER,
  rerank_latency_ms INTEGER,
  debug_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigram indexes for common identifiers in metadata
CREATE INDEX IF NOT EXISTS idx_rag_sources_order_number_trgm ON ticketing_prod.rag_sources USING GIN ((metadata->>'orderNumber') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rag_sources_invoice_number_trgm ON ticketing_prod.rag_sources USING GIN ((metadata->>'invoiceNumber') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rag_sources_tracking_number_trgm ON ticketing_prod.rag_sources USING GIN ((metadata->>'trackingNumber') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rag_sources_sku_trgm ON ticketing_prod.rag_sources USING GIN ((metadata->>'sku') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rag_sources_po_number_trgm ON ticketing_prod.rag_sources USING GIN ((metadata->>'poNumber') gin_trgm_ops);
