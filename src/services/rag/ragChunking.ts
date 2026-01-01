import { RAG_CHUNK_CONFIG } from './ragConfig';
import type { RagSourceType } from './ragTypes';
import { normalizeWhitespace } from './ragCleaning';

const STRUCTURED_TYPES: RagSourceType[] = [
  'qbo_invoice',
  'qbo_estimate',
  'qbo_customer',
  'shopify_order',
  'shopify_customer',
  'amazon_order',
  'shipstation_shipment',
  'order',
];

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

function chunkByTokens(tokens: string[], maxTokens: number, overlapTokens: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + maxTokens);
    const slice = tokens.slice(start, end).join(' ').trim();
    if (slice) chunks.push(slice);
    if (end >= tokens.length) break;
    start = Math.max(0, end - overlapTokens);
  }
  return chunks;
}

function chunkByParagraphs(text: string, maxTokens: number, overlapTokens: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => normalizeWhitespace(p)).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let tokenCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join('\n\n').trim());
    current = [];
    tokenCount = 0;
  };

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    if (paragraphTokens > maxTokens) {
      flush();
      const splitTokens = paragraph.split(/\s+/).filter(Boolean);
      const splitChunks = chunkByTokens(splitTokens, maxTokens, overlapTokens);
      chunks.push(...splitChunks);
      continue;
    }

    if (tokenCount + paragraphTokens > maxTokens && current.length > 0) {
      flush();
    }

    current.push(paragraph);
    tokenCount += paragraphTokens;
  }

  flush();
  return chunks;
}

export function chunkTextAdaptive(sourceType: RagSourceType, text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  if (STRUCTURED_TYPES.includes(sourceType)) {
    return [normalized];
  }

  const config = sourceType in RAG_CHUNK_CONFIG ? (RAG_CHUNK_CONFIG as any)[sourceType] : RAG_CHUNK_CONFIG.ticket;
  const maxTokens = config.maxTokens;
  return chunkByParagraphs(normalized, maxTokens, RAG_CHUNK_CONFIG.overlapTokens);
}
