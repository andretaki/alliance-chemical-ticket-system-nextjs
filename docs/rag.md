# RAG Operations (Solo Dev Guide)

## What this adds
- Queue-based ingestion with retries and dedupe
- Hybrid retrieval (FTS + vector + metadata) with RBAC
- Structured truth lookups for orders/invoices/shipments

## One-time setup
1. Run migrations
   - `npm run db:migrate`
2. Ensure the Postgres extensions are available
   - `vector`, `pg_trgm`
   - If you use Docker, the compose file already uses a pgvector image.

## Daily usage (simple flow)
1. Sync sources into the ingestion queue
   - `npm run rag:sync`
2. Process the ingestion queue
   - `npm run rag:worker`

## Smoke test (real data, optional)
Run a minimal end-to-end check against an existing ticket:
- `RAG_SMOKE_TICKET_ID=123 RAG_SMOKE_QUERY="status of order 100234" npm run rag:smoke`
- For production safety, require `RAG_SMOKE_ALLOW_WRITE=true`.

## Integration test (real DB)
Run a true DB-backed RAG test (migrations + ingestion + query):
- Start the test database: `docker-compose up -d postgres-test`
- Run: `RAG_DB_TESTS=true npm test -- tests/integration/ragDbIntegration.test.ts`

This test verifies:
- Structured lookup returns a seeded order
- Evidence results include ticket/email
- `rag_chunks.tsv` is generated and populated

You can run the worker on a schedule (cron) or keep it running in a process manager.

## Admin endpoints
- Reindex / enqueue
  - `POST /api/admin/rag/reindex`
  - Optional body:
    - `{ "customerId": 123 }`
    - `{ "sourceType": "shopify_order" }`
    - `{ "sourceType": "qbo_invoice", "sinceDays": 30 }`
- Diagnostics
  - `GET /api/admin/rag/diagnostics`
  - Returns failed jobs, missing embeddings, and cursor status

## Query endpoint
- `POST /api/rag/query`
  - Body: `{ "queryText": "...", "customerId": 123, "topK": 10 }`
  - Returns structured truth + supporting evidence with citations.

## Key env vars
- `RAG_EMBEDDING_PROVIDER` (optional, defaults to `openai` if configured)
- `RAG_EMBEDDING_MODEL` (optional, defaults to `text-embedding-3-small`)
- `OPENAI_API_KEY` (required for OpenAI embeddings)

## Caching + cost notes
- Chunk embeddings are stored in `rag_chunks.embedding` and deduped by `chunk_hash`.
- Query embeddings are cached in KV under `RAG_EMBEDDING`.
- Rough cost estimate: `tokens_embedded / 1_000_000 * model_price`.
  - Track volume by counting chunks and average tokens per chunk.
  - If KV is not configured, query embeddings won’t be cached.

## Email cleaning audit (real data, optional)
Run a quick quality scan against live Graph messages:
- `RAG_EMAIL_AUDIT_LIMIT=100 npm run rag:email-audit`
- Optional filters:
  - `RAG_EMAIL_AUDIT_MAILBOX=shared@alliancechemical.com`
  - `RAG_EMAIL_AUDIT_FILTER="from/emailAddress/address eq 'buyer@acme.com'"`
  - `RAG_EMAIL_AUDIT_SEARCH="order 100234"`

Output includes average removal ratio and a list of messages that still contain reply noise or lost identifiers.

## TSV verification (manual)
After ingestion, confirm the generated `tsv` column is populated:
```sql
SELECT chunk_text, tsv FROM ticketing_prod.rag_chunks LIMIT 1;
```

## Troubleshooting
- Check failed jobs: `GET /api/admin/rag/diagnostics`
- Requeue a source type: `POST /api/admin/rag/reindex`
- If embeddings are missing, rerun the worker: `npm run rag:worker`
