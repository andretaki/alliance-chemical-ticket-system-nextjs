import { db, orders, orderItems, ragSyncCursors } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ShopifyService, type ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { identityService, type SyncMetrics, createSyncMetrics, logSyncMetrics } from '@/services/crm/identityService';
import { recalculateCustomerScore } from './calculateCustomerScores';
import { resetPaidLateFlags } from './arLateJob';

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

const upsertOrder = async (order: ShopifyOrderNode, metrics: SyncMetrics): Promise<{ id: number; customerId: number | null; isAmbiguous: boolean }> => {
  const total = order.totalPriceSet?.shopMoney?.amount ?? '0';
  const currency = order.totalPriceSet?.shopMoney?.currencyCode ?? 'USD';
  const customerDetails = order.customer;

  // Use resolveCustomerAdvanced for proper ambiguity detection and race condition handling
  const result = await identityService.upsertCustomerWithMetrics({
    provider: 'shopify',
    externalId: customerDetails?.legacyResourceId || (customerDetails?.id ? customerDetails.id.replace('gid://shopify/Customer/', '') : null) || order.customer?.id || null,
    email: customerDetails?.email || null,
    phone: customerDetails?.phone || null,
    firstName: customerDetails?.firstName || null,
    lastName: customerDetails?.lastName || null,
  });

  // Track metrics
  if (result.action === 'created') metrics.created++;
  else if (result.action === 'updated') metrics.updated++;
  else if (result.action === 'linked') metrics.linked++;
  else if (result.action === 'ambiguous') metrics.ambiguous++;

  const fulfillmentStatus = mapFulfillmentStatus(order.displayFulfillmentStatus);
  const financialStatus = mapFinancialStatus(order.displayFinancialStatus);

  const orderResult = await db.transaction(async (tx) => {
    const [savedOrder] = await tx.insert(orders).values({
      customerId: result.customerId,
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
        customerId: result.customerId,
        status: fulfillmentStatus as any,
        financialStatus: financialStatus as any,
        currency,
        total,
        placedAt: order.createdAt ? new Date(order.createdAt) : null,
        paidAt: order.processedAt ? new Date(order.processedAt) : null,
        // NOTE: lateFlag intentionally omitted - managed by AR job only
        // dueAt intentionally omitted - not overwritten if set by AR job
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
    if (items.length > 0) {
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
    }

    return { id: savedOrder.id, customerId: savedOrder.customerId };
  });

  return { ...orderResult, isAmbiguous: result.action === 'ambiguous' };
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

  // Track identity resolution metrics
  const metrics = createSyncMetrics();

  try {
    while (true) {
      const { orders: shopifyOrders, hasNextPage, nextCursor } = await shopifyService.fetchOrdersPage(cursor);
      if (!shopifyOrders.length) break;

      // Track customers to recalculate scores after batch
      const customersToRecalculate = new Set<number>();

      for (const order of shopifyOrders) {
        try {
          const savedOrder = await upsertOrder(order, metrics);
          total += 1;
          metrics.fetched += 1;
          // Track the last successful order cursor for persistence
          lastCursor = order.cursor || nextCursor;

          // Queue customer for score recalculation
          if (savedOrder?.customerId) {
            customersToRecalculate.add(savedOrder.customerId);
          }

          // Log ambiguous matches for visibility
          if (savedOrder.isAmbiguous) {
            console.warn(`[syncShopifyOrders] Order ${order.name} linked to ambiguous customer ${savedOrder.customerId} - MERGE_REVIEW task created`);
          }
        } catch (err) {
          console.error(`[syncShopifyOrders] Failed to upsert order ${order.name} (${order.id}):`, err);
          metrics.errors += 1;
        }
      }

      // Recalculate scores for affected customers (async, don't block sync)
      for (const customerId of customersToRecalculate) {
        recalculateCustomerScore(customerId).catch(err => {
          console.warn(`[syncShopifyOrders] Score recalc failed for customer ${customerId}:`, err);
        });
      }

      page += 1;
      if (!hasNextPage || page >= maxPages) break;
      cursor = nextCursor;
    }

    // Reset late flags for orders that have been paid
    // This catches cases where Shopify sync updates financial status to 'paid'
    const resetCount = await resetPaidLateFlags();
    if (resetCount > 0) {
      console.log(`[syncShopifyOrders] Reset ${resetCount} late flags for paid orders`);
    }

    // Persist cursor for next run
    await updateCursor({
      cursor: lastCursor || cursor,
      lastSyncAt: new Date().toISOString(),
    }, total);

    // Log identity resolution metrics
    logSyncMetrics('Shopify', metrics);

    console.log(`[syncShopifyOrders] Completed. Upserted ${total} orders across ${page} page(s).`);
    return { success: true, total, pages: page, metrics };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[syncShopifyOrders] Failed:', error);

    // Save error state to cursor
    await updateCursor({
      cursor: savedCursor?.cursor,
      lastSyncAt: savedCursor?.lastSyncAt,
    }, total, errorMessage);

    return { success: false, error: errorMessage, total, pages: page, metrics };
  }
}

// Allow running directly
if (process.argv[1]?.includes('syncShopifyOrders')) {
  syncShopifyOrders().catch((err) => {
    console.error('[syncShopifyOrders] Failed:', err);
    process.exit(1);
  });
}
