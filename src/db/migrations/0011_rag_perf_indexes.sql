-- Migration: RAG performance indexes
-- Description: ensure FTS + vector indexes match query patterns

-- Prefer partial HNSW index to avoid NULL embeddings
DROP INDEX IF EXISTS ticketing_prod.idx_rag_chunks_embedding_hnsw;
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
  ON ticketing_prod.rag_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Ensure FTS index exists
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tsv
  ON ticketing_prod.rag_chunks USING GIN (tsv);

-- Ensure source type filter index exists
CREATE INDEX IF NOT EXISTS idx_rag_sources_source_type
  ON ticketing_prod.rag_sources(source_type);
