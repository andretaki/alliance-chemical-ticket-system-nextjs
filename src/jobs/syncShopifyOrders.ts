import { db, orders, orderItems, ragSyncCursors } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ShopifyService, type ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { identityService } from '@/services/crm/identityService';

interface ShopifySyncCursor {
  cursor?: string;
  lastSyncAt?: string;
}

async function getCursor(): Promise<ShopifySyncCursor | null> {
  const cursor = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, 'shopify_order'),
  });
  return cursor?.cursorValue as ShopifySyncCursor | null;
}

async function updateCursor(cursorValue: ShopifySyncCursor, itemsSynced: number, error?: string) {
  await db.insert(ragSyncCursors).values({
    sourceType: 'shopify_order',
    cursorValue,
    itemsSynced,
    lastSuccessAt: error ? undefined : new Date(),
    lastError: error || null,
  }).onConflictDoUpdate({
    target: ragSyncCursors.sourceType,
    set: {
      cursorValue,
      itemsSynced,
      lastSuccessAt: error ? undefined : new Date(),
      lastError: error || null,
    },
  });
}

const mapFulfillmentStatus = (status?: string | null) => {
  switch (status) {
    case 'FULFILLED':
      return 'fulfilled';
    case 'PARTIALLY_FULFILLED':
      return 'partial';
    case 'ON_HOLD':
    case 'SCHEDULED':
    case 'UNFULFILLED':
    case 'OPEN':
    case null:
    case undefined:
      return 'open';
    default:
      return 'open';
  }
};

const mapFinancialStatus = (status?: string | null) => {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'PARTIALLY_PAID':
      return 'partially_paid';
    case 'VOIDED':
    case 'REFUNDED':
      return 'void';
    default:
      return 'unpaid';
  }
};

const upsertOrder = async (order: ShopifyOrderNode) => {
  const total = order.totalPriceSet?.shopMoney?.amount ?? '0';
  const currency = order.totalPriceSet?.shopMoney?.currencyCode ?? 'USD';
  const customerDetails = order.customer;

  const resolvedCustomer = await identityService.resolveOrCreateCustomer({
    provider: 'shopify',
    externalId: customerDetails?.legacyResourceId || (customerDetails?.id ? customerDetails.id.replace('gid://shopify/Customer/', '') : null) || order.customer?.id || null,
    email: customerDetails?.email || null,
    phone: customerDetails?.phone || null,
    firstName: customerDetails?.firstName || null,
    lastName: customerDetails?.lastName || null,
  });

  const fulfillmentStatus = mapFulfillmentStatus(order.displayFulfillmentStatus);
  const financialStatus = mapFinancialStatus(order.financialStatus);

  await db.transaction(async (tx) => {
    const [savedOrder] = await tx.insert(orders).values({
      customerId: resolvedCustomer.id,
      provider: 'shopify' as any,
      externalId: order.legacyResourceId || order.id,
      orderNumber: order.name,
      status: fulfillmentStatus as any,
      financialStatus: financialStatus as any,
      currency,
      total,
      placedAt: order.createdAt ? new Date(order.createdAt) : null,
      paidAt: order.processedAt ? new Date(order.processedAt) : null,
      dueAt: null,
      lateFlag: false,
      metadata: {
        shopifyId: order.id,
        closedAt: order.closedAt || null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [orders.provider, orders.externalId],
      set: {
        customerId: resolvedCustomer.id,
        status: fulfillmentStatus as any,
        financialStatus: financialStatus as any,
        currency,
        total,
        placedAt: order.createdAt ? new Date(order.createdAt) : null,
        paidAt: order.processedAt ? new Date(order.processedAt) : null,
        dueAt: null,
        lateFlag: false,
        metadata: {
          shopifyId: order.id,
          closedAt: order.closedAt || null,
        },
        updatedAt: new Date(),
      },
    }).returning();

    const orderId = savedOrder.id;

    // Refresh items to keep idempotent
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

    const items = order.lineItems?.edges || [];
    if (items.length === 0) return;

    await tx.insert(orderItems).values(
      items.map(({ node }) => ({
        orderId,
        sku: node.sku || null,
        productIdExternal: node.variant?.legacyResourceId || node.variant?.id || null,
        title: node.name,
        quantity: node.quantity ?? 1,
        price: node.originalUnitPriceSet?.shopMoney?.amount ?? '0',
        metadata: {
          variantTitle: node.variant?.title || null,
        },
      }))
    );
  });
};

export interface SyncShopifyOrdersOptions {
  maxPages?: number;
  fullSync?: boolean;
}

export async function syncShopifyOrders({ maxPages = 10, fullSync = false }: SyncShopifyOrdersOptions = {}) {
  console.log('[syncShopifyOrders] Starting Shopify order sync...');
  const shopifyService = new ShopifyService();

  // Load cursor from DB for incremental sync
  const savedCursor = fullSync ? null : await getCursor();
  let cursor: string | undefined = savedCursor?.cursor;
  let page = 0;
  let total = 0;
  let lastCursor: string | undefined;

  try {
    while (true) {
      const { orders: shopifyOrders, hasNextPage, nextCursor } = await shopifyService.fetchOrdersPage(cursor);
      if (!shopifyOrders.length) break;

      for (const order of shopifyOrders) {
        try {
          await upsertOrder(order);
          total += 1;
          // Track the last successful order cursor for persistence
          lastCursor = order.cursor || nextCursor;
        } catch (err) {
          console.error(`[syncShopifyOrders] Failed to upsert order ${order.name} (${order.id}):`, err);
        }
      }

      page += 1;
      if (!hasNextPage || page >= maxPages) break;
      cursor = nextCursor;
    }

    // Persist cursor for next run
    await updateCursor({
      cursor: lastCursor || cursor,
      lastSyncAt: new Date().toISOString(),
    }, total);

    console.log(`[syncShopifyOrders] Completed. Upserted ${total} orders across ${page} page(s).`);
    return { success: true, total, pages: page };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[syncShopifyOrders] Failed:', error);

    // Save error state to cursor
    await updateCursor({
      cursor: savedCursor?.cursor,
      lastSyncAt: savedCursor?.lastSyncAt,
    }, total, errorMessage);

    return { success: false, error: errorMessage, total, pages: page };
  }
}

// Allow running directly
if (process.argv[1]?.includes('syncShopifyOrders')) {
  syncShopifyOrders().catch((err) => {
    console.error('[syncShopifyOrders] Failed:', err);
    process.exit(1);
  });
}
