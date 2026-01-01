-- Migration: RAG reliability and indexing fixes
-- Description: remove global content hash uniqueness, fix chunk uniqueness, add supporting indexes

-- Allow identical content across sources (avoid cross-customer collisions)
ALTER TABLE ticketing_prod.rag_sources DROP CONSTRAINT IF EXISTS uq_rag_sources_content_hash;
ALTER TABLE ticketing_prod.rag_sources DROP CONSTRAINT IF EXISTS rag_sources_content_hash_key;
DROP INDEX IF EXISTS ticketing_prod.uq_rag_sources_content_hash;
DROP INDEX IF EXISTS ticketing_prod.rag_sources_content_hash_key;

-- Make chunk uniqueness stable on source + index instead of source + hash
ALTER TABLE ticketing_prod.rag_chunks DROP CONSTRAINT IF EXISTS uq_rag_chunks_source_hash;
ALTER TABLE ticketing_prod.rag_chunks DROP CONSTRAINT IF EXISTS rag_chunks_source_id_chunk_hash_key;
DROP INDEX IF EXISTS ticketing_prod.uq_rag_chunks_source_hash;
DROP INDEX IF EXISTS ticketing_prod.rag_chunks_source_id_chunk_hash_key;
DO $$
DECLARE
  duplicate_groups INTEGER := 0;
  deleted_rows INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO duplicate_groups
  FROM (
    SELECT 1
    FROM ticketing_prod.rag_chunks
    GROUP BY source_id, chunk_index
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF duplicate_groups > 0 THEN
    RAISE NOTICE 'rag_chunks duplicate (source_id, chunk_index) groups: %', duplicate_groups;

    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY source_id, chunk_index
          ORDER BY embedded_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM ticketing_prod.rag_chunks
    )
    DELETE FROM ticketing_prod.rag_chunks
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    RAISE NOTICE 'rag_chunks duplicate rows deleted: %', deleted_rows;
  END IF;
END $$;
ALTER TABLE ticketing_prod.rag_chunks ADD CONSTRAINT uq_rag_chunks_source_index UNIQUE (source_id, chunk_index);

-- Join + embedding reuse indexes
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON ticketing_prod.rag_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_hash ON ticketing_prod.rag_chunks(chunk_hash);

-- Ensure retrieval indexes exist
CREATE INDEX IF NOT EXISTS idx_rag_sources_customer ON ticketing_prod.rag_sources(customer_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_ticket ON ticketing_prod.rag_sources(ticket_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tsv ON ticketing_prod.rag_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw ON ticketing_prod.rag_chunks USING hnsw (embedding vector_cosine_ops);
