/** @jest-environment node */
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ViewerScope } from '@/services/rag/ragTypes';

const shouldRun = process.env.RAG_DB_TESTS === 'true';
const describeIf = shouldRun ? describe : describe.skip;

jest.mock('@/lib/graphService', () => {
  const messages = new Map<string, any>();
  return {
    graphClient: {
      api: jest.fn((path: string) => {
        const messageId = path.split('/').pop();
        return {
          select: jest.fn().mockReturnThis(),
          get: jest.fn(async () => messages.get(messageId)),
        };
      }),
    },
    getUserEmail: jest.fn(() => 'shared@example.com'),
    __setGraphMessage: (id: string, message: any) => messages.set(id, message),
  };
});

describeIf('RAG DB integration', () => {
  jest.setTimeout(120000); // 2 min timeout for DB setup + ingestion
  let db: typeof import('@/lib/db').db;
  let closeDb: typeof import('@/lib/db').closeDb;
  let tables: typeof import('@/lib/db');
  let enqueueRagJob: typeof import('@/services/rag/ragIngestionService').enqueueRagJob;
  let processRagIngestionBatch: typeof import('@/services/rag/ragIngestionService').processRagIngestionBatch;
  let queryRag: typeof import('@/services/rag/ragRetrievalService').queryRag;
  let __setGraphMessage: (id: string, message: any) => void;
  const seed = { customerId: 0, ticketId: 0 };

  beforeAll(async () => {
    process.env.MICROSOFT_GRAPH_CLIENT_ID = 'test';
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'test';
    process.env.MICROSOFT_GRAPH_TENANT_ID = 'test';
    process.env.SHARED_MAILBOX_ADDRESS = 'shared@example.com';

    jest.resetModules();

    tables = await import('@/lib/db');
    db = tables.db;
    closeDb = tables.closeDb;
    ({ enqueueRagJob, processRagIngestionBatch } = await import('@/services/rag/ragIngestionService'));
    ({ queryRag } = await import('@/services/rag/ragRetrievalService'));
    ({ __setGraphMessage } = await import('@/lib/graphService'));

    const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });
    const migrationDb = drizzle(migrationClient);
    await migrate(migrationDb, { migrationsFolder: path.join(process.cwd(), 'src/db/migrations') });
    await migrationClient.end({ timeout: 5 });

    await db.execute(sql.raw(`
      TRUNCATE
        ticketing_prod.rag_chunks,
        ticketing_prod.rag_sources,
        ticketing_prod.rag_ingestion_jobs,
        ticketing_prod.rag_query_log,
        ticketing_prod.rag_sync_cursors,
        ticketing_prod.ticket_comments,
        ticketing_prod.tickets,
        ticketing_prod.order_items,
        ticketing_prod.orders,
        ticketing_prod.shipstation_shipments,
        ticketing_prod.qbo_invoices,
        ticketing_prod.qbo_estimates,
        ticketing_prod.qbo_customer_snapshots,
        ticketing_prod.customer_identities,
        ticketing_prod.contacts,
        ticketing_prod.customers,
        ticketing_prod.users
      CASCADE;
    `));

    const [user] = await db.insert(tables.users).values({
      id: 'user-1',
      email: 'agent@example.com',
      name: 'Agent',
      role: 'admin',
      approvalStatus: 'approved',
    }).returning({ id: tables.users.id });

    const [customer] = await db.insert(tables.customers).values({
      primaryEmail: 'buyer@acme.com',
      company: 'Acme Corp',
      firstName: 'Acme',
      lastName: 'Buyer',
    }).returning({ id: tables.customers.id });
    seed.customerId = customer.id;

    const [ticket] = await db.insert(tables.tickets).values({
      title: 'Order 100234 delayed',
      description: 'Customer asked about order 100234 status and tracking 1Z999AA123456789.',
      reporterId: user.id,
      customerId: customer.id,
      status: 'open',
      orderNumber: '100234',
      trackingNumber: '1Z999AA123456789',
      senderEmail: 'buyer@acme.com',
    }).returning({ id: tables.tickets.id });
    seed.ticketId = ticket.id;

    const [comment] = await db.insert(tables.ticketComments).values({
      ticketId: ticket.id,
      commentText: 'We shipped order 100234 yesterday. Tracking 1Z999AA123456789.',
      commenterId: user.id,
      isOutgoingReply: true,
    }).returning({ id: tables.ticketComments.id });

    const [order] = await db.insert(tables.orders).values({
      customerId: customer.id,
      provider: 'shopify',
      externalId: 'SHOP-100234',
      orderNumber: '100234',
      status: 'fulfilled',
      financialStatus: 'paid',
      total: '125.50',
      placedAt: new Date(),
    }).returning({ id: tables.orders.id });

    await db.insert(tables.orderItems).values({
      orderId: order.id,
      sku: 'SKU-ABC-123',
      title: 'Test Product',
      quantity: 2,
      price: '62.75',
    });

    await db.insert(tables.qboInvoices).values({
      customerId: customer.id,
      qboInvoiceId: 'INV-1001',
      qboCustomerId: 'QBO-CUST-1',
      docNumber: 'INV-1001',
      status: 'open',
      totalAmount: '125.50',
      balance: '125.50',
      txnDate: new Date(),
    });

    await db.insert(tables.qboEstimates).values({
      customerId: customer.id,
      qboEstimateId: 'EST-55555',
      qboCustomerId: 'QBO-CUST-1',
      docNumber: 'PO-55555',
      status: 'accepted',
      totalAmount: '300.00',
      txnDate: new Date(),
    });

    await db.insert(tables.shipstationShipments).values({
      customerId: customer.id,
      shipstationShipmentId: BigInt(7001),
      shipstationOrderId: BigInt(9001),
      orderNumber: '100234',
      trackingNumber: '1Z999AA123456789',
      carrierCode: 'UPS',
      status: 'shipped',
      shipDate: new Date(),
    });

    __setGraphMessage('email-1', {
      id: 'email-1',
      subject: 'Order 100234 status',
      body: { content: 'Order 100234 shipped today. Tracking 1Z999AA123456789.' },
      from: { emailAddress: { address: 'buyer@acme.com', name: 'Buyer' } },
      toRecipients: [{ emailAddress: { address: 'support@alliancechemical.com', name: 'Support' } }],
      receivedDateTime: new Date().toISOString(),
      sentDateTime: new Date().toISOString(),
      conversationId: 'conv-1',
      internetMessageId: '<msg-1@example.com>',
      webLink: 'https://outlook.test/message/email-1',
    });

    await enqueueRagJob('ticket', String(ticket.id), 'upsert', 1);
    await enqueueRagJob('ticket_comment', String(comment.id), 'upsert', 1);
    await enqueueRagJob('shopify_order', '100234', 'upsert', 1);
    await enqueueRagJob('qbo_invoice', 'INV-1001', 'upsert', 1);
    await enqueueRagJob('qbo_estimate', 'EST-55555', 'upsert', 1);
    await enqueueRagJob('shipstation_shipment', '7001', 'upsert', 1);
    await enqueueRagJob('email', 'email-1', 'upsert', 1);

    let remaining = 0;
    for (let i = 0; i < 10; i += 1) {
      await processRagIngestionBatch(25);
      const [pending] = await db.select({ count: sql<number>`count(*)` })
        .from(tables.ragIngestionJobs)
        .where(inArray(tables.ragIngestionJobs.status, ['pending', 'processing', 'failed']));
      remaining = Number(pending?.count ?? 0);
      if (remaining === 0) break;
    }

    if (remaining > 0) {
      throw new Error(`RAG ingestion jobs did not complete. Remaining: ${remaining}`);
    }
  });

  afterAll(async () => {
    await closeDb();
  });

  it('retrieves structured truth and evidence for an order lookup', async () => {
    const scope: ViewerScope = {
      userId: 'user-1',
      role: 'admin',
      isAdmin: true,
      isManager: false,
      isExternal: false,
      allowInternal: true,
      allowedCustomerIds: [],
      allowedDepartments: ['*'],
    };

    const result = await queryRag({
      queryText: 'status of order 100234',
      scope,
      customerId: seed.customerId,
      topK: 5,
      withDebug: true,
    });

    expect(result.intent).toBe('identifier_lookup');
    expect(result.truthResults.some((item) => item.type === 'order' && item.label.includes('100234'))).toBe(true);
    expect(result.evidenceResults.some((item) => ['ticket', 'ticket_comment', 'email'].includes(item.sourceType))).toBe(true);

    const tsvCheck = await db.execute(sql`SELECT tsv::text AS tsv FROM ticketing_prod.rag_chunks LIMIT 1`);
    const tsvValue = (tsvCheck as any[])[0]?.tsv;
    expect(tsvValue).toBeTruthy();

    const emailSource = await db.query.ragSources.findFirst({
      where: and(eq(tables.ragSources.sourceType, 'email'), eq(tables.ragSources.customerId, seed.customerId)),
    });
    expect(emailSource).toBeTruthy();
  });
});
