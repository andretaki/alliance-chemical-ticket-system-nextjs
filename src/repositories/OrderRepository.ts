import { db, orders, orderItems } from '@/lib/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export class OrderRepository {
  async getRecentOrdersWithItems(customerId: number, limit = 5) {
    return db.query.orders.findMany({
      where: eq(orders.customerId, customerId),
      with: { items: true },
      orderBy: [desc(orders.placedAt), desc(orders.createdAt)],
      limit,
    });
  }

  async countLateOrders(customerId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.lateFlag, true)));
    return result[0]?.count ?? 0;
  }

  async countTotalOrders(customerId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.customerId, customerId));
    return result[0]?.count ?? 0;
  }

  async getFrequentProducts(customerId: number, limit = 5) {
    return db
      .select({
        sku: orderItems.sku,
        title: orderItems.title,
        quantity: sql<number>`SUM(${orderItems.quantity})`,
        lastOrderedAt: sql<Date | null>`MAX(${orders.placedAt})`,
      })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.customerId, customerId))
      .groupBy(orderItems.sku, orderItems.title)
      .orderBy(desc(sql`SUM(${orderItems.quantity})`))
      .limit(limit);
  }
}

export const orderRepository = new OrderRepository();
