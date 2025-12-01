  // src/db/schema.ts
import { serial, text, timestamp, varchar, pgEnum, integer, boolean, unique, pgSchema, primaryKey, check, type PgTable, index, doublePrecision, type AnyPgColumn, time } from 'drizzle-orm/pg-core';
import { relations, type One, type Many, sql } from 'drizzle-orm';
import crypto from 'crypto'; // For UUID generation
import { pgTable, bigint, jsonb, decimal } from 'drizzle-orm/pg-core';

// Define your PostgreSQL schema objects
export const ticketingProdSchema = pgSchema('ticketing_prod');

// --- Enums ---
export const ticketStatusEnum = ticketingProdSchema.enum('ticket_status_enum', ['new', 'open', 'in_progress', 'pending_customer', 'closed']);
export const ticketPriorityEnum = ticketingProdSchema.enum('ticket_priority_enum', ['low', 'medium', 'high', 'urgent']);
export const userRoleEnum = ticketingProdSchema.enum('user_role', ['admin', 'manager', 'user']);
export const ticketingRoleEnum = ticketingProdSchema.enum('ticketing_role_enum', ['Admin', 'Project Manager', 'Developer', 'Submitter', 'Viewer', 'Other']);
export const ticketTypeEcommerceEnum = ticketingProdSchema.enum('ticket_type_ecommerce_enum', [
    'Return', 'Shipping Issue', 'Order Issue', 'New Order', 'Credit Request',
    'COA Request', 'COC Request', 'SDS Request', 'Quote Request', 'Purchase Order', 'General Inquiry', 'Test Entry',
    'International Shipping'
]);
export const ticketSentimentEnum = ticketingProdSchema.enum('ticket_sentiment_enum', ['positive', 'neutral', 'negative']);
export const userApprovalStatusEnum = ticketingProdSchema.enum('user_approval_status', ['pending', 'approved', 'rejected']);
export const aiSuggestedActionEnum = ticketingProdSchema.enum('ai_suggested_action_enum', [
  'CREATE_QUOTE',
  'CHECK_ORDER_STATUS',
  'DOCUMENT_REQUEST',
  'GENERAL_REPLY',
]);
export const providerEnum = ticketingProdSchema.enum('provider_enum', [
  'shopify',
  'qbo',
  'amazon',
  'manual',
  'self_reported',
  'klaviyo'
]);
export const orderStatusEnum = ticketingProdSchema.enum('order_status_enum', [
  'open',
  'closed',
  'cancelled',
  'fulfilled',
  'partial'
]);
export const financialStatusEnum = ticketingProdSchema.enum('financial_status_enum', [
  'paid',
  'partially_paid',
  'unpaid',
  'void'
]);
export const interactionChannelEnum = ticketingProdSchema.enum('interaction_channel_enum', [
  'email',
  'ticket',
  'self_id_form',
  'amazon_api',
  'shopify_webhook',
  'klaviyo',
  'telephony',
]);
export const interactionDirectionEnum = ticketingProdSchema.enum('interaction_direction_enum', [
  'inbound',
  'outbound'
]);
export const opportunityStageEnum = ticketingProdSchema.enum('opportunity_stage_enum', [
  'lead',
  'quote_sent',
  'won',
  'lost',
]);

// --- Canned Responses Table ---
export const cannedResponses = ticketingProdSchema.table('canned_responses', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 100 }).notNull().unique(), // Short title for selection
  content: text('content').notNull(), // The actual response text/HTML
  category: varchar('category', { length: 50 }), // Optional categorization
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdById: text('created_by_id').references(() => users.id), // Optional: track who created it
});

// --- NEW SLA TABLES ---
export const slaPolicies = ticketingProdSchema.table('sla_policies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  priority: ticketPriorityEnum('priority').notNull(),
  firstResponseMinutes: integer('first_response_minutes').notNull(), // e.g., 60 for 1 hour
  resolutionMinutes: integer('resolution_minutes').notNull(),    // e.g., 480 for 8 hours
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const businessHours = ticketingProdSchema.table('business_hours', {
  id: serial('id').primaryKey(),
  // 0=Sunday, 1=Monday, ..., 6=Saturday
  dayOfWeek: integer('day_of_week').notNull().unique(),
  startTime: time('start_time').notNull(), // e.g., '09:00:00'
  endTime: time('end_time').notNull(),   // e.g., '17:00:00'
  isActive: boolean('is_active').default(true).notNull(),
});


// --- Auth.js Tables (within ticketing_prod schema) ---
export const users = ticketingProdSchema.table('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), // User ID is TEXT (UUID)
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }), // Password can be null for external/OAuth users
  name: varchar('name', { length: 255 }),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  role: userRoleEnum('role').default('user').notNull(),
  approvalStatus: userApprovalStatusEnum('approval_status').default('pending').notNull(),
  resetToken: varchar('reset_token', { length: 255 }),
  resetTokenExpiry: timestamp('reset_token_expiry', { mode: 'date' }),
  ticketingRole: ticketingRoleEnum('ticketing_role'),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  isExternal: boolean('is_external').default(false).notNull(),
}, (table) => {
  return {
    roleIndex: index('idx_users_role').on(table.role),
  };
});

export const accounts = ticketingProdSchema.table(
  'accounts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // References TEXT user ID
    type: text('type').$type<"oauth" | "oidc" | "email" | "credentials">().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = ticketingProdSchema.table('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // References TEXT user ID
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = ticketingProdSchema.table(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);


// --- Your Application Tables (within ticketing_prod schema) ---

export const customers = ticketingProdSchema.table('customers', {
  id: serial('id').primaryKey(),
  primaryEmail: varchar('primary_email', { length: 255 }),
  primaryPhone: varchar('primary_phone', { length: 32 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  company: varchar('company', { length: 255 }),
  isVip: boolean('is_vip').default(false).notNull(),
  creditRiskLevel: varchar('credit_risk_level', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    emailIndex: index('idx_customers_primary_email').on(table.primaryEmail),
    phoneIndex: index('idx_customers_primary_phone').on(table.primaryPhone),
    companyIndex: index('idx_customers_company').on(table.company),
  };
});

export const contacts = ticketingProdSchema.table('contacts', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 32 }),
  role: varchar('role', { length: 64 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    customerIndex: index('idx_contacts_customer').on(table.customerId),
    emailIndex: index('idx_contacts_email').on(table.email),
  };
});

export const opportunities = ticketingProdSchema.table('opportunities', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  stage: opportunityStageEnum('stage').default('lead').notNull(),
  source: varchar('source', { length: 64 }),
  division: varchar('division', { length: 32 }),
  estimatedValue: decimal('estimated_value', { precision: 14, scale: 2 }),
  currency: varchar('currency', { length: 8 }).default('USD').notNull(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  shopifyDraftOrderId: text('shopify_draft_order_id'),
  qboEstimateId: text('qbo_estimate_id'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  lostReason: text('lost_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    customerIndex: index('idx_opportunities_customer').on(table.customerId),
    ownerIndex: index('idx_opportunities_owner').on(table.ownerId),
    stageIndex: index('idx_opportunities_stage').on(table.stage),
    divisionIndex: index('idx_opportunities_division').on(table.division),
  };
});

export const customerIdentities = ticketingProdSchema.table('customer_identities', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  provider: providerEnum('provider').notNull(),
  externalId: varchar('external_id', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 32 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    providerExternalIndex: index('idx_customer_identities_provider_ext').on(table.provider, table.externalId),
    emailIndex: index('idx_customer_identities_email').on(table.email),
    phoneIndex: index('idx_customer_identities_phone').on(table.phone),
    customerIndex: index('idx_customer_identities_customer').on(table.customerId),
  };
});

export const orders = ticketingProdSchema.table('orders', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  provider: providerEnum('provider').notNull(),
  externalId: varchar('external_id', { length: 255 }),
  orderNumber: varchar('order_number', { length: 255 }),
  status: orderStatusEnum('status').default('open').notNull(),
  financialStatus: financialStatusEnum('financial_status').default('unpaid').notNull(),
  currency: varchar('currency', { length: 8 }).default('USD').notNull(),
  total: decimal('total', { precision: 14, scale: 2 }).default('0').notNull(),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  lateFlag: boolean('late_flag').default(false).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    providerExternalIndex: index('idx_orders_provider_ext').on(table.provider, table.externalId),
    orderNumberIndex: index('idx_orders_order_number').on(table.orderNumber),
    customerIndex: index('idx_orders_customer').on(table.customerId),
    lateIndex: index('idx_orders_late_flag').on(table.lateFlag),
    providerExternalUnique: unique('uq_orders_provider_external').on(table.provider, table.externalId),
  };
});

export const orderItems = ticketingProdSchema.table('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  sku: varchar('sku', { length: 255 }),
  productIdExternal: varchar('product_id_external', { length: 255 }),
  title: varchar('title', { length: 512 }),
  quantity: integer('quantity').default(1).notNull(),
  price: decimal('price', { precision: 14, scale: 2 }).default('0').notNull(),
  metadata: jsonb('metadata'),
}, (table) => {
  return {
    orderIndex: index('idx_order_items_order').on(table.orderId),
  };
});

export const outboxJobs = ticketingProdSchema.table('outbox_jobs', {
  id: serial('id').primaryKey(),
  topic: varchar('topic', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    statusIndex: index('idx_outbox_status').on(table.status, table.nextRunAt),
    topicIndex: index('idx_outbox_topic').on(table.topic),
  };
});

export const tickets = ticketingProdSchema.table('tickets', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: ticketStatusEnum('status').default('new').notNull(),
  priority: ticketPriorityEnum('priority').default('medium').notNull(),
  type: ticketTypeEcommerceEnum('type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'set null' }),
  orderNumber: varchar('order_number', { length: 255 }),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  senderEmail: varchar('sender_email', { length: 255 }),
  senderName: varchar('sender_name', { length: 255 }),
  senderPhone: varchar('sender_phone', { length: 20 }),
  externalMessageId: varchar('external_message_id', { length: 255 }).unique(),
  conversationId: text('conversation_id'),
  sentiment: ticketSentimentEnum('sentiment'),
  ai_summary: text('ai_summary'),
  ai_suggested_assignee_id: text('ai_suggested_assignee_id').references(() => users.id, { onDelete: 'set null' }),
  senderCompany: varchar('sender_company', { length: 255 }),

  // --- NEW AI-related field ---
  aiSuggestedAction: aiSuggestedActionEnum('ai_suggested_action'),
  // Shipping address fields
  shippingName: varchar('shipping_name', { length: 255 }),
  shippingCompany: varchar('shipping_company', { length: 255 }),
  shippingCountry: varchar('shipping_country', { length: 100 }),
  shippingAddressLine1: varchar('shipping_address_line1', { length: 255 }),
  shippingAddressLine2: varchar('shipping_address_line2', { length: 255 }),
  shippingAddressLine3: varchar('shipping_address_line3', { length: 255 }),
  shippingCity: varchar('shipping_city', { length: 100 }),
  shippingState: varchar('shipping_state', { length: 100 }),
  shippingPostalCode: varchar('shipping_postal_code', { length: 20 }),
  shippingPhone: varchar('shipping_phone', { length: 20 }),
  shippingEmail: varchar('shipping_email', { length: 255 }),
  // Foreign key to the ticket this one was merged into.
  mergedIntoTicketId: integer('merged_into_ticket_id').references((): AnyPgColumn => tickets.id, { onDelete: 'set null' }),
  // Link to CRM customer
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  // Optional link to an opportunity
  opportunityId: integer('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),

  // --- NEW SLA-related fields ---
  slaPolicyId: integer('sla_policy_id').references(() => slaPolicies.id, { onDelete: 'set null' }),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }),
  resolutionDueAt: timestamp('resolution_due_at', { withTimezone: true }),
  slaBreached: boolean('sla_breached').default(false).notNull(),
  slaNotified: boolean('sla_notified').default(false).notNull(), // To prevent multiple notifications

  // Full-text search vector - added via manual migration (see migrations/fts_setup.sql)
  // FTS: Full-text search done via LIKE patterns in queries (see TicketService)

}, (table) => {
  return {
    // Unique constraints
    externalMessageIdKey: unique('tickets_mailgun_message_id_key').on(table.externalMessageId),

    // Foreign key / relationship indexes
    mergedIntoTicketIdIndex: index('idx_tickets_merged_into').on(table.mergedIntoTicketId),
    conversationIdIndex: index('idx_tickets_conversation_id').on(table.conversationId),
    customerIndex: index('idx_tickets_customer').on(table.customerId),
    slaPolicyIdIndex: index('idx_tickets_sla_policy_id').on(table.slaPolicyId),

    // Single-column filter indexes (not covered by composites)
    priorityIndex: index('idx_tickets_priority').on(table.priority),
    typeIndex: index('idx_tickets_type').on(table.type),
    senderEmailIndex: index('idx_tickets_sender_email').on(table.senderEmail),

    // Sort indexes
    createdAtIndex: index('idx_tickets_created_at').on(table.createdAt),
    updatedAtIndex: index('idx_tickets_updated_at').on(table.updatedAt),

    // Composite indexes (cover single-column queries on leading column)
    // statusPriorityIndex covers: status, (status + priority)
    statusPriorityIndex: index('idx_tickets_status_priority').on(table.status, table.priority),
    // assigneeStatusIndex covers: assigneeId, (assigneeId + status)
    assigneeStatusIndex: index('idx_tickets_assignee_status').on(table.assigneeId, table.status),
    // reporterStatusIndex covers: reporterId, (reporterId + status)
    reporterStatusIndex: index('idx_tickets_reporter_status').on(table.reporterId, table.status),
    // slaStatusIndex covers: (status + slaBreached) for SLA queries
    slaStatusIndex: index('idx_tickets_sla_status').on(table.status, table.slaBreached),
    opportunityIndex: index('idx_tickets_opportunity_id').on(table.opportunityId),

    // FTS uses LIKE patterns on indexed columns (senderEmail, title, description, orderNumber)
  };
});

export const ticketComments = ticketingProdSchema.table('ticket_comments', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  commentText: text('comment_text').notNull(),
  commenterId: text('commenter_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  isFromCustomer: boolean('is_from_customer').default(false).notNull(),
  isInternalNote: boolean('is_internal_note').default(false).notNull(),
  isOutgoingReply: boolean('is_outgoing_reply').default(false).notNull(),
  externalMessageId: varchar('external_message_id', { length: 255 }).unique(),
}, (table) => {
  return {
    externalMessageIdKey: unique('ticket_comments_mailgun_message_id_key').on(table.externalMessageId),
    ticketIdIndex: index('idx_ticket_comments_ticket_id').on(table.ticketId),
    createdAtIndex: index('idx_ticket_comments_created_at').on(table.createdAt),
    commenterIdIndex: index('idx_ticket_comments_commenter_id').on(table.commenterId),
  };
});

export const subscriptions = ticketingProdSchema.table('subscriptions', {
  id: serial('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().unique(),
  resource: text('resource').notNull(),
  changeType: text('change_type').notNull(),
  notificationUrl: text('notification_url').notNull(),
  expirationDateTime: timestamp('expiration_datetime', { withTimezone: true }).notNull(),
  clientState: text('client_state'),
  creatorId: text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true).notNull(),
  renewalCount: integer('renewal_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const qboCustomerSnapshots = ticketingProdSchema.table('qbo_customer_snapshots', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  qboCustomerId: text('qbo_customer_id').notNull(),
  terms: text('terms'),
  balance: decimal('balance', { precision: 14, scale: 2 }).default('0').notNull(),
  currency: varchar('currency', { length: 8 }).default('USD').notNull(),
  lastInvoiceDate: timestamp('last_invoice_date', { withTimezone: true }),
  lastPaymentDate: timestamp('last_payment_date', { withTimezone: true }),
  snapshotTakenAt: timestamp('snapshot_taken_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    customerUnique: unique('uq_qbo_snapshots_customer').on(table.customerId),
    qboIdIndex: index('idx_qbo_snapshots_qbo_id').on(table.qboCustomerId),
  };
});

export const calls = ticketingProdSchema.table('calls', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  opportunityId: integer('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  providerCallId: text('provider_call_id'),
  direction: interactionDirectionEnum('direction').notNull().default('inbound'),
  fromNumber: varchar('from_number', { length: 32 }).notNull(),
  toNumber: varchar('to_number', { length: 32 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  recordingUrl: text('recording_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    customerIndex: index('idx_calls_customer').on(table.customerId),
    contactIndex: index('idx_calls_contact').on(table.contactId),
    providerCallIndex: index('idx_calls_provider_call').on(table.providerCallId),
    startedAtIndex: index('idx_calls_started_at').on(table.startedAt),
    providerCallUnique: unique('uq_calls_provider_call').on(table.provider, table.providerCallId),
  };
});

export const ticketAttachments = ticketingProdSchema.table('ticket_attachments', {
  id: serial('id').primaryKey(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  storagePath: varchar('storage_path', { length: 500 }).notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  commentId: integer('comment_id').references(() => ticketComments.id, { onDelete: 'cascade' }),
  uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => {
  return {
    ticketIdIndex: index('idx_ticket_attachments_ticket_id').on(table.ticketId),
    commentIdIndex: index('idx_ticket_attachments_comment_id').on(table.commentId),
    uploaderIdIndex: index('idx_attachment_uploader_id').on(table.uploaderId),
  };
});

export const interactions = ticketingProdSchema.table('interactions', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  commentId: integer('comment_id').references(() => ticketComments.id, { onDelete: 'set null' }),
  channel: interactionChannelEnum('channel').notNull(),
  direction: interactionDirectionEnum('direction').default('inbound').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    customerIndex: index('idx_interactions_customer').on(table.customerId),
    ticketIndex: index('idx_interactions_ticket').on(table.ticketId),
    channelIndex: index('idx_interactions_channel').on(table.channel),
  };
});

export const userSignatures = ticketingProdSchema.table('user_signatures', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  signature: text('signature').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- Relations ---
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  assignedTickets: many(tickets, { relationName: 'TicketAssignee' }),
  suggestedTickets: many(tickets, { relationName: 'TicketAiSuggestedAssignee' }),
  reportedTickets: many(tickets, { relationName: 'TicketReporter' }),
  comments: many(ticketComments, { relationName: 'UserComments' }),
  uploadedAttachments: many(ticketAttachments, { relationName: 'AttachmentUploader' }),
  accounts: many(accounts),
  sessions: many(sessions),
  reviewedQuarantinedEmails: many(quarantinedEmails),
  signatures: many(userSignatures),
  subscriptions: many(subscriptions),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: 'TicketAssignee',
  }),
  reporter: one(users, {
    fields: [tickets.reporterId],
    references: [users.id],
    relationName: 'TicketReporter',
  }),
  aiSuggestedAssignee: one(users, { // New relation for AI suggestion
    fields: [tickets.ai_suggested_assignee_id],
    references: [users.id],
    relationName: 'TicketAiSuggestedAssignee',
  }),
  comments: many(ticketComments),
  attachments: many(ticketAttachments), // Existing relation
  // --- NEW: Self-referencing relations for merging ---
  // The ticket this one was merged into
  mergedIntoTicket: one(tickets, {
    fields: [tickets.mergedIntoTicketId],
    references: [tickets.id],
    relationName: 'MergedTickets',
  }),
  // All tickets that were merged into this one
  mergedTickets: many(tickets, {
    relationName: 'MergedTickets',
  }),
  // --------------------------------------------------
  slaPolicy: one(slaPolicies, {
    fields: [tickets.slaPolicyId],
    references: [slaPolicies.id],
  }),
  customer: one(customers, {
    fields: [tickets.customerId],
    references: [customers.id],
  }),
  opportunity: one(opportunities, {
    fields: [tickets.opportunityId],
    references: [opportunities.id],
  }),
  calls: many(calls),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one, many }) => ({
  ticket: one(tickets, {
    fields: [ticketComments.ticketId],
    references: [tickets.id],
  }),
  commenter: one(users, {
    fields: [ticketComments.commenterId],
    references: [users.id],
    relationName: 'UserComments' // Corrected relation name based on usersRelations
  }),
  attachments: many(ticketAttachments), // Existing relation
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketAttachments.ticketId],
    references: [tickets.id],
    relationName: 'AttachmentTicket',
  }),
  comment: one(ticketComments, {
    fields: [ticketAttachments.commentId],
    references: [ticketComments.id],
    relationName: 'AttachmentComment',
  }),
  uploader: one(users, {
    fields: [ticketAttachments.uploaderId],
    references: [users.id],
    relationName: 'AttachmentUploader',
  }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  customer: one(customers, {
    fields: [interactions.customerId],
    references: [customers.id],
  }),
  ticket: one(tickets, {
    fields: [interactions.ticketId],
    references: [tickets.id],
  }),
  comment: one(ticketComments, {
    fields: [interactions.commentId],
    references: [ticketComments.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  identities: many(customerIdentities),
  orders: many(orders),
  interactions: many(interactions),
  // Note: tickets don't have a direct customerId FK - they link via senderEmail
  contacts: many(contacts),
  qboSnapshots: many(qboCustomerSnapshots),
  opportunities: many(opportunities),
  calls: many(calls),
}));

export const customerIdentitiesRelations = relations(customerIdentities, ({ one }) => ({
  customer: one(customers, {
    fields: [customerIdentities.customerId],
    references: [customers.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  customer: one(customers, {
    fields: [opportunities.customerId],
    references: [customers.id],
  }),
  contact: one(contacts, {
    fields: [opportunities.contactId],
    references: [contacts.id],
  }),
  owner: one(users, {
    fields: [opportunities.ownerId],
    references: [users.id],
  }),
  calls: many(calls),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  customer: one(customers, {
    fields: [calls.customerId],
    references: [customers.id],
  }),
  contact: one(contacts, {
    fields: [calls.contactId],
    references: [contacts.id],
  }),
  opportunity: one(opportunities, {
    fields: [calls.opportunityId],
    references: [opportunities.id],
  }),
  ticket: one(tickets, {
    fields: [calls.ticketId],
    references: [tickets.id],
  }),
}));

export const slaPoliciesRelations = relations(slaPolicies, ({ many }) => ({
  tickets: many(tickets),
}));

// --- Quarantine Table ---
export const quarantineStatusEnum = ticketingProdSchema.enum('quarantine_status_enum', [
  'pending_review',
  'approved_ticket',
  'approved_comment',
  'rejected_spam',
  'rejected_vendor',
  'deleted'
]);

export const quarantinedEmails = ticketingProdSchema.table('quarantined_emails', {
  id: serial('id').primaryKey(),
  originalGraphMessageId: text('original_graph_message_id').notNull().unique(),
  internetMessageId: text('internet_message_id').notNull().unique(),
  senderEmail: varchar('sender_email', { length: 255 }).notNull(),
  senderName: varchar('sender_name', { length: 255 }),
  subject: varchar('subject', { length: 500 }).notNull(),
  bodyPreview: text('body_preview').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  aiClassification: boolean('ai_classification').notNull(),
  aiReason: text('ai_reason'),
  status: quarantineStatusEnum('status').default('pending_review').notNull(),
  reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Add relations for quarantinedEmails
export const quarantinedEmailsRelations = relations(quarantinedEmails, ({ one }) => ({
  reviewer: one(users, {
    fields: [quarantinedEmails.reviewerId],
    references: [users.id],
  }),
}));

export const agentProducts = ticketingProdSchema.table('agent_products', {
  id: serial('id').primaryKey(),
  product_id_shopify: bigint('product_id_shopify', { mode: 'bigint' }).notNull().unique(),
  name: varchar('name', { length: 512 }).notNull(),
  handle_shopify: varchar('handle_shopify', { length: 512 }),
  description: text('description'),
  product_type: varchar('product_type', { length: 256 }),
  vendor: varchar('vendor', { length: 256 }),
  tags: text('tags'),
  status: varchar('status', { length: 50 }).default('active'),
  page_url: text('page_url'),
  primary_image_url: text('primary_image_url'),
  is_active: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default({}),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

export const agentProductVariants = ticketingProdSchema.table('agent_product_variants', {
  id: serial('id').primaryKey(),
  agent_product_id: bigint('agent_product_id', { mode: 'bigint' }).notNull().references(() => agentProducts.id, { onDelete: 'cascade' }),
  variant_id_shopify: bigint('variant_id_shopify', { mode: 'bigint' }).notNull().unique(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  variant_title: varchar('variant_title', { length: 512 }).notNull(),
  display_name: varchar('display_name', { length: 512 }),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  inventory_quantity: bigint('inventory_quantity', { mode: 'bigint' }),
  weight: varchar('weight', { length: 50 }),
  weight_unit: varchar('weight_unit', { length: 20 }),
  taxable: boolean('taxable').default(true),
  requires_shipping: boolean('requires_shipping').default(true),
  is_active: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default({}),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

// --- Relations for agentProducts and agentProductVariants ---
interface AgentProductsRelationsConfig {
  variants: Many<'agent_product_variants'>;
}

export const agentProductsRelations = relations(agentProducts, ({ many }) => ({
  variants: many(agentProductVariants)
}));

interface AgentProductVariantsRelationsConfig {
  product: One<'agent_products'>;
}

export const agentProductVariantsRelations = relations(agentProductVariants, ({ one }) => ({
  product: one(agentProducts, {
    fields: [agentProductVariants.agent_product_id],
    references: [agentProducts.id]
  })
}));

// Add relations for userSignatures
export const userSignaturesRelations = relations(userSignatures, ({ one }) => ({
  user: one(users, {
    fields: [userSignatures.userId],
    references: [users.id],
  }),
}));

export const creditApplications = ticketingProdSchema.table('credit_applications', {
  id: serial('id').primaryKey(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  zipCode: varchar('zip_code', { length: 20 }).notNull(),
  taxId: varchar('tax_id', { length: 50 }),
  creditLimit: decimal('credit_limit', { precision: 10, scale: 2 }),
  bankReferences: text('bank_references'),
  tradeReferences: text('trade_references'),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by').references(() => users.id),
  notes: text('notes'),
  applicationForm: text('application_form'), // Store the form data as JSON
}, (table) => {
  return {
    emailIndex: index('idx_credit_applications_email').on(table.email),
    statusIndex: index('idx_credit_applications_status').on(table.status),
    submittedAtIndex: index('idx_credit_applications_submitted_at').on(table.submittedAt),
  };
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  creator: one(users, {
    fields: [subscriptions.creatorId],
    references: [users.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  customer: one(customers, {
    fields: [contacts.customerId],
    references: [customers.id],
  }),
}));

export const qboCustomerSnapshotsRelations = relations(qboCustomerSnapshots, ({ one }) => ({
  customer: one(customers, {
    fields: [qboCustomerSnapshots.customerId],
    references: [customers.id],
  }),
}));

export const sds = ticketingProdSchema.table('sds', {
  id: doublePrecision('id').primaryKey(),
  title: text('title').notNull(),
  sdsUrl: text('"Metafield: custom.safety_data_sheet [file_reference]"').notNull(),
});
