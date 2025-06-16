  // src/db/schema.ts
import { serial, text, timestamp, varchar, pgEnum, integer, boolean, unique, pgSchema, primaryKey, check, vector, type PgTable, index, doublePrecision, type AnyPgColumn, time } from 'drizzle-orm/pg-core';
import { relations, type One, type Many } from 'drizzle-orm';
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
  sendercompany: varchar('sender_company', { length: 255 }),
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

  // --- NEW SLA-related fields ---
  slaPolicyId: integer('sla_policy_id').references(() => slaPolicies.id, { onDelete: 'set null' }),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }),
  resolutionDueAt: timestamp('resolution_due_at', { withTimezone: true }),
  slaBreached: boolean('sla_breached').default(false).notNull(),
  slaNotified: boolean('sla_notified').default(false).notNull(), // To prevent multiple notifications

  // --- NEW AI-related field ---
  aiSuggestedAction: aiSuggestedActionEnum('ai_suggested_action'),

}, (table) => {
  return {
    mergedIntoTicketIdIndex: index('idx_tickets_merged_into').on(table.mergedIntoTicketId),
    externalMessageIdKey: unique('tickets_mailgun_message_id_key').on(table.externalMessageId),
    conversationIdIndex: index('idx_tickets_conversation_id').on(table.conversationId),
    statusIndex: index('idx_tickets_status').on(table.status),
    priorityIndex: index('idx_tickets_priority').on(table.priority),
    typeIndex: index('idx_tickets_type').on(table.type),
    assigneeIdIndex: index('idx_tickets_assignee_id').on(table.assigneeId),
    reporterIdIndex: index('idx_tickets_reporter_id').on(table.reporterId),
    createdAtIndex: index('idx_tickets_created_at').on(table.createdAt),
    updatedAtIndex: index('idx_tickets_updated_at').on(table.updatedAt),
    statusPriorityIndex: index('idx_tickets_status_priority').on(table.status, table.priority),
    assigneeStatusIndex: index('idx_tickets_assignee_status').on(table.assigneeId, table.status),
    reporterStatusIndex: index('idx_tickets_reporter_status').on(table.reporterId, table.status),
    // --- NEW INDEXES ---
    slaPolicyIdIndex: index('idx_tickets_sla_policy_id').on(table.slaPolicyId),
    slaStatusIndex: index('idx_tickets_sla_status').on(table.status, table.slaBreached),
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

export const sds = ticketingProdSchema.table('sds', {
  id: doublePrecision('id').primaryKey(),
  title: text('title').notNull(),
  sdsUrl: text('"Metafield: custom.safety_data_sheet [file_reference]"').notNull(),
});