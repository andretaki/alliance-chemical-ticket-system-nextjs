import { processRagIngestionBatch } from '@/services/rag/ragIngestionService';

export async function processRagIngestionQueue(limit = 25) {
  await processRagIngestionBatch(limit);
}

if (process.argv[1]?.includes('ragIngestionWorker')) {
  processRagIngestionBatch().catch((error) => {
    console.error('[ragIngestionWorker] Failed:', error);
    process.exit(1);
  });
}
