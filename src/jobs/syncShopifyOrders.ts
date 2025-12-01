import { db, orders, orderItems } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ShopifyService, type ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { identityService } from '@/services/crm/identityService';

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

export async function syncShopifyOrders({ maxPages = 10 }: { maxPages?: number } = {}) {
  console.log('[syncShopifyOrders] Starting Shopify order sync...');
  const shopifyService = new ShopifyService();

  let cursor: string | undefined = undefined;
  let page = 0;
  let total = 0;

  while (true) {
    const { orders: shopifyOrders, hasNextPage, nextCursor } = await shopifyService.fetchOrdersPage(cursor);
    if (!shopifyOrders.length) break;

    for (const order of shopifyOrders) {
      try {
        await upsertOrder(order);
        total += 1;
      } catch (err) {
        console.error(`[syncShopifyOrders] Failed to upsert order ${order.name} (${order.id}):`, err);
      }
    }

    page += 1;
    if (!hasNextPage || page >= maxPages) break;
    cursor = nextCursor;
  }

  console.log(`[syncShopifyOrders] Completed. Upserted ${total} orders across ${page} page(s).`);
}

// Allow running directly
if (process.argv[1]?.includes('syncShopifyOrders')) {
  syncShopifyOrders().catch((err) => {
    console.error('[syncShopifyOrders] Failed:', err);
    process.exit(1);
  });
}
