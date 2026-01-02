import { env, integrations, getGoogleApiKey } from '@/lib/env';

export const RAG_EMBEDDING_DIM = 1536;

// Provider priority: explicit env > gemini if key exists > openai if key exists > mock
function resolveProvider(): 'openai' | 'gemini' | 'mock' {
  const explicit = env.RAG_EMBEDDING_PROVIDER;
  if (explicit === 'openai' || explicit === 'gemini' || explicit === 'mock') {
    return explicit;
  }
  if (getGoogleApiKey()) return 'gemini';
  if (integrations.openai) return 'openai';
  return 'mock';
}

export const RAG_EMBEDDING_PROVIDER = resolveProvider();

// Model defaults per provider
export const RAG_EMBEDDING_MODEL =
  env.RAG_EMBEDDING_MODEL ||
  (RAG_EMBEDDING_PROVIDER === 'gemini' ? 'gemini-embedding-001' : 'text-embedding-3-small');

export const RAG_CHUNK_CONFIG = {
  ticket: { maxTokens: 380 },
  ticket_comment: { maxTokens: 320 },
  email: { maxTokens: 360 },
  interaction: { maxTokens: 320 },
  structured: { maxTokens: 240 },
  overlapTokens: 40,
} as const;

export const RAG_DEFAULT_TOP_K = 10;
export const RAG_FTS_LIMIT = 80;
export const RAG_VECTOR_LIMIT = 80;
export const RAG_RRF_K = 60;
export const RAG_RERANK_ENABLED = env.RAG_RERANK_ENABLED === 'true';

export const RAG_CACHE_TTL_SECONDS = {
  queryResults: 300,
  queryEmbeddings: 7 * 24 * 60 * 60,
  chunkEmbeddings: 30 * 24 * 60 * 60,
} as const;

export const RAG_MAX_JOB_ATTEMPTS = 5;
