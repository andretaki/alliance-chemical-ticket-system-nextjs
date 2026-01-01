import { db, customers, orders, tickets, contacts, qboCustomerSnapshots, orderItems, opportunities, users, calls, customerScores, crmTasks } from '@/lib/db';
import { and, asc, count, desc, eq, ne, sql, inArray } from 'drizzle-orm';

export interface CustomerOverview {
  id: number;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  isVip: boolean;
  creditRiskLevel: string | null;
  identities: Array<{
    id: number;
    provider: string;
    externalId: string | null;
    email: string | null;
    phone: string | null;
  }>;
  contacts: Array<{
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    notes: string | null;
  }>;
  recentOrders: Array<{
    id: number;
    orderNumber: string | null;
    provider: string;
    status: string;
    financialStatus: string;
    currency: string;
    total: string;
    placedAt: string | null;
    dueAt: string | null;
    lateFlag: boolean;
    items: Array<{
      id: number;
      sku: string | null;
      title: string | null;
      quantity: number;
      price: string;
    }>;
  }>;
  openTickets: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    updatedAt: string;
  }>;
  openOpportunities: Array<{
    id: number;
    title: string;
    stage: string;
    estimatedValue: string | null;
    currency: string;
    ownerName: string | null;
    updatedAt: string;
  }>;
  recentCalls: Array<{
    id: number;
    direction: string;
    fromNumber: string;
    toNumber: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    contactName: string | null;
    ticketId: number | null;
    opportunityId: number | null;
    recordingUrl: string | null;
    notes: string | null;
  }>;
  qboSnapshot: {
    balance: string;
    currency: string;
    terms: string | null;
    lastInvoiceDate: string | null;
    lastPaymentDate: string | null;
    snapshotTakenAt: string;
  } | null;
  frequentProducts: Array<{
    sku: string | null;
    title: string | null;
    quantity: number;
    lastOrderedAt: string | null;
  }>;
  lateOrdersCount: number;
  openTicketsCount: number;
  totalOrders: number;
  // CRM Spine additions
  scores: {
    healthScore: number | null;
    churnRisk: 'low' | 'medium' | 'high' | null;
    ltv: string | null;
    last12MonthsRevenue: string | null;
    rScore: number | null;
    fScore: number | null;
    mScore: number | null;
    lastCalculatedAt: string | null;
  } | null;
  openTasks: Array<{
    id: number;
    type: string;
    reason: string | null;
    status: string;
    dueAt: string | null;
    opportunityId: number | null;
    opportunityTitle: string | null;
    ticketId: number | null;
    createdAt: string;
  }>;
}

class CustomerService {
  async getOverviewById(customerId: number): Promise<CustomerOverview | null> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: {
        identities: true,
      },
    });

    if (!customer) return null;

    const [recentOrders, openTickets, lateOrdersAgg, totalOrdersAgg, snapshot, contactList, frequentProducts, opportunitiesList, recentCalls, scores, openTasksList] =
      await Promise.all([
        db.query.orders.findMany({
          where: eq(orders.customerId, customerId),
          with: { items: true },
          orderBy: [
            desc(orders.placedAt),
            desc(orders.createdAt),
          ],
          limit: 5,
        }),
        db.query.tickets.findMany({
          where: and(eq(tickets.customerId, customerId), ne(tickets.status, 'closed')),
          orderBy: [desc(tickets.updatedAt)],
          limit: 10,
        }),
        db.select({ count: count() }).from(orders).where(and(eq(orders.customerId, customerId), eq(orders.lateFlag, true))),
        db.select({ count: count() }).from(orders).where(eq(orders.customerId, customerId)),
        db.query.qboCustomerSnapshots.findFirst({
          where: eq(qboCustomerSnapshots.customerId, customerId),
        }),
        db.query.contacts.findMany({
          where: eq(contacts.customerId, customerId),
          orderBy: [asc(contacts.name)],
        }),
        db.select({
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
          .limit(5),
        db.select({
          id: opportunities.id,
          title: opportunities.title,
          stage: opportunities.stage,
          estimatedValue: opportunities.estimatedValue,
          currency: opportunities.currency,
          updatedAt: opportunities.updatedAt,
          ownerName: users.name,
        })
          .from(opportunities)
          .leftJoin(users, eq(users.id, opportunities.ownerId))
          .where(and(eq(opportunities.customerId, customerId), inArray(opportunities.stage, ['lead', 'quote_sent'])))
          .orderBy(desc(opportunities.updatedAt))
          .limit(10),
        db.select({
          id: calls.id,
          direction: calls.direction,
          fromNumber: calls.fromNumber,
          toNumber: calls.toNumber,
          startedAt: calls.startedAt,
          endedAt: calls.endedAt,
          durationSeconds: calls.durationSeconds,
          ticketId: calls.ticketId,
          opportunityId: calls.opportunityId,
          recordingUrl: calls.recordingUrl,
          notes: calls.notes,
          contactName: contacts.name,
        })
          .from(calls)
          .leftJoin(contacts, eq(contacts.id, calls.contactId))
          .where(eq(calls.customerId, customerId))
          .orderBy(desc(calls.startedAt))
          .limit(10),
        // Customer scores
        db.query.customerScores.findFirst({
          where: eq(customerScores.customerId, customerId),
        }),
        // Open CRM tasks for this customer
        db.select({
          id: crmTasks.id,
          type: crmTasks.type,
          reason: crmTasks.reason,
          status: crmTasks.status,
          dueAt: crmTasks.dueAt,
          opportunityId: crmTasks.opportunityId,
          opportunityTitle: opportunities.title,
          ticketId: crmTasks.ticketId,
          createdAt: crmTasks.createdAt,
        })
          .from(crmTasks)
          .leftJoin(opportunities, eq(opportunities.id, crmTasks.opportunityId))
          .where(and(eq(crmTasks.customerId, customerId), eq(crmTasks.status, 'open')))
          .orderBy(asc(crmTasks.dueAt), desc(crmTasks.createdAt))
          .limit(10),
      ]);

    const lateOrdersCount = lateOrdersAgg[0]?.count ?? 0;
    const totalOrders = totalOrdersAgg[0]?.count ?? 0;
    const openTicketsCount = openTickets.length;

    return {
      id: customer.id,
      primaryEmail: customer.primaryEmail,
      primaryPhone: customer.primaryPhone,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      isVip: customer.isVip,
      creditRiskLevel: customer.creditRiskLevel,
      identities: customer.identities.map(i => ({
        id: i.id,
        provider: i.provider,
        externalId: i.externalId,
        email: i.email,
        phone: i.phone,
      })),
      contacts: contactList.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        notes: c.notes,
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        provider: o.provider,
        status: o.status,
        financialStatus: o.financialStatus,
        currency: o.currency,
        total: o.total?.toString() || '0',
        placedAt: o.placedAt ? o.placedAt.toISOString() : null,
        dueAt: o.dueAt ? o.dueAt.toISOString() : null,
        lateFlag: o.lateFlag,
        items: (o.items || []).map((item) => ({
          id: item.id,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price?.toString() || '0',
        })),
      })),
      openTickets: openTickets.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      })),
      openOpportunities: opportunitiesList.map(o => ({
        id: o.id,
        title: o.title,
        stage: o.stage,
        estimatedValue: o.estimatedValue ? o.estimatedValue.toString() : null,
        currency: o.currency,
        ownerName: o.ownerName ?? null,
        updatedAt: o.updatedAt?.toISOString ? o.updatedAt.toISOString() : new Date(o.updatedAt as any).toISOString(),
      })),
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        direction: c.direction,
        fromNumber: c.fromNumber,
        toNumber: c.toNumber,
        startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : c.startedAt,
        endedAt: c.endedAt instanceof Date ? c.endedAt.toISOString() : c.endedAt ? String(c.endedAt) : null,
        durationSeconds: c.durationSeconds ?? null,
        contactName: c.contactName ?? null,
        ticketId: c.ticketId ?? null,
        opportunityId: c.opportunityId ?? null,
        recordingUrl: c.recordingUrl ?? null,
        notes: c.notes ?? null,
      })),
      qboSnapshot: snapshot
        ? {
            balance: snapshot.balance?.toString() || '0',
            currency: snapshot.currency,
            terms: snapshot.terms,
            lastInvoiceDate: snapshot.lastInvoiceDate ? snapshot.lastInvoiceDate.toISOString() : null,
            lastPaymentDate: snapshot.lastPaymentDate ? snapshot.lastPaymentDate.toISOString() : null,
            snapshotTakenAt: snapshot.snapshotTakenAt ? snapshot.snapshotTakenAt.toISOString() : new Date().toISOString(),
          }
        : null,
      frequentProducts: frequentProducts.map((row) => ({
        sku: row.sku,
        title: row.title,
        quantity: Number(row.quantity || 0),
        lastOrderedAt: row.lastOrderedAt ? row.lastOrderedAt.toISOString() : null,
      })),
      lateOrdersCount,
      openTicketsCount,
      totalOrders,
      // CRM Spine additions
      scores: scores
        ? {
            healthScore: scores.healthScore,
            churnRisk: scores.churnRisk,
            ltv: scores.ltv?.toString() ?? null,
            last12MonthsRevenue: scores.last12MonthsRevenue?.toString() ?? null,
            rScore: scores.rScore,
            fScore: scores.fScore,
            mScore: scores.mScore,
            lastCalculatedAt: scores.lastCalculatedAt ? scores.lastCalculatedAt.toISOString() : null,
          }
        : null,
      openTasks: openTasksList.map((t) => ({
        id: t.id,
        type: t.type,
        reason: t.reason ?? null,
        status: t.status,
        dueAt: t.dueAt instanceof Date ? t.dueAt.toISOString() : t.dueAt ? String(t.dueAt) : null,
        opportunityId: t.opportunityId ?? null,
        opportunityTitle: t.opportunityTitle ?? null,
        ticketId: t.ticketId ?? null,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      })),
    };
  }
}

export const customerService = new CustomerService();
