import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { db, customerIdentities, orders, qboCustomerSnapshots, qboEstimates, qboInvoices, shipstationShipments, ticketComments, tickets, interactions } from '@/lib/db';
import { enqueueRagJob } from '@/services/rag/ragIngestionService';
import { syncGraphEmails, syncOrders, syncQboCustomers, syncQboEstimates, syncQboInvoices, syncShipstationShipments, syncShopifyCustomers, syncTickets, syncTicketComments, syncInteractions } from '@/services/rag/ragSyncService';
import type { RagSourceType } from '@/services/rag/ragTypes';

const schema = z.object({
  customerId: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().positive().optional()),
  sourceType: z.string().optional(),
  sinceDays: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().min(1).max(365).optional()),
});

function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const vercelIP = request.headers.get('x-vercel-forwarded-for');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (vercelIP) {
    return vercelIP;
  }

  return 'unknown';
}

async function reindexCustomer(customerId: number) {
  const ticketRows = await db.query.tickets.findMany({
    where: eq(tickets.customerId, customerId),
    columns: { id: true },
  });
  const ticketIds = ticketRows.map((row) => row.id);

  await Promise.all(ticketIds.map((id) => enqueueRagJob('ticket', String(id), 'reindex')));

  if (ticketIds.length) {
    const commentRows = await db.query.ticketComments.findMany({
      where: inArray(ticketComments.ticketId, ticketIds),
      columns: { id: true },
    });
    await Promise.all(commentRows.map((row) => enqueueRagJob('ticket_comment', String(row.id), 'reindex')));
  }

  const interactionRows = await db.query.interactions.findMany({
    where: eq(interactions.customerId, customerId),
    columns: { id: true },
  });
  await Promise.all(interactionRows.map((row) => enqueueRagJob('interaction', String(row.id), 'reindex')));

  const orderRows = await db.query.orders.findMany({
    where: eq(orders.customerId, customerId),
    columns: { id: true, provider: true, externalId: true },
  });
  await Promise.all(orderRows.map((row) => {
    const sourceType: RagSourceType = row.provider === 'shopify'
      ? 'shopify_order'
      : row.provider === 'amazon'
        ? 'amazon_order'
        : 'order';
    const sourceId = row.externalId || String(row.id);
    return enqueueRagJob(sourceType, sourceId, 'reindex');
  }));

  const qboCustomerRows = await db.query.qboCustomerSnapshots.findMany({
    where: eq(qboCustomerSnapshots.customerId, customerId),
    columns: { qboCustomerId: true },
  });
  await Promise.all(qboCustomerRows.map((row) => enqueueRagJob('qbo_customer', row.qboCustomerId, 'reindex')));

  const qboInvoiceRows = await db.query.qboInvoices.findMany({
    where: eq(qboInvoices.customerId, customerId),
    columns: { qboInvoiceId: true },
  });
  await Promise.all(qboInvoiceRows.map((row) => enqueueRagJob('qbo_invoice', row.qboInvoiceId, 'reindex')));

  const qboEstimateRows = await db.query.qboEstimates.findMany({
    where: eq(qboEstimates.customerId, customerId),
    columns: { qboEstimateId: true },
  });
  await Promise.all(qboEstimateRows.map((row) => enqueueRagJob('qbo_estimate', row.qboEstimateId, 'reindex')));

  const shipmentRows = await db.query.shipstationShipments.findMany({
    where: eq(shipstationShipments.customerId, customerId),
    columns: { shipstationShipmentId: true },
  });
  await Promise.all(shipmentRows.map((row) => enqueueRagJob('shipstation_shipment', row.shipstationShipmentId.toString(), 'reindex')));

  const shopifyIdentityRows = await db.query.customerIdentities.findMany({
    where: and(eq(customerIdentities.customerId, customerId), eq(customerIdentities.provider, 'shopify')),
    columns: { externalId: true },
  });
  await Promise.all(shopifyIdentityRows.filter((row) => row.externalId).map((row) => enqueueRagJob('shopify_customer', row.externalId!, 'reindex')));

  return {
    tickets: ticketIds.length,
    interactions: interactionRows.length,
    orders: orderRows.length,
    qboCustomers: qboCustomerRows.length,
    qboInvoices: qboInvoiceRows.length,
    qboEstimates: qboEstimateRows.length,
    shipments: shipmentRows.length,
    shopifyCustomers: shopifyIdentityRows.length,
  };
}

async function reindexSourceType(sourceType: RagSourceType, sinceDays?: number) {
  const since = sinceDays ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) : null;
  const startAt = since ?? new Date(0);
  const maxPages = Number.MAX_SAFE_INTEGER;

  switch (sourceType) {
    case 'ticket':
      return syncTickets({ operation: 'reindex', startAt, maxPages });
    case 'ticket_comment':
      return syncTicketComments({ operation: 'reindex', startAt, maxPages });
    case 'interaction':
      return syncInteractions({ operation: 'reindex', startAt, maxPages });
    case 'shopify_order':
    case 'amazon_order':
    case 'order':
      return syncOrders({ operation: 'reindex', startAt, maxPages });
    case 'qbo_customer':
      return syncQboCustomers('reindex');
    case 'qbo_invoice':
      return syncQboInvoices({ operation: 'reindex', startAt });
    case 'qbo_estimate':
      return syncQboEstimates({ operation: 'reindex', startAt });
    case 'shopify_customer':
      return syncShopifyCustomers({ operation: 'reindex', startAt, maxPages });
    case 'shipstation_shipment':
      return syncShipstationShipments({ operation: 'reindex', startAt });
    case 'email':
      return syncGraphEmails({ operation: 'reindex', resetCursor: true });
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const ip = getClientIP(request);
  const limiter = await rateLimiters.admin.check(`rag:admin:${ip}`);
  if (!limiter.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { customerId, sourceType, sinceDays } = parsed.data;

  if (customerId) {
    const counts = await reindexCustomer(customerId);
    return NextResponse.json({ status: 'queued', scope: 'customer', customerId, counts });
  }

  if (sourceType) {
    await reindexSourceType(sourceType as RagSourceType, sinceDays);
    return NextResponse.json({ status: 'queued', scope: 'sourceType', sourceType, sinceDays });
  }

  await Promise.all([
    syncTickets(),
    syncTicketComments(),
    syncInteractions(),
    syncOrders(),
    syncQboCustomers(),
    syncQboInvoices(),
    syncQboEstimates(),
    syncShopifyCustomers(),
    syncShipstationShipments(),
    syncGraphEmails(),
  ]);

  return NextResponse.json({ status: 'queued', scope: 'all' });
}
