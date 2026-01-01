import crypto from 'crypto';
import { and, desc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { db, contacts, customerIdentities, customers, interactions, orders, orderItems, qboCustomerSnapshots, qboEstimates, qboInvoices, ragChunks, ragIngestionJobs, ragSources, shipments, shipstationShipments, ticketComments, tickets } from '@/lib/db';
import { integrations } from '@/lib/env';
import { graphClient, getUserEmail } from '@/lib/graphService';
import { chunkTextAdaptive, estimateTokens } from './ragChunking';
import { embedTexts } from './ragEmbedding';
import {
  extractAmazonShipmentSource,
  extractEmailSource,
  extractInteractionSource,
  extractOrderSource,
  extractQboCustomerSource,
  extractQboEstimateSource,
  extractQboInvoiceSource,
  extractShipstationShipmentSource,
  extractShopifyCustomerSource,
  extractTicketCommentSource,
  extractTicketSource,
  type RagSourceInput,
} from './ragExtractors';
import type { RagIngestionOperation, RagSourceType } from './ragTypes';
import { RAG_MAX_JOB_ATTEMPTS } from './ragConfig';
import { identityUtils } from '@/services/crm/identityService';
import { logError, logInfo, logWarn } from '@/utils/logger';

const BASE_BACKOFF_MS = 60 * 1000;

function hashText(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function resolveCustomerIdForEmails(emails: Array<string | null | undefined>): Promise<number | null> {
  const normalized = emails
    .map((email) => identityUtils.normalizeEmail(email || undefined))
    .filter(Boolean) as string[];
  if (!normalized.length) return null;

  const unique = Array.from(new Set(normalized));
  const [identityRows, contactRows, customerRows] = await Promise.all([
    db.select({ email: customerIdentities.email, customerId: customerIdentities.customerId })
      .from(customerIdentities)
      .where(inArray(customerIdentities.email, unique)),
    db.select({ email: contacts.email, customerId: contacts.customerId })
      .from(contacts)
      .where(inArray(contacts.email, unique)),
    db.select({ email: customers.primaryEmail, customerId: customers.id })
      .from(customers)
      .where(inArray(customers.primaryEmail, unique)),
  ]);

  const map = new Map<string, number>();
  identityRows.forEach((row) => {
    if (row.email && !map.has(row.email)) map.set(row.email, row.customerId);
  });
  contactRows.forEach((row) => {
    if (row.email && !map.has(row.email)) map.set(row.email, row.customerId);
  });
  customerRows.forEach((row) => {
    if (row.email && !map.has(row.email)) map.set(row.email, row.customerId);
  });

  for (const email of normalized) {
    const customerId = map.get(email);
    if (customerId) return customerId;
  }

  return null;
}

async function fetchExistingEmbeddings(chunkHashes: string[]): Promise<Map<string, number[]>> {
  if (!chunkHashes.length) return new Map();
  const rows = await db
    .select({ chunkHash: ragChunks.chunkHash, embedding: ragChunks.embedding })
    .from(ragChunks)
    .where(inArray(ragChunks.chunkHash, chunkHashes));

  const map = new Map<string, number[]>();
  rows.forEach((row) => {
    if (row.embedding && !map.has(row.chunkHash)) {
      map.set(row.chunkHash, row.embedding as number[]);
    }
  });
  return map;
}

async function buildChunks(sourceType: RagSourceType, contentText: string) {
  const chunks = chunkTextAdaptive(sourceType, contentText);
  return chunks.map((chunkText, index) => ({
    chunkText,
    chunkIndex: index,
    chunkCount: chunks.length,
    chunkHash: hashText(chunkText),
    tokenCount: estimateTokens(chunkText),
  }));
}

async function upsertSourceWithChunks(input: RagSourceInput, operation: RagIngestionOperation) {
  const contentHash = hashText(input.contentText);

  const existing = await db.query.ragSources.findFirst({
    where: and(eq(ragSources.sourceType, input.sourceType), eq(ragSources.sourceId, input.sourceId)),
  });

  const [saved] = await db.insert(ragSources).values({
    id: existing?.id ?? crypto.randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceUri: input.sourceUri,
    customerId: input.customerId ?? null,
    ticketId: input.ticketId ?? null,
    threadId: input.threadId ?? null,
    parentId: input.parentId ?? null,
    sensitivity: input.sensitivity,
    ownerUserId: input.ownerUserId ?? null,
    title: input.title ?? null,
    contentText: input.contentText,
    contentHash,
    metadata: input.metadata,
    sourceCreatedAt: input.sourceCreatedAt,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    indexedAt: new Date(),
    reindexedAt: operation === 'reindex' ? new Date() : existing?.reindexedAt ?? null,
  }).onConflictDoUpdate({
    target: [ragSources.sourceType, ragSources.sourceId],
    set: {
      sourceUri: input.sourceUri,
      customerId: input.customerId ?? null,
      ticketId: input.ticketId ?? null,
      threadId: input.threadId ?? null,
      parentId: input.parentId ?? null,
      sensitivity: input.sensitivity,
      ownerUserId: input.ownerUserId ?? null,
      title: input.title ?? null,
      contentText: input.contentText,
      contentHash,
      metadata: input.metadata,
      sourceCreatedAt: input.sourceCreatedAt,
      sourceUpdatedAt: input.sourceUpdatedAt ?? null,
      indexedAt: new Date(),
      reindexedAt: operation === 'reindex' ? new Date() : existing?.reindexedAt ?? null,
    },
  }).returning();

  const contentChanged = !existing || existing.contentHash !== contentHash || operation === 'reindex';
  if (!contentChanged) {
    return { status: 'completed', sourceId: saved.id, chunkCount: 0 } as const;
  }

  await db.delete(ragChunks).where(eq(ragChunks.sourceId, saved.id));
  const chunkRows = await buildChunks(input.sourceType, input.contentText);
  if (!chunkRows.length) {
    return { status: 'completed', sourceId: saved.id, chunkCount: 0 } as const;
  }

  const existingEmbeddings = await fetchExistingEmbeddings(chunkRows.map((chunk) => chunk.chunkHash));
  const toEmbed = chunkRows.filter((chunk) => !existingEmbeddings.has(chunk.chunkHash));
  const embeddings = toEmbed.length ? await embedTexts(toEmbed.map((chunk) => chunk.chunkText)) : [];
  const embeddingMap = new Map(existingEmbeddings);
  toEmbed.forEach((chunk, index) => {
    embeddingMap.set(chunk.chunkHash, embeddings[index]);
  });

  const now = new Date();
  const inserts = chunkRows.map((chunk) => ({
    id: crypto.randomUUID(),
    sourceId: saved.id,
    chunkIndex: chunk.chunkIndex,
    chunkCount: chunk.chunkCount,
    chunkText: chunk.chunkText,
    chunkHash: chunk.chunkHash,
    tokenCount: chunk.tokenCount,
    embedding: embeddingMap.get(chunk.chunkHash) ?? null,
    embeddedAt: embeddingMap.get(chunk.chunkHash) ? now : null,
  }));

  const batchSize = 200;
  for (let i = 0; i < inserts.length; i += batchSize) {
    await db.insert(ragChunks).values(inserts.slice(i, i + batchSize));
  }

  return { status: 'completed', sourceId: saved.id, chunkCount: inserts.length } as const;
}

async function fetchTicketSource(sourceId: string) {
  const ticketId = Number(sourceId);
  if (Number.isNaN(ticketId)) return null;
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) return null;
  return extractTicketSource({ ticket });
}

async function fetchTicketCommentSource(sourceId: string) {
  const commentId = Number(sourceId);
  if (Number.isNaN(commentId)) return null;
  const comment = await db.query.ticketComments.findFirst({ where: eq(ticketComments.id, commentId) });
  if (!comment) return null;
  const ticket = comment.ticketId ? await db.query.tickets.findFirst({
    where: eq(tickets.id, comment.ticketId),
    columns: { conversationId: true, customerId: true },
  }) ?? null : null;

  return extractTicketCommentSource({ comment, ticket });
}

async function fetchInteractionSource(sourceId: string) {
  const interactionId = Number(sourceId);
  if (Number.isNaN(interactionId)) return null;
  const interaction = await db.query.interactions.findFirst({ where: eq(interactions.id, interactionId) });
  if (!interaction) return null;
  // Cast metadata to expected type
  const typedInteraction = {
    ...interaction,
    metadata: interaction.metadata as Record<string, unknown> | null,
  };
  return extractInteractionSource({ interaction: typedInteraction });
}

async function fetchOrderSource(sourceType: RagSourceType, sourceId: string) {
  const numericId = Number(sourceId);
  const order = await db.query.orders.findFirst({
    where: or(
      eq(orders.externalId, sourceId),
      Number.isNaN(numericId) ? sql`FALSE` : eq(orders.id, numericId),
      eq(orders.orderNumber, sourceId)
    ),
    with: {
      items: true,
      customer: true,
    },
  });
  if (!order) return null;
  // Cast metadata to expected type
  const typedOrder = {
    ...order,
    metadata: order.metadata as Record<string, any> | null,
  };
  return extractOrderSource({ order: typedOrder, items: order.items || [], customer: order.customer });
}

async function fetchQboInvoiceSource(sourceId: string) {
  const invoice = await db.query.qboInvoices.findFirst({ where: eq(qboInvoices.qboInvoiceId, sourceId) });
  if (!invoice) return null;
  const customer = invoice.customerId
    ? await db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId) })
    : null;
  const snapshot = invoice.customerId
    ? await db.query.qboCustomerSnapshots.findFirst({ where: eq(qboCustomerSnapshots.customerId, invoice.customerId) })
    : null;

  return extractQboInvoiceSource({
    invoice: {
      qboInvoiceId: invoice.qboInvoiceId,
      qboCustomerId: invoice.qboCustomerId,
      docNumber: invoice.docNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      balance: invoice.balance,
      currency: invoice.currency,
      txnDate: invoice.txnDate,
      dueDate: invoice.dueDate,
      metadata: invoice.metadata as Record<string, unknown> | null,
      customerId: invoice.customerId ?? null,
    },
    customerName: customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company || null : null,
    terms: snapshot?.terms ?? null,
  });
}

async function fetchQboEstimateSource(sourceId: string) {
  const estimate = await db.query.qboEstimates.findFirst({ where: eq(qboEstimates.qboEstimateId, sourceId) });
  if (!estimate) return null;
  const customer = estimate.customerId
    ? await db.query.customers.findFirst({ where: eq(customers.id, estimate.customerId) })
    : null;

  return extractQboEstimateSource({
    estimate: {
      qboEstimateId: estimate.qboEstimateId,
      qboCustomerId: estimate.qboCustomerId,
      docNumber: estimate.docNumber,
      status: estimate.status,
      totalAmount: estimate.totalAmount,
      currency: estimate.currency,
      txnDate: estimate.txnDate,
      expirationDate: estimate.expirationDate,
      metadata: estimate.metadata as Record<string, unknown> | null,
      customerId: estimate.customerId ?? null,
    },
    customerName: customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company || null : null,
  });
}

async function fetchQboCustomerSource(sourceId: string) {
  const snapshot = await db.query.qboCustomerSnapshots.findFirst({ where: eq(qboCustomerSnapshots.qboCustomerId, sourceId) });
  if (!snapshot) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, snapshot.customerId) });
  const customerName = customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company || null : null;
  return extractQboCustomerSource({
    snapshot: {
      qboCustomerId: snapshot.qboCustomerId,
      balance: snapshot.balance,
      currency: snapshot.currency,
      terms: snapshot.terms,
      lastInvoiceDate: snapshot.lastInvoiceDate,
      lastPaymentDate: snapshot.lastPaymentDate,
      snapshotTakenAt: snapshot.snapshotTakenAt,
      customerId: snapshot.customerId,
    },
    customerName,
  });
}

async function fetchShopifyCustomerSource(sourceId: string) {
  const identity = await db.query.customerIdentities.findFirst({
    where: and(eq(customerIdentities.provider, 'shopify'), eq(customerIdentities.externalId, sourceId)),
  });
  if (!identity) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, identity.customerId) });
  if (!customer) return null;
  return extractShopifyCustomerSource({
    identity: { externalId: identity.externalId, email: identity.email, phone: identity.phone },
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      primaryEmail: customer.primaryEmail,
      primaryPhone: customer.primaryPhone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    },
  });
}

async function fetchShipstationShipmentSource(sourceId: string) {
  const shipmentId = Number(sourceId);
  if (Number.isNaN(shipmentId)) return null;
  const shipment = await db.query.shipstationShipments.findFirst({
    where: eq(shipstationShipments.shipstationShipmentId, BigInt(shipmentId)),
  });
  if (!shipment) return null;
  return extractShipstationShipmentSource({
    shipment: {
      shipstationShipmentId: shipment.shipstationShipmentId,
      shipstationOrderId: shipment.shipstationOrderId,
      orderNumber: shipment.orderNumber,
      trackingNumber: shipment.trackingNumber,
      carrierCode: shipment.carrierCode,
      serviceCode: shipment.serviceCode,
      shipDate: shipment.shipDate,
      deliveryDate: shipment.deliveryDate,
      status: shipment.status,
      cost: shipment.cost,
      weight: shipment.weight,
      weightUnit: shipment.weightUnit,
      metadata: shipment.metadata as Record<string, unknown> | null,
      customerId: shipment.customerId,
    },
  });
}

async function fetchAmazonShipmentSource(sourceId: string) {
  const shipment = await db.query.shipments.findFirst({
    where: and(
      eq(shipments.externalId, sourceId),
      inArray(shipments.provider, ['amazon_fba', 'amazon_mfn'])
    ),
  });
  if (!shipment) return null;
  return extractAmazonShipmentSource({
    shipment: {
      id: shipment.id,
      externalId: shipment.externalId,
      orderId: shipment.orderId,
      orderNumber: shipment.orderNumber,
      trackingNumber: shipment.trackingNumber,
      carrierCode: shipment.carrierCode,
      serviceCode: shipment.serviceCode,
      shipDate: shipment.shipDate,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate,
      actualDeliveryDate: shipment.actualDeliveryDate,
      status: shipment.status,
      cost: shipment.cost,
      weight: shipment.weight,
      weightUnit: shipment.weightUnit,
      metadata: shipment.metadata as Record<string, unknown> | null,
      customerId: shipment.customerId,
      provider: shipment.provider,
    },
  });
}

async function fetchEmailSource(sourceId: string) {
  if (!integrations.microsoftGraph) return null;
  const mailbox = getUserEmail();
  const message = await graphClient
    .api(`/users/${mailbox}/messages/${sourceId}`)
    .select('id,subject,body,bodyPreview,from,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,conversationId,internetMessageId,inReplyTo,webLink')
    .get();

  const fromEmail = message?.from?.emailAddress?.address || message?.sender?.emailAddress?.address || null;
  const toEmails = (message?.toRecipients || []).map((r: any) => r?.emailAddress?.address).filter(Boolean);
  const ccEmails = (message?.ccRecipients || []).map((r: any) => r?.emailAddress?.address).filter(Boolean);
  const customerId = await resolveCustomerIdForEmails([fromEmail, ...toEmails, ...ccEmails]);
  return extractEmailSource({ message, customerId });
}

async function resolveParentId(input: RagSourceInput): Promise<string | null> {
  if (input.sourceType === 'ticket_comment' && input.threadId) {
    const parent = await db.query.ragSources.findFirst({
      where: and(eq(ragSources.threadId, input.threadId), lt(ragSources.sourceCreatedAt, input.sourceCreatedAt)),
      orderBy: [desc(ragSources.sourceCreatedAt)],
    });
    return parent?.id ?? null;
  }

  if (input.sourceType === 'email') {
    const inReplyTo = typeof input.metadata?.inReplyTo === 'string' ? input.metadata.inReplyTo : null;
    if (!inReplyTo) return null;
    const parent = await db.query.ragSources.findFirst({
      where: sql`${ragSources.metadata}->>'internetMessageId' = ${inReplyTo}`,
    });
    return parent?.id ?? null;
  }

  return null;
}

async function buildSourceForJob(job: { sourceType: RagSourceType; sourceId: string }): Promise<RagSourceInput | null> {
  switch (job.sourceType) {
    case 'ticket':
      return fetchTicketSource(job.sourceId);
    case 'ticket_comment':
      return fetchTicketCommentSource(job.sourceId);
    case 'interaction':
      return fetchInteractionSource(job.sourceId);
    case 'shopify_order':
    case 'amazon_order':
    case 'order':
      return fetchOrderSource(job.sourceType, job.sourceId);
    case 'qbo_invoice':
      return fetchQboInvoiceSource(job.sourceId);
    case 'qbo_estimate':
      return fetchQboEstimateSource(job.sourceId);
    case 'qbo_customer':
      return fetchQboCustomerSource(job.sourceId);
    case 'shopify_customer':
      return fetchShopifyCustomerSource(job.sourceId);
    case 'shipstation_shipment':
      return fetchShipstationShipmentSource(job.sourceId);
    case 'amazon_shipment':
      return fetchAmazonShipmentSource(job.sourceId);
    case 'email':
      return fetchEmailSource(job.sourceId);
    default:
      return null;
  }
}

export async function enqueueRagJob(
  sourceType: RagSourceType,
  sourceId: string,
  operation: RagIngestionOperation = 'upsert',
  priority = 0
) {
  const existing = await db.query.ragIngestionJobs.findFirst({
    where: and(
      eq(ragIngestionJobs.sourceType, sourceType),
      eq(ragIngestionJobs.sourceId, sourceId),
      inArray(ragIngestionJobs.status, ['pending', 'processing'])
    ),
  });

  if (existing) {
    const opRank: Record<RagIngestionOperation, number> = { upsert: 0, reindex: 1, delete: 2 };
    const shouldUpgradeOperation =
      existing.status === 'pending' &&
      opRank[operation] > opRank[existing.operation as RagIngestionOperation];
    const shouldUpgradePriority = existing.status === 'pending' && priority > (existing.priority ?? 0);
    if (shouldUpgradeOperation || shouldUpgradePriority) {
      const [updated] = await db.update(ragIngestionJobs)
        .set({
          operation: shouldUpgradeOperation ? operation : existing.operation,
          priority: shouldUpgradePriority ? priority : existing.priority,
        })
        .where(eq(ragIngestionJobs.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  try {
    const [job] = await db.insert(ragIngestionJobs).values({
      id: crypto.randomUUID(),
      sourceType,
      sourceId,
      operation,
      status: 'pending',
      priority,
      attempts: 0,
      maxAttempts: RAG_MAX_JOB_ATTEMPTS,
      createdAt: new Date(),
    }).returning();

    return job;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      const fallback = await db.query.ragIngestionJobs.findFirst({
        where: and(
          eq(ragIngestionJobs.sourceType, sourceType),
          eq(ragIngestionJobs.sourceId, sourceId),
          inArray(ragIngestionJobs.status, ['pending', 'processing'])
        ),
      });
      if (fallback) return fallback;
    }
    throw error;
  }
}

export async function processRagIngestionBatch(limit = 25) {
  const now = new Date();
  const jobs = await db
    .select()
    .from(ragIngestionJobs)
    .where(
      or(
        eq(ragIngestionJobs.status, 'pending'),
        and(
          eq(ragIngestionJobs.status, 'failed'),
          lte(ragIngestionJobs.nextRetryAt, now),
          sql`${ragIngestionJobs.nextRetryAt} IS NOT NULL`
        )
      )
    )
    .orderBy(desc(ragIngestionJobs.priority), ragIngestionJobs.createdAt)
    .limit(limit);

  for (const job of jobs) {
    try {
      const [claimed] = await db.update(ragIngestionJobs)
        .set({
          status: 'processing',
          attempts: sql`${ragIngestionJobs.attempts} + 1`,
          startedAt: new Date(),
        })
        .where(
          and(
            eq(ragIngestionJobs.id, job.id),
            or(
              eq(ragIngestionJobs.status, 'pending'),
              and(
                eq(ragIngestionJobs.status, 'failed'),
                lte(ragIngestionJobs.nextRetryAt, now),
                sql`${ragIngestionJobs.nextRetryAt} IS NOT NULL`
              )
            )
          )
        )
        .returning();

      if (!claimed) {
        continue;
      }

      const operation = (claimed.operation ?? job.operation) as RagIngestionOperation;
      if (operation === 'delete') {
        await db.delete(ragSources).where(and(eq(ragSources.sourceType, job.sourceType), eq(ragSources.sourceId, job.sourceId)));
        await db.update(ragIngestionJobs)
          .set({ status: 'completed', completedAt: new Date(), nextRetryAt: null, errorMessage: null, errorCode: null })
          .where(eq(ragIngestionJobs.id, job.id));
        logInfo('rag.ingestion.deleted', {
          jobId: job.id,
          sourceType: job.sourceType,
          sourceId: job.sourceId,
        });
        continue;
      }

      const sourceInput = await buildSourceForJob({ sourceType: job.sourceType as RagSourceType, sourceId: job.sourceId });
      if (!sourceInput) {
        await db.update(ragIngestionJobs)
          .set({ status: 'skipped', errorMessage: 'Source not found', errorCode: 'source_not_found', completedAt: new Date() })
          .where(eq(ragIngestionJobs.id, job.id));
        logWarn('rag.ingestion.skipped', {
          jobId: job.id,
          sourceType: job.sourceType,
          sourceId: job.sourceId,
          errorCode: 'source_not_found',
        });
        continue;
      }

      const parentId = await resolveParentId(sourceInput);
      if (parentId) {
        sourceInput.parentId = parentId;
      }

      const result = await upsertSourceWithChunks(sourceInput, operation);

      await db.update(ragIngestionJobs)
        .set({
          status: result.status,
          completedAt: new Date(),
          resultSourceId: result.sourceId ?? null,
          resultChunkCount: result.chunkCount ?? null,
          nextRetryAt: null,
          errorMessage: null,
          errorCode: null,
        })
        .where(eq(ragIngestionJobs.id, job.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = (job.attempts || 0) + 1;
      const shouldRetry = attempts < (job.maxAttempts || RAG_MAX_JOB_ATTEMPTS);
      const backoff = BASE_BACKOFF_MS * Math.pow(2, Math.min(attempts, 6));
      const nextRetryAt = shouldRetry ? new Date(Date.now() + backoff) : null;
      const errorCode = shouldRetry ? 'retryable_error' : 'fatal_error';

      await db.update(ragIngestionJobs)
        .set({
          status: 'failed',
          errorMessage: message,
          errorCode,
          nextRetryAt,
          completedAt: shouldRetry ? null : new Date(),
        })
        .where(eq(ragIngestionJobs.id, job.id));

      const logPayload = {
        jobId: job.id,
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        attempts,
        maxAttempts: job.maxAttempts || RAG_MAX_JOB_ATTEMPTS,
        errorCode,
        errorMessage: message,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
        retryScheduled: shouldRetry,
      };
      if (shouldRetry) {
        logWarn('rag.ingestion.retry_scheduled', logPayload);
      } else {
        logError('rag.ingestion.failed', logPayload);
      }
    }
  }
}

export async function seedEmailRagJob(messageId: string) {
  return enqueueRagJob('email', messageId, 'upsert', 1);
}

export async function seedTicketRagJob(ticketId: number) {
  return enqueueRagJob('ticket', String(ticketId));
}

export async function seedTicketCommentRagJob(commentId: number) {
  return enqueueRagJob('ticket_comment', String(commentId));
}

export async function seedInteractionRagJob(interactionId: number) {
  return enqueueRagJob('interaction', String(interactionId));
}

export async function seedOrderRagJob(sourceType: RagSourceType, sourceId: string) {
  return enqueueRagJob(sourceType, sourceId);
}

export async function seedQboInvoiceJob(qboInvoiceId: string) {
  return enqueueRagJob('qbo_invoice', qboInvoiceId);
}

export async function seedQboEstimateJob(qboEstimateId: string) {
  return enqueueRagJob('qbo_estimate', qboEstimateId);
}

export async function seedQboCustomerJob(qboCustomerId: string) {
  return enqueueRagJob('qbo_customer', qboCustomerId);
}

export async function seedShopifyCustomerJob(shopifyCustomerId: string) {
  return enqueueRagJob('shopify_customer', shopifyCustomerId);
}

export async function seedShipstationShipmentJob(shipmentId: string) {
  return enqueueRagJob('shipstation_shipment', shipmentId);
}

export const __test = {
  upsertSourceWithChunks,
};
