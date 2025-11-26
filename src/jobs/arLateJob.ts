import { and, eq, isNull, lt } from 'drizzle-orm';
import { db, orders } from '@/lib/db';
import { outboxService } from '@/services/outboxService';

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
