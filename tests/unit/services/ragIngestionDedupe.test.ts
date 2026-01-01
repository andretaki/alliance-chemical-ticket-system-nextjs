import crypto from 'crypto';
import { chunkTextAdaptive } from '@/services/rag/ragChunking';
import { __test } from '@/services/rag/ragIngestionService';
import { embedTexts } from '@/services/rag/ragEmbedding';

let existingEmbeddingRows: Array<{ chunkHash: string; embedding: number[] }> = [];

jest.mock('@/lib/graphService', () => ({
  graphClient: {},
  getUserEmail: jest.fn(() => 'dev@example.com'),
}));

jest.mock('@/lib/db', () => {
  const schema = jest.requireActual('@/db/schema');
  return {
    db: {
      query: {
        ragSources: { findFirst: jest.fn() },
      },
      insert: jest.fn(() => ({
        values: jest.fn((values: any) => {
          if (Array.isArray(values)) {
            return Promise.resolve();
          }
          return {
            onConflictDoUpdate: jest.fn(() => ({
              returning: jest.fn(() => Promise.resolve([{ id: 'source-id', contentHash: 'hash' }])),
            })),
          };
        }),
      })),
      delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve(existingEmbeddingRows)),
        })),
      })),
    },
    ragSources: schema.ragSources,
    ragChunks: schema.ragChunks,
  };
});

jest.mock('@/services/rag/ragEmbedding', () => ({
  embedTexts: jest.fn(),
}));

describe('ragIngestionService dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existingEmbeddingRows = [];
  });

  it('reuses existing chunk embeddings instead of re-embedding', async () => {
    const contentText = Array.from({ length: 1200 }).fill('word').join(' ');
    const chunks = chunkTextAdaptive('ticket', contentText);
    expect(chunks.length).toBeGreaterThan(1);

    const chunkHashes = chunks.map((chunk) => crypto.createHash('sha256').update(chunk).digest('hex'));
    existingEmbeddingRows = [{ chunkHash: chunkHashes[0], embedding: [0.1, 0.2] }];

    (embedTexts as jest.Mock).mockResolvedValue(
      chunks.slice(1).map(() => [0.3, 0.4])
    );

    const input = {
      sourceType: 'ticket' as const,
      sourceId: '123',
      sourceUri: '/tickets/123',
      customerId: 1,
      ticketId: 123,
      threadId: 'ticket-123',
      sensitivity: 'public' as const,
      ownerUserId: 'user-1',
      title: 'Test Ticket',
      contentText,
      metadata: { ticketId: 123 },
      sourceCreatedAt: new Date(),
      sourceUpdatedAt: new Date(),
    };

    const { upsertSourceWithChunks } = __test;
    await upsertSourceWithChunks(input, 'upsert');

    expect(embedTexts).toHaveBeenCalledTimes(1);
    const calledChunks = (embedTexts as jest.Mock).mock.calls[0][0] as string[];
    expect(calledChunks).not.toContain(chunks[0]);
  });
});
