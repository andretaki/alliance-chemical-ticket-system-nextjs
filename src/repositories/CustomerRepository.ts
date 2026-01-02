import {
  calls,
  contacts,
  crmTasks,
  customerIdentities,
  customerScores,
  customers,
  db,
  interactions,
  opportunities,
  orders,
  orderItems,
  qboCustomerSnapshots,
  qboEstimates,
  qboInvoices,
  ragSources,
  shipstationShipments,
  shipments,
  tickets,
  users,
} from '@/lib/db';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { CustomerOverview } from '@/lib/contracts';
import {
  identityService,
  type AddressInput,
  type IdentityInput,
  type ResolutionResult,
} from '@/services/crm/identityService';
import { orderRepository } from '@/repositories/OrderRepository';

export interface MergeCandidate {
  id: number;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  matchedOn: Array<'email' | 'phone'>;
}

export class CustomerRepository {
  resolveOrCreateCustomer(input: IdentityInput) {
    return identityService.resolveOrCreateCustomer(input);
  }

  resolveOrCreateCustomerWithAddressHash(
    input: Omit<IdentityInput, 'email' | 'phone'>,
    address?: AddressInput
  ) {
    return identityService.resolveOrCreateCustomerWithAddressHash(input, address);
  }

  resolveCustomerAdvanced(input: IdentityInput, address?: AddressInput): Promise<ResolutionResult> {
    return identityService.resolveCustomerAdvanced(input, address);
  }

  upsertCustomerWithMetrics(input: IdentityInput, address?: AddressInput) {
    return identityService.upsertCustomerWithMetrics(input, address);
  }

  recordInteraction(input: {
    customerId: number;
    ticketId?: number | null;
    commentId?: number | null;
    channel: string;
    direction?: 'inbound' | 'outbound';
    metadata?: Record<string, unknown>;
  }) {
    return identityService.recordInteraction(input);
  }

  findByAddressHash(provider: IdentityInput['provider'], addressHash: string) {
    return identityService.findByAddressHash(provider, addressHash);
  }

  /**
   * Search unified customer database by query string.
   * Searches across: email, phone, name, company, and linked identities.
   * Returns customers with their linked providers for deduplication.
   */
  async searchCustomers(query: string, options: { limit?: number; type?: 'auto' | 'email' | 'phone' | 'name' } = {}) {
    const { limit = 20, type = 'auto' } = options;
    const searchTerm = `%${query.trim()}%`;
    const exactTerm = query.trim().toLowerCase();

    // Detect search type if auto
    let searchType = type;
    if (type === 'auto') {
      if (query.includes('@')) {
        searchType = 'email';
      } else if (/^\+?[\d\s\-\(\)\.]{7,}$/.test(query.replace(/\s/g, ''))) {
        searchType = 'phone';
      } else {
        searchType = 'name';
      }
    }

    // Build search conditions based on type
    const buildConditions = () => {
      if (searchType === 'email') {
        return or(
          ilike(customers.primaryEmail, searchTerm),
          sql`EXISTS (
            SELECT 1 FROM ticketing_prod.customer_identities ci
            WHERE ci.customer_id = ${customers.id}
            AND LOWER(ci.email) LIKE LOWER(${searchTerm})
          )`
        );
      }
      if (searchType === 'phone') {
        // Normalize phone for comparison (strip non-digits)
        const normalizedPhone = query.replace(/\D/g, '');
        const phonePattern = `%${normalizedPhone.slice(-10)}%`; // Last 10 digits
        return or(
          sql`REGEXP_REPLACE(${customers.primaryPhone}, '[^0-9]', '', 'g') LIKE ${phonePattern}`,
          sql`EXISTS (
            SELECT 1 FROM ticketing_prod.customer_identities ci
            WHERE ci.customer_id = ${customers.id}
            AND REGEXP_REPLACE(ci.phone, '[^0-9]', '', 'g') LIKE ${phonePattern}
          )`
        );
      }
      // Name search - search firstName, lastName, company, and identity names
      return or(
        ilike(customers.firstName, searchTerm),
        ilike(customers.lastName, searchTerm),
        ilike(customers.company, searchTerm),
        sql`CONCAT(${customers.firstName}, ' ', ${customers.lastName}) ILIKE ${searchTerm}`,
        sql`EXISTS (
          SELECT 1 FROM ticketing_prod.customer_identities ci
          WHERE ci.customer_id = ${customers.id}
          AND (ci.email ILIKE ${searchTerm} OR ci.phone ILIKE ${searchTerm})
        )`
      );
    };

    // Execute search query
    const results = await db
      .select({
        id: customers.id,
        primaryEmail: customers.primaryEmail,
        primaryPhone: customers.primaryPhone,
        firstName: customers.firstName,
        lastName: customers.lastName,
        company: customers.company,
        isVip: customers.isVip,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(buildConditions())
      .orderBy(
        // Prioritize exact matches
        sql`CASE
          WHEN LOWER(${customers.primaryEmail}) = ${exactTerm} THEN 0
          WHEN LOWER(${customers.firstName}) = ${exactTerm} THEN 1
          WHEN LOWER(${customers.lastName}) = ${exactTerm} THEN 2
          ELSE 3
        END`,
        desc(customers.updatedAt)
      )
      .limit(limit);

    // Fetch linked providers for each customer
    const customerIds = results.map(r => r.id);
    const identities = customerIds.length > 0
      ? await db.query.customerIdentities.findMany({
          where: inArray(customerIdentities.customerId, customerIds),
          columns: { customerId: true, provider: true, externalId: true, email: true },
        })
      : [];

    // Group identities by customer
    const identitiesByCustomer = new Map<number, typeof identities>();
    for (const identity of identities) {
      if (!identity.customerId) continue;
      const existing = identitiesByCustomer.get(identity.customerId) || [];
      existing.push(identity);
      identitiesByCustomer.set(identity.customerId, existing);
    }

    return {
      customers: results.map(customer => ({
        ...customer,
        source: 'unified' as const,
        linkedProviders: [...new Set(
          (identitiesByCustomer.get(customer.id) || []).map(i => i.provider)
        )],
        identities: identitiesByCustomer.get(customer.id) || [],
      })),
      searchType,
      totalCount: results.length,
    };
  }

  /**
   * Check if a customer with given email/phone already exists in our unified DB.
   * Used for deduplication when showing external search results.
   */
  async findExistingByEmailsOrPhones(emails: string[], phones: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (emails.length === 0 && phones.length === 0) return result;

    const conditions = [];
    if (emails.length > 0) {
      conditions.push(sql`LOWER(${customers.primaryEmail}) IN (${sql.join(emails.map(e => sql`${e.toLowerCase()}`), sql`, `)})`);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ticketing_prod.customer_identities ci
        WHERE ci.customer_id = ${customers.id}
        AND LOWER(ci.email) IN (${sql.join(emails.map(e => sql`${e.toLowerCase()}`), sql`, `)})
      )`);
    }
    if (phones.length > 0) {
      const normalizedPhones = phones.map(p => p.replace(/\D/g, '').slice(-10));
      conditions.push(sql`REGEXP_REPLACE(${customers.primaryPhone}, '[^0-9]', '', 'g') LIKE ANY(ARRAY[${sql.join(normalizedPhones.map(p => sql`'%${p}%'`), sql`, `)}])`);
    }

    const matches = await db
      .select({
        id: customers.id,
        email: customers.primaryEmail,
        phone: customers.primaryPhone,
      })
      .from(customers)
      .where(or(...conditions));

    for (const match of matches) {
      if (match.email) result.set(match.email.toLowerCase(), match.id);
      if (match.phone) result.set(match.phone.replace(/\D/g, '').slice(-10), match.id);
    }

    return result;
  }

  async getOverviewById(customerId: number): Promise<CustomerOverview | null> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: {
        identities: true,
      },
    });

    if (!customer) return null;

    const [
      recentOrders,
      openTickets,
      lateOrdersCount,
      totalOrders,
      snapshot,
      contactList,
      frequentProducts,
      opportunitiesList,
      recentCalls,
      scores,
      openTasksList,
    ] = await Promise.all([
      orderRepository.getRecentOrdersWithItems(customerId, 5),
      db.query.tickets.findMany({
        where: and(eq(tickets.customerId, customerId), ne(tickets.status, 'closed')),
        orderBy: [desc(tickets.updatedAt)],
        limit: 10,
      }),
      orderRepository.countLateOrders(customerId),
      orderRepository.countTotalOrders(customerId),
      db.query.qboCustomerSnapshots.findFirst({
        where: eq(qboCustomerSnapshots.customerId, customerId),
      }),
      db.query.contacts.findMany({
        where: eq(contacts.customerId, customerId),
        orderBy: [asc(contacts.name)],
      }),
      orderRepository.getFrequentProducts(customerId, 5),
      db
        .select({
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
      db
        .select({
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
      db.query.customerScores.findFirst({
        where: eq(customerScores.customerId, customerId),
      }),
      db
        .select({
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
      identities: customer.identities.map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        externalId: identity.externalId,
        email: identity.email,
        phone: identity.phone,
      })),
      contacts: contactList.map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        notes: contact.notes,
      })),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        provider: order.provider,
        externalId: order.externalId ?? null,
        status: order.status,
        financialStatus: order.financialStatus,
        currency: order.currency,
        total: order.total?.toString() || '0',
        placedAt: order.placedAt ? order.placedAt.toISOString() : null,
        dueAt: order.dueAt ? order.dueAt.toISOString() : null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        lateFlag: order.lateFlag,
        items: (order.items || []).map((item) => ({
          id: item.id,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price?.toString() || '0',
        })),
      })),
      openTickets: openTickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        updatedAt: ticket.updatedAt.toISOString(),
      })),
      openOpportunities: opportunitiesList.map((opp) => ({
        id: opp.id,
        title: opp.title,
        stage: opp.stage,
        estimatedValue: opp.estimatedValue ? opp.estimatedValue.toString() : null,
        currency: opp.currency,
        ownerName: opp.ownerName ?? null,
        updatedAt: opp.updatedAt?.toISOString
          ? opp.updatedAt.toISOString()
          : new Date(opp.updatedAt as any).toISOString(),
      })),
      recentCalls: recentCalls.map((call) => ({
        id: call.id,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        startedAt: call.startedAt instanceof Date ? call.startedAt.toISOString() : call.startedAt,
        endedAt: call.endedAt instanceof Date ? call.endedAt.toISOString() : call.endedAt ? String(call.endedAt) : null,
        durationSeconds: call.durationSeconds ?? null,
        contactName: call.contactName ?? null,
        ticketId: call.ticketId ?? null,
        opportunityId: call.opportunityId ?? null,
        recordingUrl: call.recordingUrl ?? null,
        notes: call.notes ?? null,
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
      openTasks: openTasksList.map((task) => ({
        id: task.id,
        type: task.type,
        reason: task.reason ?? null,
        status: task.status,
        dueAt: task.dueAt instanceof Date ? task.dueAt.toISOString() : task.dueAt ? String(task.dueAt) : null,
        opportunityId: task.opportunityId ?? null,
        opportunityTitle: task.opportunityTitle ?? null,
        ticketId: task.ticketId ?? null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
      })),
    };
  }

  /**
   * Get Customer 360 view with detailed breakdowns by provider.
   * This provides a more comprehensive view than getOverviewById,
   * grouping orders, identities, and interactions by provider/channel.
   */
  async getCustomer360(customerId: number) {
    const [
      customer,
      identities,
      customerOrders,
      customerShipments,
      customerTickets,
      customerInteractions,
      stats,
    ] = await Promise.all([
      db.query.customers.findFirst({
        where: eq(customers.id, customerId),
      }),
      db.query.customerIdentities.findMany({
        where: eq(customerIdentities.customerId, customerId),
        orderBy: desc(customerIdentities.createdAt),
      }),
      db.query.orders.findMany({
        where: eq(orders.customerId, customerId),
        orderBy: desc(orders.placedAt),
        limit: 50,
        with: { items: true },
      }),
      db.query.shipments.findMany({
        where: eq(shipments.customerId, customerId),
        orderBy: desc(shipments.shipDate),
        limit: 20,
      }),
      db.query.tickets.findMany({
        where: eq(tickets.customerId, customerId),
        orderBy: desc(tickets.updatedAt),
        limit: 20,
      }),
      db.query.interactions.findMany({
        where: eq(interactions.customerId, customerId),
        orderBy: desc(interactions.occurredAt),
        limit: 50,
      }),
      db.select({
        totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})`,
        totalSpend: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        avgOrderValue: sql<string>`COALESCE(AVG(${orders.total}), 0)`,
        firstOrderDate: sql<Date | null>`MIN(${orders.placedAt})`,
        lastOrderDate: sql<Date | null>`MAX(${orders.placedAt})`,
      })
        .from(orders)
        .where(eq(orders.customerId, customerId)),
    ]);

    if (!customer) return null;

    // Group orders by provider
    const ordersByProvider = customerOrders.reduce((acc, order) => {
      const provider = order.provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(order);
      return acc;
    }, {} as Record<string, typeof customerOrders>);

    // Group identities by provider
    const identitiesByProvider = identities.reduce((acc, identity) => {
      const provider = identity.provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(identity);
      return acc;
    }, {} as Record<string, typeof identities>);

    // Calculate provider coverage
    const providers = [...new Set(identities.map(i => i.provider))];
    const hasEmail = identities.some(i => i.email);
    const hasPhone = identities.some(i => i.phone);
    const hasAddressHash = identities.some(i => i.externalId?.startsWith('address_hash:'));

    const orderStats = stats[0] || {
      totalOrders: 0,
      totalSpend: '0',
      avgOrderValue: '0',
      firstOrderDate: null,
      lastOrderDate: null,
    };

    return {
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
          paidAt: o.paidAt,
          lateFlag: o.lateFlag,
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
        stats: orderStats,
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
        title: t.title,
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
        totalSpend: orderStats.totalSpend,
        avgOrderValue: orderStats.avgOrderValue,
        daysSinceLastOrder: orderStats.lastOrderDate
          ? Math.floor((Date.now() - new Date(orderStats.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        openTickets: customerTickets.filter(t => t.status !== 'closed').length,
        linkedProviders: providers,
      },
    };
  }

  async findMergeCandidates(customerId: number): Promise<MergeCandidate[]> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });
    if (!customer) return [];

    const identities = await db.query.customerIdentities.findMany({
      where: eq(customerIdentities.customerId, customerId),
    });

    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    if (customer.primaryEmail) emailSet.add(customer.primaryEmail);
    if (customer.primaryPhone) phoneSet.add(customer.primaryPhone);
    identities.forEach((identity) => {
      if (identity.email) emailSet.add(identity.email);
      if (identity.phone) phoneSet.add(identity.phone);
    });

    const emails = Array.from(emailSet);
    const phones = Array.from(phoneSet);
    if (emails.length === 0 && phones.length === 0) return [];

    const identityFilters = [];
    if (emails.length > 0) identityFilters.push(inArray(customerIdentities.email, emails));
    if (phones.length > 0) identityFilters.push(inArray(customerIdentities.phone, phones));

    const customerFilters = [];
    if (emails.length > 0) customerFilters.push(inArray(customers.primaryEmail, emails));
    if (phones.length > 0) customerFilters.push(inArray(customers.primaryPhone, phones));

    const identityMatches = identityFilters.length
      ? await db
          .select({
            customerId: customerIdentities.customerId,
            email: customerIdentities.email,
            phone: customerIdentities.phone,
          })
          .from(customerIdentities)
          .where(and(ne(customerIdentities.customerId, customerId), or(...identityFilters)))
      : [];

    const customerMatches = customerFilters.length
      ? await db
          .select({
            id: customers.id,
            primaryEmail: customers.primaryEmail,
            primaryPhone: customers.primaryPhone,
          })
          .from(customers)
          .where(and(ne(customers.id, customerId), or(...customerFilters)))
      : [];

    const candidateIds = new Set<number>();
    identityMatches.forEach((match) => {
      if (match.customerId) candidateIds.add(match.customerId);
    });
    customerMatches.forEach((match) => candidateIds.add(match.id));

    if (candidateIds.size === 0) return [];

    const candidates = await db.query.customers.findMany({
      where: inArray(customers.id, Array.from(candidateIds)),
    });

    const matchedOnMap = new Map<number, Set<'email' | 'phone'>>();
    identityMatches.forEach((match) => {
      if (!match.customerId) return;
      const entry = matchedOnMap.get(match.customerId) ?? new Set<'email' | 'phone'>();
      if (match.email && emailSet.has(match.email)) entry.add('email');
      if (match.phone && phoneSet.has(match.phone)) entry.add('phone');
      matchedOnMap.set(match.customerId, entry);
    });
    customerMatches.forEach((match) => {
      const entry = matchedOnMap.get(match.id) ?? new Set<'email' | 'phone'>();
      if (match.primaryEmail && emailSet.has(match.primaryEmail)) entry.add('email');
      if (match.primaryPhone && phoneSet.has(match.primaryPhone)) entry.add('phone');
      matchedOnMap.set(match.id, entry);
    });

    return candidates.map((candidate) => ({
      id: candidate.id,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      company: candidate.company,
      matchedOn: Array.from(matchedOnMap.get(candidate.id) ?? []),
    }));
  }

  async mergeCustomers(primaryCustomerId: number, mergeCustomerIds: number[]) {
    const uniqueMergeIds = Array.from(new Set(mergeCustomerIds)).filter((id) => id !== primaryCustomerId);
    if (uniqueMergeIds.length === 0) {
      return { mergedCount: 0 };
    }

    return db.transaction(async (tx) => {
      await tx.update(customerIdentities)
        .set({ customerId: primaryCustomerId })
        .where(inArray(customerIdentities.customerId, uniqueMergeIds));

      await tx.update(contacts)
        .set({ customerId: primaryCustomerId })
        .where(inArray(contacts.customerId, uniqueMergeIds));

      await tx.update(orders)
        .set({ customerId: primaryCustomerId })
        .where(inArray(orders.customerId, uniqueMergeIds));

      await tx.update(tickets)
        .set({ customerId: primaryCustomerId })
        .where(inArray(tickets.customerId, uniqueMergeIds));

      await tx.update(interactions)
        .set({ customerId: primaryCustomerId })
        .where(inArray(interactions.customerId, uniqueMergeIds));

      await tx.update(opportunities)
        .set({ customerId: primaryCustomerId })
        .where(inArray(opportunities.customerId, uniqueMergeIds));

      await tx.update(calls)
        .set({ customerId: primaryCustomerId })
        .where(inArray(calls.customerId, uniqueMergeIds));

      await tx.update(crmTasks)
        .set({ customerId: primaryCustomerId })
        .where(inArray(crmTasks.customerId, uniqueMergeIds));

      await tx.update(qboInvoices)
        .set({ customerId: primaryCustomerId })
        .where(inArray(qboInvoices.customerId, uniqueMergeIds));

      await tx.update(qboEstimates)
        .set({ customerId: primaryCustomerId })
        .where(inArray(qboEstimates.customerId, uniqueMergeIds));

      await tx.update(shipstationShipments)
        .set({ customerId: primaryCustomerId })
        .where(inArray(shipstationShipments.customerId, uniqueMergeIds));

      await tx.update(shipments)
        .set({ customerId: primaryCustomerId })
        .where(inArray(shipments.customerId, uniqueMergeIds));

      await tx.update(ragSources)
        .set({ customerId: primaryCustomerId })
        .where(inArray(ragSources.customerId, uniqueMergeIds));

      const primarySnapshot = await tx.query.qboCustomerSnapshots.findFirst({
        where: eq(qboCustomerSnapshots.customerId, primaryCustomerId),
      });
      if (!primarySnapshot) {
        await tx.update(qboCustomerSnapshots)
          .set({ customerId: primaryCustomerId })
          .where(inArray(qboCustomerSnapshots.customerId, uniqueMergeIds));
      } else {
        await tx.delete(qboCustomerSnapshots)
          .where(inArray(qboCustomerSnapshots.customerId, uniqueMergeIds));
      }

      const primaryScores = await tx.query.customerScores.findFirst({
        where: eq(customerScores.customerId, primaryCustomerId),
      });
      if (!primaryScores) {
        await tx.update(customerScores)
          .set({ customerId: primaryCustomerId })
          .where(inArray(customerScores.customerId, uniqueMergeIds));
      } else {
        await tx.delete(customerScores)
          .where(inArray(customerScores.customerId, uniqueMergeIds));
      }

      await tx.delete(customers).where(inArray(customers.id, uniqueMergeIds));

      return { mergedCount: uniqueMergeIds.length };
    });
  }
}

export const customerRepository = new CustomerRepository();
