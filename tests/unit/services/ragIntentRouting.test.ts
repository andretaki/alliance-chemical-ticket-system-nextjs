import { queryRag } from '@/services/rag/ragRetrievalService';
import { structuredLookup } from '@/services/rag/ragStructuredLookup';
import { classifyIntent, extractIdentifiers } from '@/services/rag/ragIntent';
import type { ViewerScope } from '@/services/rag/ragTypes';

jest.mock('@/services/rag/ragStructuredLookup', () => ({
  structuredLookup: jest.fn(),
}));

jest.mock('@/services/rag/ragEmbedding', () => ({
  embedTexts: jest.fn(async () => [[0.01, 0.02, 0.03]]),
}));

jest.mock('@/lib/db', () => {
  const schema = jest.requireActual('@/db/schema');
  return {
    db: {
      execute: jest.fn(async () => ({ rows: [] })),
    },
    ragChunks: schema.ragChunks,
    ragSources: schema.ragSources,
    ticketComments: schema.ticketComments,
    tickets: schema.tickets,
  };
});

describe('rag intent routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes identifier lookups to structured-first retrieval', async () => {
    (structuredLookup as jest.Mock).mockResolvedValue([
      { type: 'order', label: 'Order 100234', data: {} },
    ]);

    const scope: ViewerScope = {
      userId: 'user-1',
      role: 'user',
      isAdmin: false,
      isManager: false,
      isExternal: false,
      allowInternal: true,
      allowedCustomerIds: [1],
      allowedDepartments: [],
    };

    const result = await queryRag({
      queryText: 'status of order 100234',
      scope,
      customerId: 1,
      topK: 5,
    });

    expect(result.intent).toBe('identifier_lookup');
    expect(structuredLookup).toHaveBeenCalled();
    expect(result.truthResults.length).toBeGreaterThan(0);
  });

  it('classifies PO status queries as identifier_lookup', () => {
    const identifiers = extractIdentifiers('PO-98765 status');
    expect(classifyIntent('PO-98765 status', identifiers)).toBe('identifier_lookup');
  });

  it('classifies tracking numbers as identifier_lookup', () => {
    const identifiers = extractIdentifiers('1Z999AA123456789');
    expect(classifyIntent('1Z999AA123456789', identifiers)).toBe('identifier_lookup');
  });

  it('classifies hazmat shipping questions as logistics_shipping', () => {
    const identifiers = extractIdentifiers('hazmat shipping requirements');
    expect(classifyIntent('hazmat shipping requirements', identifiers)).toBe('logistics_shipping');
  });

  it('classifies payment terms as payments_terms', () => {
    const identifiers = extractIdentifiers('payment terms for new customers');
    expect(classifyIntent('payment terms for new customers', identifiers)).toBe('payments_terms');
  });

  it('defaults to account_history for general customer questions', () => {
    const identifiers = extractIdentifiers('Tell me about Acme Corp');
    expect(classifyIntent('Tell me about Acme Corp', identifiers)).toBe('account_history');
  });
});
