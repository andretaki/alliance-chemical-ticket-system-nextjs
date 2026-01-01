import { db, tickets, crmTasks } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { outboxService } from '@/services/outboxService';
import { identityService } from '@/services/crm/identityService';
import type { OutboxJob } from '@/services/outboxService';
import { ticketStatusEnum, ticketTypeEcommerceEnum } from '@/lib/db';
import { users } from '@/db/schema';
import { logError, logInfo, logWarn } from '@/utils/logger';

const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

export async function processOutboxBatch(limit: number = 15) {
  const dueJobs = await outboxService.fetchDue(limit);

  for (const job of dueJobs) {
    try {
      await outboxService.markProcessing(job.id);
      await handleJob(job);
      await outboxService.markDone(job.id);
    } catch (err) {
      logError('outbox.job_failed', {
        jobId: job.id,
        topic: job.topic,
        error: err instanceof Error ? err.message : String(err),
      });
      const backoff = BASE_BACKOFF_MS * Math.min(job.attempts + 1, 6);
      await outboxService.markFailed(job.id, backoff);
    }
  }
}

async function handleJob(job: OutboxJob) {
  switch (job.topic) {
    case 'customer.sync':
      return handleCustomerSync(job);
    case 'ar.overdue-ticket':
      return handleArOverdueTicket(job);
    case 'draft-order.send-invoice':
      return handleDraftOrderInvoice(job);
    default:
      logWarn('outbox.unknown_topic', { topic: job.topic, jobId: job.id });
  }
}

async function handleCustomerSync(job: OutboxJob) {
  const payload = job.payload as {
    ticketId?: number;
    senderEmail?: string | null;
    senderPhone?: string | null;
    senderCompany?: string | null;
    reporterId?: string;
    title?: string;
  };

  if (!payload.ticketId) {
    logWarn('outbox.customer_sync_missing_ticket', { jobId: job.id });
    return;
  }

  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, payload.ticketId),
  });
  if (!ticket) return;

  const customer = await identityService.resolveOrCreateCustomer({
    provider: 'manual',
    email: payload.senderEmail || ticket.senderEmail || undefined,
    phone: payload.senderPhone || ticket.senderPhone || undefined,
    company: payload.senderCompany || ticket.senderCompany || undefined,
    firstName: ticket.senderName || undefined,
  });

  await db.update(tickets).set({
    customerId: customer.id,
    updatedAt: new Date(),
  }).where(eq(tickets.id, ticket.id));

  await identityService.recordInteraction({
    customerId: customer.id,
    ticketId: ticket.id,
    channel: 'ticket',
    direction: 'inbound',
    metadata: {
      source: 'customer.sync',
      title: payload.title,
    },
  });

  logInfo('outbox.customer_sync_completed', { jobId: job.id, ticketId: ticket.id, customerId: customer.id });
}

async function handleArOverdueTicket(job: OutboxJob) {
  const payload = job.payload as {
    customerId?: number;
    orderNumber?: string | null;
    invoiceNumber?: string | null;
    amount?: string | number | null;
    currency?: string | null;
    dueAt?: string | null;
  };

  if (!payload.customerId) {
    logWarn('outbox.ar_missing_customer', { jobId: job.id });
    return;
  }

  // Avoid duplicate AR tickets for the same invoice/order
  if (payload.orderNumber) {
    const existing = await db.query.tickets.findFirst({
      where: and(
        eq(tickets.orderNumber, payload.orderNumber),
        inArray(tickets.status, ['new', 'open', 'in_progress'])
      ),
    });
    if (existing) return;
  }

  const reporterId = await getDefaultReporterId();
  if (!reporterId) {
    logWarn('outbox.ar_no_reporter', { jobId: job.id });
    return;
  }

  const [ticket] = await db.insert(tickets).values({
    title: `AR: Invoice ${payload.invoiceNumber || payload.orderNumber || ''} overdue`,
    description: [
      payload.invoiceNumber ? `Invoice: ${payload.invoiceNumber}` : null,
      payload.orderNumber ? `Order: ${payload.orderNumber}` : null,
      payload.amount ? `Amount: ${payload.amount} ${payload.currency || ''}` : null,
      payload.dueAt ? `Due at: ${payload.dueAt}` : null,
    ].filter(Boolean).join('\n'),
    priority: 'urgent',
    status: 'open',
    type: 'Order Issue' as typeof ticketTypeEcommerceEnum.enumValues[number],
    reporterId,
    assigneeId: null,
    customerId: payload.customerId,
    orderNumber: payload.orderNumber || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await identityService.recordInteraction({
    customerId: payload.customerId,
    ticketId: ticket.id,
    channel: 'ticket',
    direction: 'inbound',
    metadata: {
      source: 'ar.overdue-ticket',
      invoiceNumber: payload.invoiceNumber,
      orderNumber: payload.orderNumber,
    },
  });

  // Create AR_OVERDUE CRM task for visibility in task list
  await db.insert(crmTasks).values({
    customerId: payload.customerId,
    ticketId: ticket.id,
    type: 'AR_OVERDUE',
    reason: 'LATE_INVOICE',
    status: 'open',
    dueAt: new Date(), // Due immediately
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logInfo('outbox.ar_ticket_created', {
    jobId: job.id,
    ticketId: ticket.id,
    customerId: payload.customerId,
    orderNumber: payload.orderNumber,
    invoiceNumber: payload.invoiceNumber,
  });
}

async function handleDraftOrderInvoice(job: OutboxJob) {
  const payload = job.payload as {
    draftOrderId?: string;
    email?: string;
    legacyResourceId?: string;
  };

  if (!payload.draftOrderId) {
    logWarn('outbox.invoice_missing_draft_order', { jobId: job.id });
    return;
  }

  const { ShopifyService } = await import('@/services/shopify/ShopifyService');
  const shopifyService = new ShopifyService();

  logInfo('outbox.invoice_sending', {
    jobId: job.id,
    draftOrderId: payload.draftOrderId,
    email: payload.email,
  });

  const invoiceResult = await shopifyService.sendDraftOrderInvoice(payload.draftOrderId);

  if (invoiceResult.success) {
    logInfo('outbox.invoice_sent', {
      jobId: job.id,
      draftOrderId: payload.draftOrderId,
      status: invoiceResult.status,
    });
  } else {
    // Throw to trigger retry with backoff
    throw new Error(`Invoice send failed: ${invoiceResult.error}`);
  }
}

async function getDefaultReporterId(): Promise<string | null> {
  const admin = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
    columns: { id: true },
  });
  if (admin?.id) return admin.id;

  const anyUser = await db.query.users.findFirst({
    columns: { id: true },
  });

  return anyUser?.id || null;
}
