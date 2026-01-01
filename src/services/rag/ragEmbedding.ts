import crypto from 'crypto';
import OpenAI from 'openai';
import { CacheService } from '@/lib/cache';
import { env } from '@/lib/env';
import { RAG_CACHE_TTL_SECONDS, RAG_EMBEDDING_DIM, RAG_EMBEDDING_MODEL, RAG_EMBEDDING_PROVIDER } from './ragConfig';

let _openai: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (_openai) return _openai;
  if (!env.OPENAI_API_KEY) {
    throw new Error('RAG embeddings require OPENAI_API_KEY when provider is openai.');
  }
  _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

function cacheKey(text: string): string {
  const hash = crypto.createHash('sha256').update(`${RAG_EMBEDDING_MODEL}:${text}`).digest('hex');
  return `rag-embed:${hash}`;
}

function deterministicEmbedding(text: string): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding: number[] = new Array(RAG_EMBEDDING_DIM);
  for (let i = 0; i < RAG_EMBEDDING_DIM; i += 1) {
    const byte = hash[i % hash.length];
    embedding[i] = (byte / 255) * 2 - 1;
  }
  return embedding;
}

async function getCachedEmbedding(text: string): Promise<number[] | null> {
  const cached = await CacheService.get<number[]>('RAG_EMBEDDING', cacheKey(text));
  return cached ?? null;
}

async function setCachedEmbedding(text: string, embedding: number[]): Promise<void> {
  await CacheService.set('RAG_EMBEDDING', cacheKey(text), embedding, RAG_CACHE_TTL_SECONDS.chunkEmbeddings);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const useMock =
    process.env.NODE_ENV === 'test' ||
    RAG_EMBEDDING_PROVIDER !== 'openai' ||
    !env.OPENAI_API_KEY;

  if (useMock) {
    return texts.map((text) => deterministicEmbedding(text));
  }

  const results: number[][] = new Array(texts.length);
  const toEmbed: { index: number; text: string }[] = [];

  await Promise.all(
    texts.map(async (text, index) => {
      const cached = await getCachedEmbedding(text);
      if (cached) {
        results[index] = cached;
      } else {
        toEmbed.push({ index, text });
      }
    })
  );

  if (!toEmbed.length) return results;

  const client = getOpenAiClient();
  const batchSize = 64;
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: RAG_EMBEDDING_MODEL,
      input: batch.map((item) => item.text),
    });

    response.data.forEach((item, idx) => {
      const originalIndex = batch[idx].index;
      results[originalIndex] = item.embedding as number[];
    });
  }

  await Promise.all(
    toEmbed.map(async (item) => {
      const embedding = results[item.index];
      if (embedding) {
        await setCachedEmbedding(item.text, embedding);
      }
    })
  );

  return results;
}
