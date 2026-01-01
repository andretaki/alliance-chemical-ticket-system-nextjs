import { db, opportunities, customers, contacts, users, opportunityStageEnum } from '@/lib/db';
import { and, desc, eq, ilike, inArray } from 'drizzle-orm';

export type OpportunityStage = (typeof opportunityStageEnum.enumValues)[number];

export interface OpportunityInput {
  customerId: number;
  contactId?: number | null;
  title: string;
  description?: string | null;
  stage?: OpportunityStage;
  source?: string | null;
  division?: string | null;
  estimatedValue?: string | null;
  currency?: string;
  ownerId?: string | null;
  shopifyDraftOrderId?: string | null;
  qboEstimateId?: string | null;
  lostReason?: string | null;
}

export interface OpportunityUpdateInput extends Partial<OpportunityInput> {}

const setClosedAt = (stage?: OpportunityStage | null) =>
  stage === 'won' || stage === 'lost';

export async function createOpportunity(input: OpportunityInput) {
  const now = new Date();
  const stage: OpportunityStage = input.stage || 'lead';

  const [row] = await db.insert(opportunities).values({
    customerId: input.customerId,
    contactId: input.contactId ?? null,
    title: input.title,
    description: input.description ?? null,
    stage,
    source: input.source || null,
    division: input.division || null,
    estimatedValue: input.estimatedValue ?? null,
    currency: input.currency || 'USD',
    ownerId: input.ownerId ?? null,
    shopifyDraftOrderId: input.shopifyDraftOrderId ?? null,
    qboEstimateId: input.qboEstimateId ?? null,
    closedAt: setClosedAt(stage) ? now : null,
    lostReason: input.lostReason ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return row;
}

export async function updateOpportunity(id: number, updates: OpportunityUpdateInput) {
  const now = new Date();
  const existing = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
  if (!existing) throw new Error('Opportunity not found');

  const nextStage = updates.stage || existing.stage;
  const stageChanged = nextStage !== existing.stage;
  const closedAt = setClosedAt(nextStage)
    ? (existing.closedAt || now)
    : null;

  const [row] = await db.update(opportunities)
    .set({
      title: updates.title ?? existing.title,
      description: updates.description !== undefined ? updates.description : existing.description,
      stage: nextStage,
      stageChangedAt: stageChanged ? now : existing.stageChangedAt,
      source: updates.source !== undefined ? updates.source : existing.source,
      division: updates.division !== undefined ? updates.division : existing.division,
      estimatedValue: updates.estimatedValue !== undefined ? updates.estimatedValue : existing.estimatedValue,
      currency: updates.currency ?? existing.currency,
      ownerId: updates.ownerId !== undefined ? updates.ownerId : existing.ownerId,
      contactId: updates.contactId !== undefined ? updates.contactId : existing.contactId,
      shopifyDraftOrderId: updates.shopifyDraftOrderId !== undefined ? updates.shopifyDraftOrderId : existing.shopifyDraftOrderId,
      qboEstimateId: updates.qboEstimateId !== undefined ? updates.qboEstimateId : existing.qboEstimateId,
      lostReason: updates.lostReason !== undefined ? updates.lostReason : existing.lostReason,
      closedAt,
      updatedAt: now,
    })
    .where(eq(opportunities.id, id))
    .returning();

  return row;
}

export interface OpportunityListFilter {
  stage?: string;
  ownerId?: string;
  division?: string;
  customerId?: number;
  search?: string;
}

export async function listOpportunities(filter: OpportunityListFilter = {}) {
  const where = [];

  if (filter.stage) {
    const stages = filter.stage.split(',').map(s => s.trim()).filter(Boolean) as OpportunityStage[];
    if (stages.length) where.push(inArray(opportunities.stage, stages));
  }

  if (filter.ownerId) where.push(eq(opportunities.ownerId, filter.ownerId));
  if (filter.division) where.push(eq(opportunities.division, filter.division));
  if (filter.customerId) where.push(eq(opportunities.customerId, filter.customerId));
  if (filter.search) {
    const term = `%${filter.search.toLowerCase()}%`;
    where.push(ilike(opportunities.title, term));
  }

  const rows = await db.select({
    id: opportunities.id,
    title: opportunities.title,
    stage: opportunities.stage,
    source: opportunities.source,
    division: opportunities.division,
    estimatedValue: opportunities.estimatedValue,
    currency: opportunities.currency,
    ownerId: opportunities.ownerId,
    shopifyDraftOrderId: opportunities.shopifyDraftOrderId,
    qboEstimateId: opportunities.qboEstimateId,
    closedAt: opportunities.closedAt,
    createdAt: opportunities.createdAt,
    updatedAt: opportunities.updatedAt,
    stageChangedAt: opportunities.stageChangedAt,
    customerId: opportunities.customerId,
    contactId: opportunities.contactId,
    lostReason: opportunities.lostReason,
    customerName: customers.company,
    customerEmail: customers.primaryEmail,
    contactName: contacts.name,
    ownerName: users.name,
  })
    .from(opportunities)
    .leftJoin(customers, eq(customers.id, opportunities.customerId))
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(opportunities.createdAt));

  return rows;
}

export async function getOpportunityById(id: number) {
  const row = await db.select({
    id: opportunities.id,
    title: opportunities.title,
    description: opportunities.description,
    stage: opportunities.stage,
    source: opportunities.source,
    division: opportunities.division,
    estimatedValue: opportunities.estimatedValue,
    currency: opportunities.currency,
    ownerId: opportunities.ownerId,
    shopifyDraftOrderId: opportunities.shopifyDraftOrderId,
    qboEstimateId: opportunities.qboEstimateId,
    closedAt: opportunities.closedAt,
    createdAt: opportunities.createdAt,
    updatedAt: opportunities.updatedAt,
    stageChangedAt: opportunities.stageChangedAt,
    customerId: opportunities.customerId,
    contactId: opportunities.contactId,
    lostReason: opportunities.lostReason,
    customerName: customers.company,
    customerEmail: customers.primaryEmail,
    customerPhone: customers.primaryPhone,
    contactName: contacts.name,
    contactEmail: contacts.email,
    contactPhone: contacts.phone,
    ownerName: users.name,
    ownerEmail: users.email,
  })
    .from(opportunities)
    .leftJoin(customers, eq(customers.id, opportunities.customerId))
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(eq(opportunities.id, id))
    .limit(1);

  return row[0] || null;
}
