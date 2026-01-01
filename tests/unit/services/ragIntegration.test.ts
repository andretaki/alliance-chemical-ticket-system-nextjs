import { queryRag } from '@/services/rag/ragRetrievalService';
import type { ViewerScope } from '@/services/rag/ragTypes';

jest.mock('@/services/rag/ragEmbedding', () => ({
  embedTexts: jest.fn(async () => [[0.01, 0.02, 0.03]]),
}));

jest.mock('@/lib/db', () => {
  const schema = jest.requireActual('@/db/schema');

  const chainFor = (table: any) => {
    const dataForTable = () => {
      if (table === schema.orderItems) {
        return [{ orderId: 10, sku: 'SKU-1', title: 'Widget' }];
      }
      if (table === schema.ragChunks) {
        return [{ chunkText: 'Order 100234 delayed due to shipping.', chunkIndex: 0 }];
      }
      return [];
    };

    const chain: any = {
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => Promise.resolve(dataForTable())),
      then: (resolve: any) => Promise.resolve(dataForTable()).then(resolve),
    };

    return chain;
  };

  const db = {
    execute: jest.fn(),
    select: jest.fn(() => ({
      from: jest.fn((table: any) => ({
        where: jest.fn(() => chainFor(table)),
      })),
    })),
    query: {
      orders: {
        findMany: jest.fn(async () => ([
          {
            id: 10,
            customerId: 1,
            provider: 'shopify',
            externalId: null,
            orderNumber: '100234',
            status: 'open',
            financialStatus: 'paid',
            currency: 'USD',
            total: '120.00',
            placedAt: new Date('2024-01-10T00:00:00Z'),
            dueAt: null,
            paidAt: new Date('2024-01-11T00:00:00Z'),
            items: [{ sku: 'SKU-1', title: 'Widget', quantity: 2 }],
          },
        ])),
      },
      qboInvoices: { findMany: jest.fn(async () => []) },
      qboEstimates: { findMany: jest.fn(async () => []) },
      shipstationShipments: { findMany: jest.fn(async () => []) },
      shipments: { findMany: jest.fn(async () => []) },
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
    shipments: schema.shipments,
    qboCustomerSnapshots: schema.qboCustomerSnapshots,
  };
});

describe('RAG integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns structured truth first with supporting ticket/email evidence', async () => {
    const { db } = await import('@/lib/db');
    const executeMock = db.execute as jest.Mock;

    executeMock
      .mockResolvedValueOnce({
        rows: [
          {
            source_id: 'source-ticket-1',
            source_type: 'ticket',
            source_uri: '/tickets/55',
            title: 'Shipping issue',
            metadata: { ticketId: 55, orderNumber: '100234' },
            sensitivity: 'public',
            customer_id: 1,
            ticket_id: 55,
            thread_id: 'ticket-55',
            source_created_at: new Date('2024-01-12T12:00:00Z'),
            source_updated_at: null,
            content_text: 'Ticket #55: Order 100234 shipping issue',
            match_score: 0.6,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            chunk_id: 'chunk-ticket-1',
            source_id: 'source-ticket-1',
            chunk_index: 0,
            chunk_text: 'Order 100234 delayed due to shipping exception',
            source_type: 'ticket',
            source_uri: '/tickets/55',
            title: 'Shipping issue',
            metadata: { ticketId: 55, orderNumber: '100234' },
            sensitivity: 'public',
            customer_id: 1,
            ticket_id: 55,
            thread_id: 'ticket-55',
            source_created_at: new Date('2024-01-12T12:00:00Z'),
            source_updated_at: null,
            fts_rank: 0.9,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            chunk_id: 'chunk-email-1',
            source_id: 'source-email-1',
            chunk_index: 0,
            chunk_text: 'Email: order 100234 is delayed.',
            source_type: 'email',
            source_uri: 'https://outlook.example.com/message/1',
            title: 'Re: order 100234',
            metadata: { fromEmail: 'buyer@example.com' },
            sensitivity: 'public',
            customer_id: 1,
            ticket_id: null,
            thread_id: 'conv-1',
            source_created_at: new Date('2024-01-12T11:00:00Z'),
            source_updated_at: null,
            vector_score: 0.82,
          },
        ],
      });

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
    expect(result.truthResults.some((item) => item.type === 'order')).toBe(true);
    expect(result.evidenceResults.some((item) => item.sourceType === 'ticket')).toBe(true);
    expect(result.evidenceResults.some((item) => item.sourceType === 'email')).toBe(true);
  });
});
