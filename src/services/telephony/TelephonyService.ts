import { db, calls, contacts, customers, customerIdentities, interactions, interactionDirectionEnum } from '@/lib/db';
import { and, desc, eq, like, or } from 'drizzle-orm';
import { identityUtils } from '@/services/crm/identityService';

export interface PhoneMatch {
  customerId: number;
  contactId?: number | null;
  customerName: string | null;
  contactName?: string | null;
  customerPhone?: string | null;
  contactPhone?: string | null;
}

const normalize = (phone: string | null | undefined) => identityUtils.normalizePhone(phone);

export async function findCustomerAndContactByPhone(phone: string): Promise<PhoneMatch[]> {
  const normalized = normalize(phone);
  if (!normalized) return [];
  const likePattern = `%${normalized}%`;

  const contactRows = await db.query.contacts.findMany({
    where: or(
      eq(contacts.phone, normalized),
      like(contacts.phone, likePattern)
    ),
    with: {
      customer: true,
    },
    limit: 20,
  });

  const customerRows = await db.query.customers.findMany({
    where: or(
      eq(customers.primaryPhone, normalized),
      like(customers.primaryPhone, likePattern)
    ),
    limit: 20,
  });

  const identityRows = await db.query.customerIdentities.findMany({
    where: or(
      eq(customerIdentities.phone, normalized),
      like(customerIdentities.phone, likePattern)
    ),
    with: { customer: true },
    limit: 20,
  });

  const matches: PhoneMatch[] = [];

  contactRows.forEach((c) => {
    matches.push({
      customerId: c.customerId,
      contactId: c.id,
      customerName: [c.customer?.firstName, c.customer?.lastName].filter(Boolean).join(' ') || c.customer?.company || null,
      contactName: c.name,
      customerPhone: c.customer?.primaryPhone || null,
      contactPhone: c.phone || null,
    });
  });

  customerRows.forEach((c) => {
    matches.push({
      customerId: c.id,
      customerName: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || null,
      customerPhone: c.primaryPhone || null,
    });
  });

  identityRows.forEach((i) => {
    if (!i.customer) return;
    matches.push({
      customerId: i.customerId,
      customerName: [i.customer.firstName, i.customer.lastName].filter(Boolean).join(' ') || i.customer.company || null,
      customerPhone: i.customer.primaryPhone || null,
    });
  });

  // Deduplicate by customerId then prefer contact match
  const deduped = new Map<number, PhoneMatch>();
  matches.forEach((m) => {
    if (!deduped.has(m.customerId)) {
      deduped.set(m.customerId, m);
    } else if (m.contactId && !deduped.get(m.customerId)?.contactId) {
      deduped.set(m.customerId, m);
    }
  });

  return Array.from(deduped.values());
}

export interface RecordCallStartedParams {
  provider: string;
  providerCallId?: string | null;
  direction: typeof interactionDirectionEnum.enumValues[number];
  fromNumber: string;
  toNumber: string;
  startedAt: Date;
  ticketId?: number | null;
  opportunityId?: number | null;
}

export async function recordCallStarted(params: RecordCallStartedParams) {
  const searchNumber = params.direction === 'inbound' ? params.fromNumber : params.toNumber;
  const matches = await findCustomerAndContactByPhone(searchNumber);
  const primaryMatch = matches[0];

  const [call] = await db.insert(calls).values({
    provider: params.provider,
    providerCallId: params.providerCallId || null,
    direction: params.direction,
    fromNumber: params.fromNumber,
    toNumber: params.toNumber,
    startedAt: params.startedAt,
    customerId: primaryMatch?.customerId ?? null,
    contactId: primaryMatch?.contactId ?? null,
    ticketId: params.ticketId ?? null,
    opportunityId: params.opportunityId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing({
    target: [calls.provider, calls.providerCallId],
  }).returning();

  if (call && call.customerId) {
    await db.insert(interactions).values({
      customerId: call.customerId,
      ticketId: call.ticketId ?? null,
      commentId: null,
      channel: 'telephony',
      direction: call.direction,
      occurredAt: call.startedAt,
      metadata: {
        callId: call.id,
        providerCallId: call.providerCallId,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
      },
      createdAt: new Date(),
    });
  }

  return call;
}

export interface RecordCallEndedParams {
  callId?: number;
  provider?: string;
  providerCallId?: string | null;
  endedAt: Date;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
}

export async function recordCallEnded(params: RecordCallEndedParams) {
  let call = null;
  if (params.callId) {
    call = await db.query.calls.findFirst({ where: eq(calls.id, params.callId) });
  }
  if (!call && params.providerCallId) {
    const whereClauses = [eq(calls.providerCallId, params.providerCallId)];
    if (params.provider) {
      whereClauses.push(eq(calls.provider, params.provider));
    }
    call = await db.query.calls.findFirst({
      where: and(...whereClauses),
    });
  }
  if (!call) return null;

  const [updated] = await db.update(calls)
    .set({
      endedAt: params.endedAt,
      durationSeconds: params.durationSeconds ?? call.durationSeconds,
      recordingUrl: params.recordingUrl ?? call.recordingUrl,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, call.id))
    .returning();

  return updated;
}
