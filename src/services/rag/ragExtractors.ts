import { Config } from '@/config/appConfig';
import { identityUtils } from '@/services/crm/identityService';
import { constructShipStationUrl } from '@/lib/shipstationService';
import type { RagSensitivity, RagSourceType } from './ragTypes';
import { cleanEmailText, cleanStructuredText, cleanTicketText } from './ragCleaning';
import { extractIdentifiers } from './ragIntent';

export interface RagSourceInput {
  sourceType: RagSourceType;
  sourceId: string;
  sourceUri: string;
  customerId: number | null;
  ticketId: number | null;
  threadId: string | null;
  parentId?: string | null;
  sensitivity: RagSensitivity;
  ownerUserId: string | null;
  title?: string | null;
  contentText: string;
  metadata: Record<string, unknown>;
  sourceCreatedAt: Date;
  sourceUpdatedAt?: Date | null;
}

const formatCurrency = (value: string | number | null | undefined, currency = 'USD'): string => {
  if (value == null) return `${currency} 0`;
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return `${currency} ${value}`;
  return `${currency} ${num.toFixed(2)}`;
};

const formatDate = (value?: Date | string | null): string => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().split('T')[0];
};

const getCustomerDisplayName = (customer?: { firstName?: string | null; lastName?: string | null; company?: string | null }) => {
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (customer?.company) return customer.company;
  return 'Customer';
};

const mergeIdentifiers = (...parts: Array<string | null | undefined>) => {
  const combined = parts.filter(Boolean).join('\n');
  const identifiers = extractIdentifiers(combined);
  return {
    orderNumber: identifiers.orderNumbers[0] ?? null,
    invoiceNumber: identifiers.invoiceNumbers[0] ?? null,
    poNumber: identifiers.poNumbers[0] ?? null,
    trackingNumber: identifiers.trackingNumbers[0] ?? null,
    sku: identifiers.skus[0] ?? null,
    itemSkus: identifiers.skus,
  };
};

export function extractTicketSource(input: {
  ticket: {
    id: number;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    type: string | null;
    orderNumber: string | null;
    trackingNumber: string | null;
    senderEmail: string | null;
    senderName: string | null;
    senderPhone: string | null;
    sentiment: string | null;
    conversationId: string | null;
    customerId: number | null;
    assigneeId: string | null;
    reporterId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}): RagSourceInput {
  const { ticket } = input;
  const identifierMeta = mergeIdentifiers(
    ticket.title,
    ticket.description || undefined,
    ticket.orderNumber || undefined,
    ticket.trackingNumber || undefined
  );
  const contentText = cleanTicketText([
    `Ticket #${ticket.id}: ${ticket.title}`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    ticket.type ? `Type: ${ticket.type}` : '',
    ticket.description || '',
    ticket.orderNumber ? `Order: ${ticket.orderNumber}` : '',
    ticket.trackingNumber ? `Tracking: ${ticket.trackingNumber}` : '',
  ].filter(Boolean).join('\n'));

  return {
    sourceType: 'ticket',
    sourceId: String(ticket.id),
    sourceUri: `/tickets/${ticket.id}`,
    customerId: ticket.customerId,
    ticketId: ticket.id,
    threadId: ticket.conversationId || `ticket-${ticket.id}`,
    sensitivity: 'public',
    ownerUserId: ticket.assigneeId || ticket.reporterId,
    title: ticket.title,
    contentText,
    metadata: {
      ticketId: ticket.id,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      orderNumber: ticket.orderNumber || identifierMeta.orderNumber,
      trackingNumber: ticket.trackingNumber || identifierMeta.trackingNumber,
      invoiceNumber: identifierMeta.invoiceNumber,
      poNumber: identifierMeta.poNumber,
      sku: identifierMeta.sku,
      itemSkus: identifierMeta.itemSkus,
      senderEmail: ticket.senderEmail,
      senderName: ticket.senderName,
      senderPhone: ticket.senderPhone,
      sentiment: ticket.sentiment,
      conversationId: ticket.conversationId,
    },
    sourceCreatedAt: ticket.createdAt,
    sourceUpdatedAt: ticket.updatedAt,
  };
}

export function extractTicketCommentSource(input: {
  comment: {
    id: number;
    ticketId: number;
    commentText: string;
    commenterId: string | null;
    createdAt: Date;
    isFromCustomer: boolean;
    isInternalNote: boolean;
    isOutgoingReply: boolean;
    externalMessageId: string | null;
  };
  ticket: {
    conversationId: string | null;
    customerId: number | null;
  } | null;
}): RagSourceInput {
  const { comment, ticket } = input;
  const contentText = cleanTicketText(comment.commentText);
  const identifierMeta = mergeIdentifiers(comment.commentText);
  const sensitivity: RagSensitivity = comment.isInternalNote ? 'internal' : 'public';

  return {
    sourceType: 'ticket_comment',
    sourceId: String(comment.id),
    sourceUri: `/tickets/${comment.ticketId}#comment-${comment.id}`,
    customerId: ticket?.customerId ?? null,
    ticketId: comment.ticketId,
    threadId: ticket?.conversationId || `ticket-${comment.ticketId}`,
    sensitivity,
    ownerUserId: comment.commenterId,
    title: `Ticket #${comment.ticketId} comment`,
    contentText,
    metadata: {
      ticketId: comment.ticketId,
      commentId: comment.id,
      isFromCustomer: comment.isFromCustomer,
      isInternalNote: comment.isInternalNote,
      isOutgoingReply: comment.isOutgoingReply,
      externalMessageId: comment.externalMessageId,
      orderNumber: identifierMeta.orderNumber,
      invoiceNumber: identifierMeta.invoiceNumber,
      poNumber: identifierMeta.poNumber,
      trackingNumber: identifierMeta.trackingNumber,
      sku: identifierMeta.sku,
      itemSkus: identifierMeta.itemSkus,
    },
    sourceCreatedAt: comment.createdAt,
  };
}

export function extractInteractionSource(input: {
  interaction: {
    id: number;
    customerId: number;
    ticketId: number | null;
    commentId: number | null;
    channel: string;
    direction: string;
    occurredAt: Date;
    metadata: Record<string, unknown> | null;
  };
}): RagSourceInput {
  const { interaction } = input;
  const summary = `Interaction (${interaction.channel}, ${interaction.direction})`;
  const metadataSummary = interaction.metadata ? JSON.stringify(interaction.metadata) : '';

  return {
    sourceType: 'interaction',
    sourceId: String(interaction.id),
    sourceUri: interaction.ticketId ? `/tickets/${interaction.ticketId}` : `/customers/${interaction.customerId}`,
    customerId: interaction.customerId,
    ticketId: interaction.ticketId,
    threadId: interaction.ticketId ? `ticket-${interaction.ticketId}` : null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: summary,
    contentText: cleanTicketText(`${summary}\n${metadataSummary}`),
    metadata: {
      interactionId: interaction.id,
      channel: interaction.channel,
      direction: interaction.direction,
      ticketId: interaction.ticketId,
      commentId: interaction.commentId,
      metadata: interaction.metadata,
    },
    sourceCreatedAt: interaction.occurredAt,
  };
}

export function extractOrderSource(input: {
  order: {
    id: number;
    customerId: number;
    provider: string;
    externalId: string | null;
    orderNumber: string | null;
    status: string;
    financialStatus: string;
    currency: string;
    total: string;
    placedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    metadata: Record<string, any> | null;
  };
  items: Array<{ sku: string | null; title: string | null; quantity: number }>;
  customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null;
}): RagSourceInput {
  const { order, items, customer } = input;
  const provider = order.provider;
  const sourceType: RagSourceType = provider === 'shopify'
    ? 'shopify_order'
    : provider === 'amazon'
      ? 'amazon_order'
      : 'order';

  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const itemSkus = items.map((item) => item.sku).filter(Boolean) as string[];
  const topSkus = items.map((item) => item.sku || item.title).filter(Boolean).slice(0, 3);
  const customerName = getCustomerDisplayName(customer || undefined);

  const contentText = cleanStructuredText(
    `${provider === 'shopify' ? 'Shopify' : provider === 'amazon' ? 'Amazon' : 'Order'} ${order.orderNumber || order.externalId || order.id} for ${customerName}: ${itemCount} items, ` +
    `top SKUs ${topSkus.join(', ') || '—'}, total ${formatCurrency(order.total, order.currency)}, ` +
    `fulfillment ${order.status}, financial ${order.financialStatus}, placed ${formatDate(order.placedAt)}.`
  );

  let sourceUri = order.customerId ? `/customers/${order.customerId}` : '/customers';
  if (provider === 'shopify' && Config.shopify.storeUrl && order.externalId) {
    const store = Config.shopify.storeUrl.replace(/^https?:\/\//, '');
    sourceUri = `https://${store}/admin/orders/${order.externalId}`;
  }

  return {
    sourceType,
    sourceId: String(order.externalId || order.id),
    sourceUri,
    customerId: order.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `${provider.toUpperCase()} Order ${order.orderNumber || order.externalId || order.id}`,
    contentText,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: order.provider,
      externalId: order.externalId,
      status: order.status,
      financialStatus: order.financialStatus,
      currency: order.currency,
      total: order.total,
      placedAt: order.placedAt,
      dueAt: order.dueAt,
      paidAt: order.paidAt,
      itemSkus,
      sku: itemSkus.length ? itemSkus.join(', ') : null,
      metadata: order.metadata,
    },
    sourceCreatedAt: order.placedAt || new Date(),
    sourceUpdatedAt: order.paidAt || order.dueAt || null,
  };
}

export function extractQboInvoiceSource(input: {
  invoice: {
    qboInvoiceId: string;
    qboCustomerId: string | null;
    docNumber: string | null;
    status: string | null;
    totalAmount: string;
    balance: string;
    currency: string;
    txnDate: Date | null;
    dueDate: Date | null;
    metadata: Record<string, unknown> | null;
    customerId: number | null;
  };
  customerName?: string | null;
  terms?: string | null;
}): RagSourceInput {
  const { invoice, customerName, terms } = input;
  const label = invoice.docNumber || invoice.qboInvoiceId;
  const contentText = cleanStructuredText(
    `QBO Invoice ${label} for ${customerName || 'customer'}: balance ${formatCurrency(invoice.balance, invoice.currency)}, ` +
    `total ${formatCurrency(invoice.totalAmount, invoice.currency)}, terms ${terms || '—'}, due ${formatDate(invoice.dueDate)}, status ${invoice.status || 'unknown'}.`
  );

  return {
    sourceType: 'qbo_invoice',
    sourceId: invoice.qboInvoiceId,
    sourceUri: invoice.customerId ? `/customers/${invoice.customerId}` : '/customers',
    customerId: invoice.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `QBO Invoice ${label}`,
    contentText,
    metadata: {
      invoiceNumber: invoice.docNumber,
      qboInvoiceId: invoice.qboInvoiceId,
      qboCustomerId: invoice.qboCustomerId,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      balance: invoice.balance,
      currency: invoice.currency,
      txnDate: invoice.txnDate,
      dueDate: invoice.dueDate,
      metadata: invoice.metadata,
    },
    sourceCreatedAt: invoice.txnDate || new Date(),
    sourceUpdatedAt: invoice.dueDate || null,
  };
}

export function extractQboEstimateSource(input: {
  estimate: {
    qboEstimateId: string;
    qboCustomerId: string | null;
    docNumber: string | null;
    status: string | null;
    totalAmount: string;
    currency: string;
    txnDate: Date | null;
    expirationDate: Date | null;
    metadata: Record<string, unknown> | null;
    customerId: number | null;
  };
  customerName?: string | null;
}): RagSourceInput {
  const { estimate, customerName } = input;
  const label = estimate.docNumber || estimate.qboEstimateId;
  const contentText = cleanStructuredText(
    `QBO Estimate ${label} for ${customerName || 'customer'}: total ${formatCurrency(estimate.totalAmount, estimate.currency)}, ` +
    `status ${estimate.status || 'unknown'}, expires ${formatDate(estimate.expirationDate)}.`
  );

  return {
    sourceType: 'qbo_estimate',
    sourceId: estimate.qboEstimateId,
    sourceUri: estimate.customerId ? `/customers/${estimate.customerId}` : '/customers',
    customerId: estimate.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `QBO Estimate ${label}`,
    contentText,
    metadata: {
      estimateNumber: estimate.docNumber,
      poNumber: estimate.docNumber,
      qboEstimateId: estimate.qboEstimateId,
      qboCustomerId: estimate.qboCustomerId,
      status: estimate.status,
      totalAmount: estimate.totalAmount,
      currency: estimate.currency,
      txnDate: estimate.txnDate,
      expirationDate: estimate.expirationDate,
      metadata: estimate.metadata,
    },
    sourceCreatedAt: estimate.txnDate || new Date(),
    sourceUpdatedAt: estimate.expirationDate || null,
  };
}

export function extractQboCustomerSource(input: {
  snapshot: {
    qboCustomerId: string;
    balance: string;
    currency: string;
    terms: string | null;
    lastInvoiceDate: Date | null;
    lastPaymentDate: Date | null;
    snapshotTakenAt: Date;
    customerId: number;
  };
  customerName?: string | null;
}): RagSourceInput {
  const { snapshot, customerName } = input;
  const contentText = cleanStructuredText(
    `QBO Customer ${customerName || snapshot.qboCustomerId}: balance ${formatCurrency(snapshot.balance, snapshot.currency)}, ` +
    `terms ${snapshot.terms || '—'}, last invoice ${formatDate(snapshot.lastInvoiceDate)}, last payment ${formatDate(snapshot.lastPaymentDate)}.`
  );

  return {
    sourceType: 'qbo_customer',
    sourceId: snapshot.qboCustomerId,
    sourceUri: `/customers/${snapshot.customerId}`,
    customerId: snapshot.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `QBO Customer ${customerName || snapshot.qboCustomerId}`,
    contentText,
    metadata: {
      qboCustomerId: snapshot.qboCustomerId,
      balance: snapshot.balance,
      currency: snapshot.currency,
      terms: snapshot.terms,
      lastInvoiceDate: snapshot.lastInvoiceDate,
      lastPaymentDate: snapshot.lastPaymentDate,
      snapshotTakenAt: snapshot.snapshotTakenAt,
    },
    sourceCreatedAt: snapshot.snapshotTakenAt,
  };
}

export function extractShopifyCustomerSource(input: {
  identity: {
    externalId: string | null;
    email: string | null;
    phone: string | null;
  };
  customer: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}): RagSourceInput {
  const { identity, customer } = input;
  const customerName = getCustomerDisplayName(customer);
  const contentText = cleanStructuredText(
    `Shopify Customer ${customerName}: email ${identity.email || customer.primaryEmail || '—'}, phone ${identity.phone || customer.primaryPhone || '—'}, ` +
    `company ${customer.company || '—'}.`
  );

  const sourceId = identity.externalId || String(customer.id);

  return {
    sourceType: 'shopify_customer',
    sourceId,
    sourceUri: `/customers/${customer.id}`,
    customerId: customer.id,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `Shopify Customer ${customerName}`,
    contentText,
    metadata: {
      shopifyCustomerId: identity.externalId,
      email: identity.email || customer.primaryEmail,
      phone: identity.phone || customer.primaryPhone,
      company: customer.company,
    },
    sourceCreatedAt: customer.createdAt,
    sourceUpdatedAt: customer.updatedAt,
  };
}

export function extractShipstationShipmentSource(input: {
  shipment: {
    shipstationShipmentId: bigint | number;
    shipstationOrderId: bigint | number | null;
    orderNumber: string | null;
    trackingNumber: string | null;
    carrierCode: string | null;
    serviceCode: string | null;
    shipDate: Date | null;
    deliveryDate: Date | null;
    status: string | null;
    cost: string | null;
    weight: string | null;
    weightUnit: string | null;
    metadata: Record<string, unknown> | null;
    customerId: number | null;
  };
}): RagSourceInput {
  const { shipment } = input;
  const label = shipment.orderNumber || shipment.shipstationShipmentId.toString();
  const contentText = cleanStructuredText(
    `Shipment ${label}: carrier ${shipment.carrierCode || '—'}, service ${shipment.serviceCode || '—'}, ` +
    `tracking ${shipment.trackingNumber || '—'}, cost ${formatCurrency(shipment.cost || '0')}, ` +
    `weight ${shipment.weight || '—'} ${shipment.weightUnit || ''}, status ${shipment.status || 'unknown'}.`
  );

  const sourceUri = shipment.shipstationOrderId
    ? constructShipStationUrl(Number(shipment.shipstationOrderId)) || `/customers/${shipment.customerId || ''}`
    : `/customers/${shipment.customerId || ''}`;

  return {
    sourceType: 'shipstation_shipment',
    sourceId: shipment.shipstationShipmentId.toString(),
    sourceUri,
    customerId: shipment.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `Shipment ${label}`,
    contentText,
    metadata: {
      shipmentId: shipment.shipstationShipmentId.toString(),
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
      metadata: shipment.metadata,
    },
    sourceCreatedAt: shipment.shipDate || new Date(),
    sourceUpdatedAt: shipment.deliveryDate || null,
  };
}

export function extractAmazonShipmentSource(input: {
  shipment: {
    id: number;
    externalId: string;
    orderId: number | null;
    orderNumber: string | null;
    trackingNumber: string | null;
    carrierCode: string | null;
    serviceCode: string | null;
    shipDate: Date | null;
    estimatedDeliveryDate: Date | null;
    actualDeliveryDate: Date | null;
    status: string | null;
    cost: string | null;
    weight: string | null;
    weightUnit: string | null;
    metadata: Record<string, unknown> | null;
    customerId: number | null;
    provider: string;
  };
}): RagSourceInput {
  const { shipment } = input;
  const label = shipment.orderNumber || shipment.externalId;
  const providerLabel = shipment.provider === 'amazon_fba' ? 'Amazon FBA' : 'Amazon MFN';
  const contentText = cleanStructuredText(
    `${providerLabel} Shipment ${label}: carrier ${shipment.carrierCode || 'Amazon'}, ` +
    `tracking ${shipment.trackingNumber || '—'}, ` +
    `ship date ${formatDate(shipment.shipDate)}, ` +
    `estimated delivery ${formatDate(shipment.estimatedDeliveryDate)}, ` +
    `status ${shipment.status || 'unknown'}.`
  );

  return {
    sourceType: 'amazon_shipment',
    sourceId: shipment.externalId,
    sourceUri: shipment.customerId ? `/customers/${shipment.customerId}` : '/customers',
    customerId: shipment.customerId,
    ticketId: null,
    threadId: null,
    sensitivity: 'internal',
    ownerUserId: null,
    title: `${providerLabel} Shipment ${label}`,
    contentText,
    metadata: {
      shipmentId: shipment.externalId,
      provider: shipment.provider,
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
      metadata: shipment.metadata,
    },
    sourceCreatedAt: shipment.shipDate || new Date(),
    sourceUpdatedAt: shipment.actualDeliveryDate || shipment.estimatedDeliveryDate || null,
  };
}

export function extractEmailSource(input: {
  message: {
    id: string;
    subject?: string | null;
    body?: { content?: string | null } | null;
    bodyPreview?: string | null;
    from?: { emailAddress?: { address?: string | null; name?: string | null } | null } | null;
    sender?: { emailAddress?: { address?: string | null; name?: string | null } | null } | null;
    toRecipients?: Array<{ emailAddress?: { address?: string | null; name?: string | null } | null }> | null;
    ccRecipients?: Array<{ emailAddress?: { address?: string | null; name?: string | null } | null }> | null;
    receivedDateTime?: string | null;
    sentDateTime?: string | null;
    conversationId?: string | null;
    internetMessageId?: string | null;
    inReplyTo?: string | null;
    webLink?: string | null;
  };
  customerId: number | null;
}): RagSourceInput {
  const { message, customerId } = input;
  const bodyContent = message.body?.content || message.bodyPreview || '';
  const cleaned = cleanEmailText(bodyContent);
  const subject = message.subject || 'Email';
  const identifierMeta = mergeIdentifiers(subject, cleaned);
  const fromEmail = message.from?.emailAddress?.address || message.sender?.emailAddress?.address || null;
  const toEmails = (message.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean);
  const ccEmails = (message.ccRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean);

  return {
    sourceType: 'email',
    sourceId: message.id,
    sourceUri: message.webLink || `/customers/${customerId || ''}`,
    customerId,
    ticketId: null,
    threadId: message.conversationId || message.internetMessageId || message.id,
    sensitivity: 'public',
    ownerUserId: null,
    title: subject,
    contentText: cleaned,
    metadata: {
      subject,
      fromEmail: identityUtils.normalizeEmail(fromEmail || undefined),
      toEmails: toEmails.map((e) => identityUtils.normalizeEmail(e || undefined)),
      ccEmails: ccEmails.map((e) => identityUtils.normalizeEmail(e || undefined)),
      internetMessageId: message.internetMessageId,
      inReplyTo: message.inReplyTo,
      conversationId: message.conversationId,
      orderNumber: identifierMeta.orderNumber,
      invoiceNumber: identifierMeta.invoiceNumber,
      poNumber: identifierMeta.poNumber,
      trackingNumber: identifierMeta.trackingNumber,
      sku: identifierMeta.sku,
      itemSkus: identifierMeta.itemSkus,
    },
    sourceCreatedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
    sourceUpdatedAt: message.sentDateTime ? new Date(message.sentDateTime) : null,
  };
}
