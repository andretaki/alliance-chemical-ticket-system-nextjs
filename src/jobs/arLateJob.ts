import { and, eq, isNull, lt, isNotNull, or } from 'drizzle-orm';
import { db, orders } from '@/lib/db';
import { outboxService } from '@/services/outboxService';

/**
 * Reset lateFlag for orders that have been paid.
 * Call this after payment sync jobs or webhooks to clear stale late flags.
 *
 * @param batchSize - Number of orders to process per batch (default 100)
 * @param maxBatches - Maximum batches to process to prevent infinite loops (default 50)
 * @returns Total number of orders with flags reset
 */
export async function resetPaidLateFlags(batchSize: number = 100, maxBatches: number = 50): Promise<number> {
  let totalReset = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const paidLateOrders = await db.select({ id: orders.id }).from(orders).where(
      and(
        eq(orders.lateFlag, true),
        or(
          eq(orders.financialStatus, 'paid'),
          isNotNull(orders.paidAt)
        )
      )
    ).limit(batchSize);

    if (paidLateOrders.length === 0) break;

    for (const order of paidLateOrders) {
      await db.update(orders).set({
        lateFlag: false,
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
    }

    totalReset += paidLateOrders.length;

    // If we got fewer than the batch size, we're done
    if (paidLateOrders.length < batchSize) break;
  }

  if (totalReset > 0) {
    console.log(`[arLateJob] Reset lateFlag for ${totalReset} paid orders`);
  }

  return totalReset;
}

/**
 * Flag overdue AR and enqueue tickets.
 */
export async function enqueueLateOrders(limit: number = 100) {
  const now = new Date();
  const lateOrders = await db.select().from(orders).where(
    and(
      eq(orders.lateFlag, false),
      isNull(orders.paidAt),
      lt(orders.dueAt, now)
    )
  ).limit(limit);

  for (const order of lateOrders) {
    await db.update(orders).set({
      lateFlag: true,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    await outboxService.enqueue('ar.overdue-ticket', {
      customerId: order.customerId,
      orderNumber: order.orderNumber,
      invoiceNumber: order.metadata && typeof order.metadata === 'object' ? (order.metadata as any).invoiceNumber : null,
      amount: order.total,
      currency: order.currency,
      dueAt: order.dueAt,
    });
  }

  return lateOrders.length;
}
