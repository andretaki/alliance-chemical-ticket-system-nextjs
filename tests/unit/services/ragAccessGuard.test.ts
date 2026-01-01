import { queryRag } from '@/services/rag/ragRetrievalService';
import type { ViewerScope } from '@/services/rag/ragTypes';

jest.mock('@/services/rag/ragEmbedding', () => ({
  embedTexts: jest.fn(async () => [[0.01, 0.02, 0.03]]),
}));

jest.mock('@/lib/db', () => {
  const schema = jest.requireActual('@/db/schema');

  const chainFor = (data: any[] = []) => {
    const chain: any = {
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => Promise.resolve(data)),
      then: (resolve: any) => Promise.resolve(data).then(resolve),
    };
    return chain;
  };

  const db = {
    execute: jest.fn(),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => chainFor([])),
      })),
    })),
    query: {
      tickets: { findFirst: jest.fn(async () => null) },
      orders: { findMany: jest.fn(async () => []) },
      qboInvoices: { findMany: jest.fn(async () => []) },
      qboEstimates: { findMany: jest.fn(async () => []) },
      shipstationShipments: { findMany: jest.fn(async () => []) },
      qboCustomerSnapshots: { findFirst: jest.fn(async () => null) },
    },
  };

  return {
    db,
    ragChunks: schema.ragChunks,
    ragSources: schema.ragSources,
    ticketComments: schema.ticketComments,
    tickets: schema.tickets,
    orderItems: schema.orderItems,
    orders: schema.orders,
    qboInvoices: schema.qboInvoices,
    qboEstimates: schema.qboEstimates,
    shipstationShipments: schema.shipstationShipments,
    qboCustomerSnapshots: schema.qboCustomerSnapshots,
  };
});

describe('RAG access guardrails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const userScope: ViewerScope = {
    userId: 'user-1',
    role: 'user',
    isAdmin: false,
    isManager: false,
    isExternal: false,
    allowInternal: true,
    allowedCustomerIds: [1],
    allowedDepartments: [],
  };

  const adminScope: ViewerScope = {
    userId: 'admin-1',
    role: 'admin',
    isAdmin: true,
    isManager: false,
    isExternal: false,
    allowInternal: true,
    allowedCustomerIds: [],
    allowedDepartments: ['*'],
  };

  it('denies non-admin requests without customer or ticket context', async () => {
    const { db } = await import('@/lib/db');
    const executeMock = db.execute as jest.Mock;

    await expect(queryRag({
      queryText: 'history',
      scope: userScope,
      withDebug: true,
    })).rejects.toMatchObject({ name: 'RagAccessError', denyReason: 'missing_context' });

    expect(executeMock).not.toHaveBeenCalled();
  });

  it('denies admin global search unless allowGlobal is explicit', async () => {
    await expect(queryRag({
      queryText: 'history',
      scope: adminScope,
      filters: { allowGlobal: false },
      withDebug: true,
    })).rejects.toMatchObject({ name: 'RagAccessError', denyReason: 'global_not_allowed' });
  });

  it('allows admin global search when allowGlobal is true', async () => {
    const { db } = await import('@/lib/db');
    const executeMock = db.execute as jest.Mock;

    executeMock
      .mockResolvedValueOnce([
        {
          chunk_id: 'chunk-1',
          source_id: 'source-1',
          chunk_index: 0,
          chunk_text: 'Global note',
          source_type: 'ticket',
          source_uri: '/tickets/1',
          title: 'Ticket',
          metadata: {},
          sensitivity: 'public',
          customer_id: null,
          ticket_id: null,
          thread_id: null,
          source_created_at: new Date(),
          source_updated_at: null,
          fts_rank: 0.8,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await queryRag({
      queryText: 'history',
      scope: adminScope,
      filters: { allowGlobal: true },
      withDebug: true,
    });

    expect(result.evidenceResults.length).toBeGreaterThan(0);
  });

  it('denies when ticket customer mismatches request customer', async () => {
    const { db } = await import('@/lib/db');
    const ticketsMock = db.query.tickets.findFirst as jest.Mock;

    ticketsMock.mockResolvedValueOnce({ customerId: 2 });

    await expect(queryRag({
      queryText: 'history',
      scope: userScope,
      customerId: 1,
      ticketId: 999,
      withDebug: true,
    })).rejects.toMatchObject({ name: 'RagAccessError', denyReason: 'ticket_customer_mismatch' });
  });

  it('filters to allowed customer and public sensitivity when includeInternal is false', async () => {
    const { db } = await import('@/lib/db');
    const executeMock = db.execute as jest.Mock;

    executeMock
      .mockResolvedValueOnce([
        {
          chunk_id: 'chunk-public-1',
          source_id: 'source-public-1',
          chunk_index: 0,
          chunk_text: 'Public note',
          source_type: 'ticket',
          source_uri: '/tickets/1',
          title: 'Ticket',
          metadata: {},
          sensitivity: 'public',
          customer_id: 1,
          ticket_id: 1,
          thread_id: null,
          source_created_at: new Date(),
          source_updated_at: null,
          fts_rank: 0.9,
        },
        {
          chunk_id: 'chunk-internal-1',
          source_id: 'source-internal-1',
          chunk_index: 0,
          chunk_text: 'Internal note',
          source_type: 'ticket_comment',
          source_uri: '/tickets/1#comment-1',
          title: 'Comment',
          metadata: {},
          sensitivity: 'internal',
          customer_id: 1,
          ticket_id: 1,
          thread_id: null,
          source_created_at: new Date(),
          source_updated_at: null,
          fts_rank: 0.7,
        },
        {
          chunk_id: 'chunk-public-2',
          source_id: 'source-public-2',
          chunk_index: 0,
          chunk_text: 'Other customer note',
          source_type: 'ticket',
          source_uri: '/tickets/2',
          title: 'Ticket',
          metadata: {},
          sensitivity: 'public',
          customer_id: 2,
          ticket_id: 2,
          thread_id: null,
          source_created_at: new Date(),
          source_updated_at: null,
          fts_rank: 0.6,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await queryRag({
      queryText: 'history',
      scope: userScope,
      customerId: 1,
      filters: { includeInternal: false },
      topK: 10,
      withDebug: true,
    });

    expect(result.evidenceResults).toHaveLength(1);
    expect(result.evidenceResults[0].customerId).toBe(1);
    expect(result.evidenceResults[0].sensitivity).toBe('public');
  });
});
