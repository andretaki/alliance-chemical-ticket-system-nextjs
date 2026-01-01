/**
 * Amazon Orders Sync Job
 * Fetches orders from Amazon SP-API and persists to local database.
 * Uses cursor-based incremental sync with rag_sync_cursors table.
 * Also syncs FBA fulfillment/tracking data to unified shipments table.
 */

import { db } from '@/lib/db';
import { orders, orderItems, shipments, ragSyncCursors } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  fetchAmazonOrdersPage,
  fetchAmazonOrderItems,
  fetchFbaFulfillmentOrder,
  mapAmazonOrderStatus,
  mapAmazonFinancialStatus,
  isConfigured,
  type AmazonOrder,
  type AmazonOrderItem,
} from '@/lib/amazonSpService';
import { identityService } from '@/services/crm/identityService';
import { enqueueRagJob } from '@/services/rag/ragIngestionService';

interface SyncCursor {
  lastUpdatedAt?: string;
  nextToken?: string;
}

async function getCursor(): Promise<SyncCursor | null> {
  const cursor = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, 'amazon_order'),
  });
  return cursor?.cursorValue as SyncCursor | null;
}

async function updateCursor(cursorValue: SyncCursor, itemsSynced: number, error?: string) {
  await db.insert(ragSyncCursors).values({
    sourceType: 'amazon_order',
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

async function upsertAmazonOrder(amazonOrder: AmazonOrder, items: AmazonOrderItem[]) {
  const total = amazonOrder.OrderTotal?.Amount ?? '0';
  const currency = amazonOrder.OrderTotal?.CurrencyCode ?? 'USD';

  // Resolve or create customer using email if available, otherwise address hash fallback
  const hasBuyerEmail = !!amazonOrder.BuyerEmail;
  const shippingAddress = amazonOrder.ShippingAddress;

  // Build address for hash fallback when email is missing
  const address = shippingAddress ? {
    name: shippingAddress.Name || amazonOrder.BuyerName || '',
    address1: shippingAddress.AddressLine1 || '',
    address2: shippingAddress.AddressLine2 || '',
    city: shippingAddress.City || '',
    state: shippingAddress.StateOrRegion || '',
    postalCode: shippingAddress.PostalCode || '',
    country: shippingAddress.CountryCode || 'US',
  } : undefined;

  const resolvedCustomer = hasBuyerEmail
    ? await identityService.resolveOrCreateCustomer({
        provider: 'amazon',
        externalId: amazonOrder.AmazonOrderId,
        email: amazonOrder.BuyerEmail,
        firstName: amazonOrder.BuyerName?.split(' ')[0] || null,
        lastName: amazonOrder.BuyerName?.split(' ').slice(1).join(' ') || null,
      })
    : await identityService.resolveOrCreateCustomerWithAddressHash({
        provider: 'amazon',
        externalId: amazonOrder.AmazonOrderId,
        firstName: amazonOrder.BuyerName?.split(' ')[0] || null,
        lastName: amazonOrder.BuyerName?.split(' ').slice(1).join(' ') || null,
      }, address);

  const fulfillmentStatus = mapAmazonOrderStatus(amazonOrder.OrderStatus);
  const financialStatus = mapAmazonFinancialStatus(amazonOrder);

  const [savedOrder] = await db.insert(orders).values({
    customerId: resolvedCustomer.id,
    provider: 'amazon',
    externalId: amazonOrder.AmazonOrderId,
    orderNumber: amazonOrder.AmazonOrderId,
    status: fulfillmentStatus as any,
    financialStatus: financialStatus as any,
    currency,
    total,
    placedAt: new Date(amazonOrder.PurchaseDate),
    paidAt: amazonOrder.OrderStatus !== 'Canceled' ? new Date(amazonOrder.PurchaseDate) : null,
    dueAt: null,
    lateFlag: false,
    metadata: {
      amazonOrderId: amazonOrder.AmazonOrderId,
      fulfillmentChannel: amazonOrder.FulfillmentChannel,
      orderStatus: amazonOrder.OrderStatus,
      salesChannel: amazonOrder.SalesChannel,
      lastUpdateDate: amazonOrder.LastUpdateDate,
      shippingAddress: amazonOrder.ShippingAddress,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [orders.provider, orders.externalId],
    set: {
      customerId: resolvedCustomer.id,
      status: fulfillmentStatus as any,
      financialStatus: financialStatus as any,
      total,
      metadata: {
        amazonOrderId: amazonOrder.AmazonOrderId,
        fulfillmentChannel: amazonOrder.FulfillmentChannel,
        orderStatus: amazonOrder.OrderStatus,
        salesChannel: amazonOrder.SalesChannel,
        lastUpdateDate: amazonOrder.LastUpdateDate,
        shippingAddress: amazonOrder.ShippingAddress,
      },
      updatedAt: new Date(),
    },
  }).returning();

  const orderId = savedOrder.id;

  // Refresh order items
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length > 0) {
    await db.insert(orderItems).values(
      items.map((item) => ({
        orderId,
        sku: item.SellerSKU || null,
        productIdExternal: item.ASIN,
        title: item.Title,
        quantity: item.QuantityOrdered,
        price: item.ItemPrice?.Amount ?? '0',
        metadata: {
          asin: item.ASIN,
          orderItemId: item.OrderItemId,
          quantityShipped: item.QuantityShipped,
        },
      }))
    );
  }

  // Enqueue RAG job for this order
  await enqueueRagJob('amazon_order', amazonOrder.AmazonOrderId, 'upsert');

  // Sync FBA shipments if applicable
  if (amazonOrder.FulfillmentChannel === 'AFN' &&
      (amazonOrder.OrderStatus === 'Shipped' || amazonOrder.OrderStatus === 'PartiallyShipped')) {
    await syncFbaShipments(amazonOrder, orderId, resolvedCustomer.id);
  }

  return savedOrder;
}

async function syncFbaShipments(amazonOrder: AmazonOrder, orderId: number, customerId: number) {
  try {
    const fulfillmentOrder = await fetchFbaFulfillmentOrder(amazonOrder.AmazonOrderId);
    if (!fulfillmentOrder?.FulfillmentShipments) {
      console.log(`[syncAmazonOrders] No FBA shipments found for ${amazonOrder.AmazonOrderId}`);
      return;
    }

    for (const shipment of fulfillmentOrder.FulfillmentShipments) {
      if (!shipment.AmazonShipmentId) continue;

      await db.insert(shipments).values({
        customerId,
        orderId,
        provider: 'amazon_fba',
        externalId: shipment.AmazonShipmentId,
        orderNumber: amazonOrder.AmazonOrderId,
        trackingNumber: null, // FBA tracking requires separate API call
        carrierCode: 'AMZN', // Amazon handles FBA fulfillment
        serviceCode: null,
        shipDate: fulfillmentOrder.StatusUpdatedDate ? new Date(fulfillmentOrder.StatusUpdatedDate) : null,
        estimatedDeliveryDate: shipment.EstimatedArrivalDate ? new Date(shipment.EstimatedArrivalDate) : null,
        actualDeliveryDate: null,
        status: fulfillmentOrder.FulfillmentOrderStatus || 'shipped',
        cost: null,
        weight: null,
        weightUnit: null,
        metadata: {
          sellerFulfillmentOrderId: fulfillmentOrder.SellerFulfillmentOrderId,
          displayableOrderId: fulfillmentOrder.DisplayableOrderId,
          packageNumber: shipment.PackageNumber,
          shipmentItems: shipment.ShipmentItems,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [shipments.provider, shipments.externalId],
        set: {
          orderId,
          customerId,
          estimatedDeliveryDate: shipment.EstimatedArrivalDate ? new Date(shipment.EstimatedArrivalDate) : null,
          status: fulfillmentOrder.FulfillmentOrderStatus || 'shipped',
          metadata: {
            sellerFulfillmentOrderId: fulfillmentOrder.SellerFulfillmentOrderId,
            displayableOrderId: fulfillmentOrder.DisplayableOrderId,
            packageNumber: shipment.PackageNumber,
            shipmentItems: shipment.ShipmentItems,
          },
          updatedAt: new Date(),
        },
      });

      // Enqueue RAG job for this shipment
      await enqueueRagJob('amazon_shipment', shipment.AmazonShipmentId, 'upsert');
    }

    console.log(`[syncAmazonOrders] Synced ${fulfillmentOrder.FulfillmentShipments.length} FBA shipments for ${amazonOrder.AmazonOrderId}`);
  } catch (err) {
    console.error(`[syncAmazonOrders] Failed to sync FBA shipments for ${amazonOrder.AmazonOrderId}:`, err);
  }
}

export interface SyncAmazonOrdersOptions {
  maxPages?: number;
  sinceDays?: number;
  fullSync?: boolean;
}

export async function syncAmazonOrders({
  maxPages = 10,
  sinceDays = 30,
  fullSync = false,
}: SyncAmazonOrdersOptions = {}) {
  if (!isConfigured()) {
    console.log('[syncAmazonOrders] Amazon SP-API not configured, skipping');
    return { success: false, reason: 'not_configured' };
  }

  console.log('[syncAmazonOrders] Starting Amazon order sync...');

  const cursor = fullSync ? null : await getCursor();
  const since = cursor?.lastUpdatedAt
    ? new Date(cursor.lastUpdatedAt)
    : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  let nextToken: string | undefined = fullSync ? undefined : cursor?.nextToken;
  let page = 0;
  let total = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  let latestUpdatedAt = since;

  try {
    while (page < maxPages) {
      const { orders: amazonOrders, nextToken: newNextToken } = await fetchAmazonOrdersPage({
        lastUpdatedAfter: since.toISOString(),
        nextToken,
        maxResultsPerPage: 100,
      });

      if (!amazonOrders.length) break;

      for (const amazonOrder of amazonOrders) {
        try {
          // Fetch order items
          const items = await fetchAmazonOrderItems(amazonOrder.AmazonOrderId);

          // Check if order exists
          const existing = await db.query.orders.findFirst({
            where: and(eq(orders.provider, 'amazon'), eq(orders.externalId, amazonOrder.AmazonOrderId)),
            columns: { id: true },
          });

          await upsertAmazonOrder(amazonOrder, items);
          total += 1;

          if (existing) {
            updated += 1;
          } else {
            created += 1;
          }

          // Track latest updated timestamp
          const orderUpdatedAt = new Date(amazonOrder.LastUpdateDate);
          if (orderUpdatedAt > latestUpdatedAt) {
            latestUpdatedAt = orderUpdatedAt;
          }
        } catch (err) {
          console.error(`[syncAmazonOrders] Failed to upsert order ${amazonOrder.AmazonOrderId}:`, err);
          failed += 1;
        }
      }

      page += 1;
      nextToken = newNextToken;
      if (!nextToken) break;

      // Brief pause between pages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update cursor for next run
    await updateCursor({
      lastUpdatedAt: latestUpdatedAt.toISOString(),
      nextToken: nextToken || undefined,
    }, total);

    console.log(`[syncAmazonOrders] Completed. Synced ${total} orders (created: ${created}, updated: ${updated}, failed: ${failed}) across ${page} page(s).`);

    return { success: true, total, created, updated, failed, pages: page };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[syncAmazonOrders] Failed:', error);

    // Save error state to cursor
    await updateCursor({
      lastUpdatedAt: cursor?.lastUpdatedAt || since.toISOString(),
      nextToken: nextToken,
    }, total, errorMessage);

    return { success: false, error: errorMessage, total, created, updated, failed };
  }
}

// Allow running directly
if (process.argv[1]?.includes('syncAmazonOrders')) {
  syncAmazonOrders().then((result) => {
    console.log('[syncAmazonOrders] Result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch((err) => {
    console.error('[syncAmazonOrders] Failed:', err);
    process.exit(1);
  });
}
