import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, customerIdentities, orders, orderItems, shipments, tickets, interactions } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/customers/[id]/360
 *
 * Returns a complete Customer 360 view including:
 * - Customer profile with all identities
 * - Orders from all providers (Shopify, Amazon, QBO)
 * - Shipments with tracking
 * - Recent tickets
 * - Interaction history
 * - Aggregated statistics
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const customerId = parseInt(id, 10);

  if (isNaN(customerId)) {
    return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
  }

  // Fetch customer with all related data in parallel
  const [
    customer,
    identities,
    customerOrders,
    customerShipments,
    customerTickets,
    customerInteractions,
    stats,
  ] = await Promise.all([
    // Customer profile
    db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    }),

    // All identities (shows which providers this customer is linked to)
    db.query.customerIdentities.findMany({
      where: eq(customerIdentities.customerId, customerId),
      orderBy: desc(customerIdentities.createdAt),
    }),

    // All orders with items
    db.query.orders.findMany({
      where: eq(orders.customerId, customerId),
      orderBy: desc(orders.placedAt),
      limit: 50,
      with: {
        items: true,
      },
    }),

    // All shipments
    db.query.shipments.findMany({
      where: eq(shipments.customerId, customerId),
      orderBy: desc(shipments.shipDate),
      limit: 20,
    }),

    // Recent tickets
    db.query.tickets.findMany({
      where: eq(tickets.customerId, customerId),
      orderBy: desc(tickets.updatedAt),
      limit: 20,
    }),

    // Recent interactions
    db.query.interactions.findMany({
      where: eq(interactions.customerId, customerId),
      orderBy: desc(interactions.occurredAt),
      limit: 50,
    }),

    // Aggregated statistics
    db.select({
      totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})`,
      totalSpend: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
      avgOrderValue: sql<string>`COALESCE(AVG(${orders.total}), 0)`,
      firstOrderDate: sql<Date>`MIN(${orders.placedAt})`,
      lastOrderDate: sql<Date>`MAX(${orders.placedAt})`,
    })
      .from(orders)
      .where(eq(orders.customerId, customerId)),
  ]);

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Group orders by provider
  const ordersByProvider = customerOrders.reduce((acc, order) => {
    const provider = order.provider || 'unknown';
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(order);
    return acc;
  }, {} as Record<string, typeof customerOrders>);

  // Group identities by provider
  const identitiesByProvider = identities.reduce((acc, identity) => {
    const provider = identity.provider || 'unknown';
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(identity);
    return acc;
  }, {} as Record<string, typeof identities>);

  // Calculate provider coverage
  const providers = [...new Set(identities.map(i => i.provider))];
  const hasEmail = identities.some(i => i.email);
  const hasPhone = identities.some(i => i.phone);
  const hasAddressHash = identities.some(i => i.externalId?.startsWith('address_hash:'));

  const response = {
    customer: {
      id: customer.id,
      primaryEmail: customer.primaryEmail,
      primaryPhone: customer.primaryPhone,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    },

    identities: {
      all: identities.map(i => ({
        id: i.id,
        provider: i.provider,
        externalId: i.externalId,
        email: i.email,
        phone: i.phone,
        metadata: i.metadata,
        createdAt: i.createdAt,
      })),
      byProvider: identitiesByProvider,
      providers,
      coverage: {
        hasEmail,
        hasPhone,
        hasAddressHash,
        providerCount: providers.length,
      },
    },

    orders: {
      all: customerOrders.map(o => ({
        id: o.id,
        provider: o.provider,
        externalId: o.externalId,
        orderNumber: o.orderNumber,
        status: o.status,
        financialStatus: o.financialStatus,
        total: o.total,
        currency: o.currency,
        placedAt: o.placedAt,
        items: o.items.map(item => ({
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        })),
      })),
      byProvider: Object.fromEntries(
        Object.entries(ordersByProvider).map(([provider, providerOrders]) => [
          provider,
          {
            count: providerOrders.length,
            total: providerOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0).toFixed(2),
            orders: providerOrders.map(o => ({
              id: o.id,
              orderNumber: o.orderNumber,
              total: o.total,
              status: o.status,
              placedAt: o.placedAt,
            })),
          },
        ])
      ),
      stats: stats[0] || {
        totalOrders: 0,
        totalSpend: '0',
        avgOrderValue: '0',
        firstOrderDate: null,
        lastOrderDate: null,
      },
    },

    shipments: customerShipments.map(s => ({
      id: s.id,
      provider: s.provider,
      orderId: s.orderId,
      trackingNumber: s.trackingNumber,
      carrierCode: s.carrierCode,
      status: s.status,
      shipDate: s.shipDate,
      estimatedDeliveryDate: s.estimatedDeliveryDate,
      actualDeliveryDate: s.actualDeliveryDate,
    })),

    tickets: customerTickets.map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      type: t.type,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),

    interactions: {
      recent: customerInteractions.slice(0, 20).map(i => ({
        id: i.id,
        channel: i.channel,
        direction: i.direction,
        occurredAt: i.occurredAt,
        metadata: i.metadata,
      })),
      byChannel: customerInteractions.reduce((acc, i) => {
        const channel = i.channel || 'unknown';
        acc[channel] = (acc[channel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalCount: customerInteractions.length,
    },

    summary: {
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || 'Unknown',
      primaryEmail: customer.primaryEmail,
      primaryPhone: customer.primaryPhone,
      totalOrders: customerOrders.length,
      totalSpend: stats[0]?.totalSpend || '0',
      avgOrderValue: stats[0]?.avgOrderValue || '0',
      daysSinceLastOrder: stats[0]?.lastOrderDate
        ? Math.floor((Date.now() - new Date(stats[0].lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      openTickets: customerTickets.filter(t => t.status !== 'closed').length,
      linkedProviders: providers,
    },
  };

  return NextResponse.json(response);
}
