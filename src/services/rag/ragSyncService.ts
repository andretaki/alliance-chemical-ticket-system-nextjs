import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { db, customerIdentities, orders, qboCustomerSnapshots, ragSyncCursors, shipstationShipments, ticketComments, tickets, interactions } from '@/lib/db';
import { integrations } from '@/lib/env';
import { graphClient, getUserEmail } from '@/lib/graphService';
import { fetchQboEstimates, fetchQboInvoices, upsertQboEstimates, upsertQboInvoices } from '@/lib/qboService';
import { fetchShipStationShipmentsPage } from '@/lib/shipstationService';
import { enqueueRagJob } from './ragIngestionService';
import type { RagIngestionOperation, RagSourceType } from './ragTypes';

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 10;

async function getCursor(sourceType: RagSourceType) {
  const cursor = await db.query.ragSyncCursors.findFirst({ where: eq(ragSyncCursors.sourceType, sourceType) });
  if (!cursor) return null;
  return { ...cursor, cursorValue: cursor.cursorValue as Record<string, any> };
}

async function updateCursor(sourceType: RagSourceType, cursorValue: Record<string, unknown>, itemsSynced: number) {
  await db.insert(ragSyncCursors).values({
    sourceType,
    cursorValue,
    itemsSynced,
    lastSuccessAt: new Date(),
    lastError: null,
  }).onConflictDoUpdate({
    target: ragSyncCursors.sourceType,
    set: {
      cursorValue,
      itemsSynced,
      lastSuccessAt: new Date(),
      lastError: null,
    },
  });
}

async function markCursorError(sourceType: RagSourceType, error: string) {
  await db.insert(ragSyncCursors).values({
    sourceType,
    cursorValue: {},
    itemsSynced: 0,
    lastError: error,
  }).onConflictDoUpdate({
    target: ragSyncCursors.sourceType,
    set: {
      lastError: error,
    },
  });
}

export async function syncTickets({
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  operation = 'upsert',
  startAt,
}: {
  pageSize?: number;
  maxPages?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  const cursor = await getCursor('ticket');
  let lastUpdatedAt = startAt ?? (cursor?.cursorValue?.lastUpdatedAt ? new Date(String(cursor.cursorValue.lastUpdatedAt)) : new Date(0));
  let lastId = startAt ? 0 : Number(cursor?.cursorValue?.lastId || 0);
  let itemsSynced = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select({ id: tickets.id, updatedAt: tickets.updatedAt })
      .from(tickets)
      .where(or(
        gt(tickets.updatedAt, lastUpdatedAt),
        and(eq(tickets.updatedAt, lastUpdatedAt), gt(tickets.id, lastId))
      ))
      .orderBy(asc(tickets.updatedAt), asc(tickets.id))
      .limit(pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      await enqueueRagJob('ticket', String(row.id), operation);
      itemsSynced += 1;
    }

    lastUpdatedAt = rows[rows.length - 1].updatedAt;
    lastId = rows[rows.length - 1].id;
  }

  await updateCursor('ticket', { lastUpdatedAt: lastUpdatedAt.toISOString(), lastId }, itemsSynced);
}

export async function syncTicketComments({
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  operation = 'upsert',
  startAt,
}: {
  pageSize?: number;
  maxPages?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  const cursor = await getCursor('ticket_comment');
  let lastCreatedAt = startAt ?? (cursor?.cursorValue?.lastCreatedAt ? new Date(String(cursor.cursorValue.lastCreatedAt)) : new Date(0));
  let lastId = startAt ? 0 : Number(cursor?.cursorValue?.lastId || 0);
  let itemsSynced = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select({ id: ticketComments.id, createdAt: ticketComments.createdAt })
      .from(ticketComments)
      .where(or(
        gt(ticketComments.createdAt, lastCreatedAt),
        and(eq(ticketComments.createdAt, lastCreatedAt), gt(ticketComments.id, lastId))
      ))
      .orderBy(asc(ticketComments.createdAt), asc(ticketComments.id))
      .limit(pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      await enqueueRagJob('ticket_comment', String(row.id), operation);
      itemsSynced += 1;
    }

    lastCreatedAt = rows[rows.length - 1].createdAt;
    lastId = rows[rows.length - 1].id;
  }

  await updateCursor('ticket_comment', { lastCreatedAt: lastCreatedAt.toISOString(), lastId }, itemsSynced);
}

export async function syncInteractions({
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  operation = 'upsert',
  startAt,
}: {
  pageSize?: number;
  maxPages?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  const cursor = await getCursor('interaction');
  let lastOccurredAt = startAt ?? (cursor?.cursorValue?.lastOccurredAt ? new Date(String(cursor.cursorValue.lastOccurredAt)) : new Date(0));
  let lastId = startAt ? 0 : Number(cursor?.cursorValue?.lastId || 0);
  let itemsSynced = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select({ id: interactions.id, occurredAt: interactions.occurredAt })
      .from(interactions)
      .where(or(
        gt(interactions.occurredAt, lastOccurredAt),
        and(eq(interactions.occurredAt, lastOccurredAt), gt(interactions.id, lastId))
      ))
      .orderBy(asc(interactions.occurredAt), asc(interactions.id))
      .limit(pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      await enqueueRagJob('interaction', String(row.id), operation);
      itemsSynced += 1;
    }

    lastOccurredAt = rows[rows.length - 1].occurredAt;
    lastId = rows[rows.length - 1].id;
  }

  await updateCursor('interaction', { lastOccurredAt: lastOccurredAt.toISOString(), lastId }, itemsSynced);
}

export async function syncOrders({
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  operation = 'upsert',
  startAt,
}: {
  pageSize?: number;
  maxPages?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  const cursor = await getCursor('order');
  let lastUpdatedAt = startAt ?? (cursor?.cursorValue?.lastUpdatedAt ? new Date(String(cursor.cursorValue.lastUpdatedAt)) : new Date(0));
  let lastId = startAt ? 0 : Number(cursor?.cursorValue?.lastId || 0);
  let itemsSynced = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select({
      id: orders.id,
      updatedAt: orders.updatedAt,
      provider: orders.provider,
      externalId: orders.externalId,
    })
      .from(orders)
      .where(or(
        gt(orders.updatedAt, lastUpdatedAt),
        and(eq(orders.updatedAt, lastUpdatedAt), gt(orders.id, lastId))
      ))
      .orderBy(asc(orders.updatedAt), asc(orders.id))
      .limit(pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      const sourceType: RagSourceType = row.provider === 'shopify'
        ? 'shopify_order'
        : row.provider === 'amazon'
          ? 'amazon_order'
          : 'order';
      const sourceId = row.externalId || String(row.id);
      await enqueueRagJob(sourceType, sourceId, operation);
      itemsSynced += 1;
    }

    lastUpdatedAt = rows[rows.length - 1].updatedAt;
    lastId = rows[rows.length - 1].id;
  }

  await updateCursor('order', { lastUpdatedAt: lastUpdatedAt.toISOString(), lastId }, itemsSynced);
}

export async function syncQboCustomers(operation: RagIngestionOperation = 'upsert') {
  const rows = await db.select({
    qboCustomerId: qboCustomerSnapshots.qboCustomerId,
    snapshotTakenAt: qboCustomerSnapshots.snapshotTakenAt,
  }).from(qboCustomerSnapshots);

  let itemsSynced = 0;
  for (const row of rows) {
    await enqueueRagJob('qbo_customer', row.qboCustomerId, operation);
    itemsSynced += 1;
  }

  const latest = rows.sort((a, b) => a.snapshotTakenAt.getTime() - b.snapshotTakenAt.getTime()).pop();
  await updateCursor('qbo_customer', { lastSnapshotAt: latest?.snapshotTakenAt?.toISOString() ?? null }, itemsSynced);
}

export async function syncShopifyCustomers({
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  operation = 'upsert',
  startAt,
}: {
  pageSize?: number;
  maxPages?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  const cursor = await getCursor('shopify_customer');
  let lastUpdatedAt = startAt ?? (cursor?.cursorValue?.lastUpdatedAt ? new Date(String(cursor.cursorValue.lastUpdatedAt)) : new Date(0));
  let lastId = startAt ? 0 : Number(cursor?.cursorValue?.lastId || 0);
  let itemsSynced = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select({
      externalId: customerIdentities.externalId,
      updatedAt: customerIdentities.updatedAt,
      id: customerIdentities.id,
    })
      .from(customerIdentities)
      .where(and(
        eq(customerIdentities.provider, 'shopify'),
        or(
          gt(customerIdentities.updatedAt, lastUpdatedAt),
          and(eq(customerIdentities.updatedAt, lastUpdatedAt), gt(customerIdentities.id, lastId))
        )
      ))
      .orderBy(asc(customerIdentities.updatedAt), asc(customerIdentities.id))
      .limit(pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      if (!row.externalId) continue;
      await enqueueRagJob('shopify_customer', row.externalId, operation);
      itemsSynced += 1;
    }

    lastUpdatedAt = rows[rows.length - 1].updatedAt;
    lastId = rows[rows.length - 1].id;
  }

  await updateCursor('shopify_customer', { lastUpdatedAt: lastUpdatedAt.toISOString(), lastId }, itemsSynced);
}

export async function syncQboInvoices({
  sinceDays = 90,
  operation = 'upsert',
  startAt,
}: {
  sinceDays?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  if (!integrations.quickbooks) return;
  const cursor = await getCursor('qbo_invoice');
  const since = startAt ?? (cursor?.cursorValue?.lastUpdatedAt
    ? new Date(String(cursor.cursorValue.lastUpdatedAt))
    : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));

  try {
    const invoices = await fetchQboInvoices(since);
    const qboIds = Array.from(new Set(invoices.map((inv) => inv.qboCustomerId).filter(Boolean))) as string[];
    const identityRows = qboIds.length
      ? await db.select({ externalId: customerIdentities.externalId, customerId: customerIdentities.customerId })
          .from(customerIdentities)
          .where(and(eq(customerIdentities.provider, 'qbo'), inArray(customerIdentities.externalId, qboIds)))
      : [];
    const identityMap = new Map(identityRows.map((row) => [row.externalId, row.customerId]));
    const enriched = invoices.map((invoice) => ({
      ...invoice,
      customerId: invoice.qboCustomerId ? identityMap.get(invoice.qboCustomerId) ?? null : null,
    }));
    await upsertQboInvoices(enriched);
    for (const invoice of enriched) {
      await enqueueRagJob('qbo_invoice', invoice.qboInvoiceId, operation);
    }
    const latest = enriched.sort((a, b) => a.lastUpdatedAt.getTime() - b.lastUpdatedAt.getTime()).pop();
    await updateCursor('qbo_invoice', { lastUpdatedAt: latest?.lastUpdatedAt?.toISOString() ?? since.toISOString() }, enriched.length);
  } catch (error) {
    await markCursorError('qbo_invoice', error instanceof Error ? error.message : String(error));
  }
}

export async function syncQboEstimates({
  sinceDays = 180,
  operation = 'upsert',
  startAt,
}: {
  sinceDays?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  if (!integrations.quickbooks) return;
  const cursor = await getCursor('qbo_estimate');
  const since = startAt ?? (cursor?.cursorValue?.lastUpdatedAt
    ? new Date(String(cursor.cursorValue.lastUpdatedAt))
    : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));

  try {
    const estimates = await fetchQboEstimates(since);
    const qboIds = Array.from(new Set(estimates.map((est) => est.qboCustomerId).filter(Boolean))) as string[];
    const identityRows = qboIds.length
      ? await db.select({ externalId: customerIdentities.externalId, customerId: customerIdentities.customerId })
          .from(customerIdentities)
          .where(and(eq(customerIdentities.provider, 'qbo'), inArray(customerIdentities.externalId, qboIds)))
      : [];
    const identityMap = new Map(identityRows.map((row) => [row.externalId, row.customerId]));
    const enriched = estimates.map((estimate) => ({
      ...estimate,
      customerId: estimate.qboCustomerId ? identityMap.get(estimate.qboCustomerId) ?? null : null,
    }));
    await upsertQboEstimates(enriched);
    for (const estimate of enriched) {
      await enqueueRagJob('qbo_estimate', estimate.qboEstimateId, operation);
    }
    const latest = enriched.sort((a, b) => a.lastUpdatedAt.getTime() - b.lastUpdatedAt.getTime()).pop();
    await updateCursor('qbo_estimate', { lastUpdatedAt: latest?.lastUpdatedAt?.toISOString() ?? since.toISOString() }, enriched.length);
  } catch (error) {
    await markCursorError('qbo_estimate', error instanceof Error ? error.message : String(error));
  }
}

export async function syncShipstationShipments({
  sinceDays = 30,
  pageSize = 100,
  operation = 'upsert',
  startAt,
}: {
  sinceDays?: number;
  pageSize?: number;
  operation?: RagIngestionOperation;
  startAt?: Date;
} = {}) {
  if (!integrations.shipstation) return;
  const cursor = await getCursor('shipstation_shipment');
  const since = startAt ?? (cursor?.cursorValue?.lastUpdatedAt
    ? new Date(String(cursor.cursorValue.lastUpdatedAt))
    : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));

  try {
    let page = 1;
    let totalSynced = 0;
    let latestUpdatedAt = since;

    while (true) {
      const response = await fetchShipStationShipmentsPage({
        page,
        pageSize,
        modifyDateStart: since.toISOString(),
      });

      if (!response.shipments.length) break;

      for (const shipment of response.shipments) {
        const orderNumber = shipment.orderNumber || null;
        const customerId = orderNumber
          ? await resolveCustomerIdForOrderNumber(orderNumber)
          : null;

        await db.insert(shipstationShipments).values({
          customerId,
          shipstationShipmentId: BigInt(shipment.shipmentId),
          shipstationOrderId: shipment.orderId ? BigInt(shipment.orderId) : null,
          orderNumber,
          trackingNumber: shipment.trackingNumber || null,
          carrierCode: shipment.carrierCode || null,
          serviceCode: shipment.serviceCode || null,
          shipDate: shipment.shipDate ? new Date(shipment.shipDate) : null,
          deliveryDate: shipment.estimatedDeliveryDate ? new Date(shipment.estimatedDeliveryDate) : null,
          status: shipment.voided ? 'voided' : 'shipped',
          cost: null,
          weight: null,
          weightUnit: null,
          metadata: shipment as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: shipstationShipments.shipstationShipmentId,
          set: {
            shipstationOrderId: shipment.orderId ? BigInt(shipment.orderId) : null,
            orderNumber,
            trackingNumber: shipment.trackingNumber || null,
            carrierCode: shipment.carrierCode || null,
            serviceCode: shipment.serviceCode || null,
            shipDate: shipment.shipDate ? new Date(shipment.shipDate) : null,
            deliveryDate: shipment.estimatedDeliveryDate ? new Date(shipment.estimatedDeliveryDate) : null,
            status: shipment.voided ? 'voided' : 'shipped',
            metadata: shipment as any,
            updatedAt: new Date(),
          },
        });

        await enqueueRagJob('shipstation_shipment', String(shipment.shipmentId), operation);
        totalSynced += 1;
        const shipmentDate = shipment.shipDate ? new Date(shipment.shipDate) : null;
        if (shipmentDate && shipmentDate > latestUpdatedAt) {
          latestUpdatedAt = shipmentDate;
        }
      }

      if (page >= response.pages) break;
      page += 1;
    }

    await updateCursor('shipstation_shipment', { lastUpdatedAt: latestUpdatedAt.toISOString() }, totalSynced);
  } catch (error) {
    await markCursorError('shipstation_shipment', error instanceof Error ? error.message : String(error));
  }
}

export async function syncGraphEmails({
  pageSize = 50,
  operation = 'upsert',
  resetCursor = false,
}: {
  pageSize?: number;
  operation?: RagIngestionOperation;
  resetCursor?: boolean;
} = {}) {
  if (!integrations.microsoftGraph) return;
  try {
    const cursor = await getCursor('email');
    const mailbox = getUserEmail();
    const deltaLink = resetCursor ? null : (cursor?.cursorValue?.deltaLink ? String(cursor.cursorValue.deltaLink) : null);

    let nextLink = deltaLink || `/users/${mailbox}/messages/delta?$top=${pageSize}` +
      `&$select=id,subject,body,bodyPreview,from,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,conversationId,internetMessageId,inReplyTo,webLink`;

    let itemsSynced = 0;
    let latestDeltaLink: string | null = null;

    while (nextLink) {
      const response = nextLink.startsWith('https://')
        ? await graphClient.api(nextLink).get()
        : await graphClient.api(nextLink).get();

      const messages = response.value || [];
      for (const message of messages) {
        if (!message?.id) continue;
        await enqueueRagJob('email', message.id, operation);
        itemsSynced += 1;
      }

      nextLink = response['@odata.nextLink'] || null;
      latestDeltaLink = response['@odata.deltaLink'] || latestDeltaLink;
      if (!nextLink) break;
    }

    if (latestDeltaLink) {
      await updateCursor('email', { deltaLink: latestDeltaLink }, itemsSynced);
    }
  } catch (error) {
    await markCursorError('email', error instanceof Error ? error.message : String(error));
  }
}

async function resolveCustomerIdForOrderNumber(orderNumber?: string | null): Promise<number | null> {
  if (!orderNumber) return null;
  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, orderNumber),
  });
  return order?.customerId ?? null;
}

export async function syncAllCoreSources() {
  await syncTickets();
  await syncTicketComments();
  await syncInteractions();
  await syncOrders();
  await syncQboCustomers();
  await syncShopifyCustomers();
}
