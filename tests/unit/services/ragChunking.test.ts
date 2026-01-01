import { chunkTextAdaptive } from '@/services/rag/ragChunking';

describe('ragChunking.chunkTextAdaptive', () => {
  it('returns a single chunk for short content', () => {
    const chunks = chunkTextAdaptive('ticket', 'Short note about order 100234.');
    expect(chunks).toHaveLength(1);
  });

  it('splits long ticket content into multiple chunks', () => {
    const longText = Array.from({ length: 1200 }).fill('word').join(' ');
    const chunks = chunkTextAdaptive('ticket', longText);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
