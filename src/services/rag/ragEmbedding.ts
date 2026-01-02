import crypto from 'crypto';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { CacheService } from '@/lib/cache';
import { env } from '@/lib/env';
import { withResilience } from '@/lib/resilience';
import { RAG_CACHE_TTL_SECONDS, RAG_EMBEDDING_DIM, RAG_EMBEDDING_MODEL, RAG_EMBEDDING_PROVIDER } from './ragConfig';

// Resilience configuration for embedding APIs
const EMBEDDING_TIMEOUT_MS = 30000; // 30 seconds
const EMBEDDING_FALLBACK_ENABLED = true;

let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (_openai) return _openai;
  if (!env.OPENAI_API_KEY) {
    throw new Error('RAG embeddings require OPENAI_API_KEY when provider is openai.');
  }
  _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

function getGeminiClient(): GoogleGenAI {
  if (_gemini) return _gemini;
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('RAG embeddings require GOOGLE_AI_API_KEY or GEMINI_API_KEY when provider is gemini.');
  }
  _gemini = new GoogleGenAI({ apiKey });
  return _gemini;
}

/** Normalize embedding vector to unit length (required for Gemini at non-3072 dimensions) */
function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return embedding;
  return embedding.map((val) => val / norm);
}

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';

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

/**
 * Embed texts using configured provider (OpenAI or Gemini).
 * @param texts - Array of texts to embed
 * @param taskType - Gemini task type (ignored for OpenAI). Use RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for queries.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'
): Promise<number[][]> {
  if (!texts.length) return [];

  const useMock =
    process.env.NODE_ENV === 'test' ||
    RAG_EMBEDDING_PROVIDER === 'mock';

  if (useMock) {
    return texts.map((text) => deterministicEmbedding(text));
  }

  const results: number[][] = new Array(texts.length);
  const toEmbed: { index: number; text: string }[] = [];

  // Check cache first
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

  if (RAG_EMBEDDING_PROVIDER === 'gemini') {
    await embedWithGemini(toEmbed, results, taskType);
  } else {
    await embedWithOpenAI(toEmbed, results);
  }

  // Cache new embeddings
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

async function embedWithOpenAI(
  toEmbed: { index: number; text: string }[],
  results: number[][]
): Promise<void> {
  const client = getOpenAiClient();
  const batchSize = 64;

  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);

    const response = await withResilience(
      async () =>
        client.embeddings.create({
          model: RAG_EMBEDDING_MODEL,
          input: batch.map((item) => item.text),
        }),
      {
        timeout: EMBEDDING_TIMEOUT_MS,
        name: 'OpenAI-Embeddings',
        // Use deterministic fallback if configured
        fallback: EMBEDDING_FALLBACK_ENABLED
          ? { data: batch.map((item) => ({ embedding: deterministicEmbedding(item.text) })) }
          : undefined,
      }
    );

    response.data.forEach((item, idx) => {
      const originalIndex = batch[idx].index;
      results[originalIndex] = item.embedding as number[];
    });
  }
}

async function embedWithGemini(
  toEmbed: { index: number; text: string }[],
  results: number[][],
  taskType: EmbeddingTaskType
): Promise<void> {
  const client = getGeminiClient();
  const batchSize = 100; // Gemini supports larger batches

  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);

    const response = await withResilience(
      async () =>
        client.models.embedContent({
          model: RAG_EMBEDDING_MODEL,
          contents: batch.map((item) => item.text),
          config: {
            taskType,
            outputDimensionality: RAG_EMBEDDING_DIM,
          },
        }),
      {
        timeout: EMBEDDING_TIMEOUT_MS,
        name: 'Gemini-Embeddings',
        // Use deterministic fallback if configured
        fallback: EMBEDDING_FALLBACK_ENABLED
          ? { embeddings: batch.map((item) => ({ values: deterministicEmbedding(item.text) })) }
          : undefined,
      }
    );

    if (response.embeddings) {
      response.embeddings.forEach((embeddingObj, idx) => {
        const originalIndex = batch[idx].index;
        // Normalize since we're using 1536 dimensions (not 3072)
        results[originalIndex] = normalizeEmbedding(embeddingObj.values || []);
      });
    }
  }
}

/** Convenience function for embedding query text (uses RETRIEVAL_QUERY task type for Gemini) */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text], 'RETRIEVAL_QUERY');
  return embedding;
}
