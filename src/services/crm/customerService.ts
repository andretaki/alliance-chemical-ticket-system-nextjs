import { db, customers, orders, tickets } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

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
  orders: Array<{
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
  }>;
  tickets: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    updatedAt: string;
  }>;
  lateOrdersCount: number;
  openTicketsCount: number;
  totalOrders: number;
}

class CustomerService {
  async getOverviewById(customerId: number): Promise<CustomerOverview | null> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: {
        identities: true,
        orders: {
          orderBy: [
            desc(orders.placedAt),
            desc(orders.createdAt),
          ],
          limit: 20,
        },
        tickets: {
          orderBy: [desc(tickets.updatedAt)],
          limit: 20,
        },
      },
    });

    if (!customer) return null;

    const lateOrdersCount = customer.orders.filter(o => o.lateFlag).length;
    const openTicketsCount = customer.tickets.filter(t => t.status !== 'closed').length;

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
      orders: customer.orders.map(o => ({
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
      })),
      tickets: customer.tickets.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      })),
      lateOrdersCount,
      openTicketsCount,
      totalOrders: customer.orders.length,
    };
  }
}

export const customerService = new CustomerService();
