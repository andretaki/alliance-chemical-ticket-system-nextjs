import { db, customers, customerIdentities, interactions } from '@/lib/db';
import { eq, or, and } from 'drizzle-orm';
import type { providerEnum } from '@/lib/db';

export type Provider = typeof providerEnum.enumValues[number];

export interface IdentityInput {
  provider: Provider;
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  metadata?: Record<string, unknown>;
}

export interface InteractionInput {
  customerId: number;
  ticketId?: number | null;
  commentId?: number | null;
  channel: string;
  direction?: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
}

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || null;
const normalizePhone = (phone?: string | null) => phone ? phone.replace(/[^\d+]/g, '') : null;

class IdentityService {
  async resolveOrCreateCustomer(input: IdentityInput) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);

    // 1) Try provider + external id
    if (input.externalId) {
      const existingByExternal = await db.query.customerIdentities.findFirst({
        where: and(
          eq(customerIdentities.provider, input.provider),
          eq(customerIdentities.externalId, input.externalId)
        ),
        with: { customer: true },
      });
      if (existingByExternal?.customer) {
        return existingByExternal.customer;
      }
    }

    // 2) Try email/phone matches on identities or primary fields
    if (email || phone) {
      const identityMatches = [];
      if (email) identityMatches.push(eq(customerIdentities.email, email));
      if (phone) identityMatches.push(eq(customerIdentities.phone, phone));

      if (identityMatches.length > 0) {
        const existingByEmailOrPhone = await db.query.customerIdentities.findFirst({
          where: or(...identityMatches),
          with: { customer: true },
        });
        if (existingByEmailOrPhone?.customer) {
          return existingByEmailOrPhone.customer;
        }
      }

      const customerMatches = [];
      if (email) customerMatches.push(eq(customers.primaryEmail, email));
      if (phone) customerMatches.push(eq(customers.primaryPhone, phone));

      if (customerMatches.length > 0) {
        const existingCustomer = await db.query.customers.findFirst({
          where: or(...customerMatches),
        });
        if (existingCustomer) {
          return existingCustomer;
        }
      }
    }

    // 3) Create new customer + identity
    const [newCustomer] = await db.insert(customers).values({
      primaryEmail: email,
      primaryPhone: phone,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      company: input.company || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await this.addIdentity(newCustomer.id, { ...input, email, phone });

    return newCustomer;
  }

  async addIdentity(customerId: number, identity: IdentityInput) {
    const email = normalizeEmail(identity.email);
    const phone = normalizePhone(identity.phone);

    // Upsert-like behavior: if identity exists, update metadata/email/phone
    const existing = identity.externalId ? await db.query.customerIdentities.findFirst({
      where: and(
        eq(customerIdentities.provider, identity.provider),
        eq(customerIdentities.externalId, identity.externalId)
      ),
    }) : null;

    if (existing) {
      await db.update(customerIdentities).set({
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        metadata: identity.metadata ?? existing.metadata,
        updatedAt: new Date(),
      }).where(eq(customerIdentities.id, existing.id));
      return existing;
    }

    return db.insert(customerIdentities).values({
      customerId,
      provider: identity.provider,
      externalId: identity.externalId || null,
      email,
      phone,
      metadata: identity.metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
  }

  async recordInteraction(input: InteractionInput) {
    return db.insert(interactions).values({
      customerId: input.customerId,
      ticketId: input.ticketId ?? null,
      commentId: input.commentId ?? null,
      channel: input.channel as any,
      direction: (input.direction || 'inbound') as any,
      metadata: input.metadata || null,
      occurredAt: new Date(),
      createdAt: new Date(),
    }).returning();
  }
}

export const identityService = new IdentityService();
export const identityUtils = { normalizeEmail, normalizePhone };
