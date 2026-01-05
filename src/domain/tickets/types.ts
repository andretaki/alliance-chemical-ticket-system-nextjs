/**
 * Ticket Domain Types - Pure domain model for tickets.
 *
 * These types represent the domain's view of tickets, independent of
 * any database schema or external system. They are:
 *
 * 1. Pure - no side effects, no Date.now(), no DB
 * 2. Immutable - all fields are readonly
 * 3. Serializable - can be JSON.stringify'd
 */

// === Value Objects ===

/** Ticket status - represents the lifecycle state */
export type TicketStatus = 'new' | 'open' | 'in_progress' | 'pending_customer' | 'closed';

/** Ticket priority levels */
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

/** E-commerce ticket types */
export type TicketType =
  | 'Return'
  | 'Shipping Issue'
  | 'Order Issue'
  | 'New Order'
  | 'Credit Request'
  | 'COA Request'
  | 'COC Request'
  | 'SDS Request'
  | 'Quote Request'
  | 'Purchase Order'
  | 'General Inquiry'
  | 'Test Entry'
  | 'International Shipping';

/** Sentiment analysis result */
export type TicketSentiment = 'positive' | 'neutral' | 'negative';

/** AI-suggested actions */
export type AiSuggestedAction =
  | 'CREATE_QUOTE'
  | 'CHECK_ORDER_STATUS'
  | 'DOCUMENT_REQUEST'
  | 'GENERAL_REPLY';

// === Entity IDs (branded types for type safety) ===

export type TicketId = number & { readonly _brand: 'TicketId' };
export type UserId = string & { readonly _brand: 'UserId' };
export type CommentId = number & { readonly _brand: 'CommentId' };
export type AttachmentId = number & { readonly _brand: 'AttachmentId' };
export type CustomerId = number & { readonly _brand: 'CustomerId' };

// === Domain Entities ===

/** User reference (minimal user data needed by domain) */
export interface UserRef {
  readonly id: UserId;
  readonly name: string | null;
  readonly email: string | null;
}

/** Attachment reference (metadata only - actual file is infrastructure concern) */
export interface AttachmentRef {
  readonly id: AttachmentId;
  readonly filename: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly uploadedAt: string; // ISO string
}

/** Comment on a ticket */
export interface TicketComment {
  readonly id: CommentId;
  readonly ticketId: TicketId;
  readonly text: string;
  readonly createdAt: string; // ISO string
  readonly commenter: UserRef | null;
  readonly isInternalNote: boolean;
  readonly isFromCustomer: boolean;
  readonly isOutgoingReply: boolean;
  readonly externalMessageId: string | null;
  readonly attachments: readonly AttachmentRef[];
}

/** Sender information (for tickets from external emails) */
export interface SenderInfo {
  readonly email: string | null;
  readonly name: string | null;
  readonly phone: string | null;
  readonly company: string | null;
}

/** Shipping address */
export interface ShippingAddress {
  readonly name: string | null;
  readonly company: string | null;
  readonly country: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly addressLine3: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
}

/** SLA information */
export interface SlaInfo {
  readonly policyId: number | null;
  readonly firstResponseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly firstResponseAt: string | null;
  readonly breached: boolean;
  readonly notified: boolean;
}

/** AI analysis results */
export interface AiAnalysis {
  readonly sentiment: TicketSentiment | null;
  readonly summary: string | null;
  readonly suggestedAssigneeId: UserId | null;
  readonly suggestedAction: AiSuggestedAction | null;
}

/**
 * Ticket Aggregate - the core domain entity.
 *
 * This is the "aggregate root" for tickets. All ticket operations
 * go through this entity to ensure invariants are maintained.
 */
export interface Ticket {
  readonly id: TicketId;
  readonly title: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly type: TicketType | null;

  // Timestamps (ISO strings)
  readonly createdAt: string;
  readonly updatedAt: string;

  // Users
  readonly reporterId: UserId;
  readonly assigneeId: UserId | null;

  // External sender info
  readonly sender: SenderInfo;

  // Email threading
  readonly externalMessageId: string | null;
  readonly conversationId: string | null;

  // Business context
  readonly orderNumber: string | null;
  readonly trackingNumber: string | null;
  readonly shippingAddress: ShippingAddress | null;

  // CRM links
  readonly customerId: CustomerId | null;
  readonly opportunityId: number | null;

  // Merge tracking
  readonly mergedIntoTicketId: TicketId | null;

  // SLA
  readonly sla: SlaInfo;

  // AI
  readonly ai: AiAnalysis;

  // Comments are part of the aggregate
  readonly comments: readonly TicketComment[];

  // Attachments directly on ticket (not on comments)
  readonly attachments: readonly AttachmentRef[];
}

// === State Snapshot (for decide/evolve) ===

/**
 * Minimal ticket state needed for decisions.
 * This is what we load from the database and pass to decide().
 */
export interface TicketState {
  readonly id: TicketId | null; // null for new tickets
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly assigneeId: UserId | null;
  readonly reporterId: UserId | null;
  readonly customerId: CustomerId | null;
  readonly commentCount: number;
  readonly hasFirstResponse: boolean;
  readonly slaBreached: boolean;
  readonly mergedIntoTicketId: TicketId | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

// === Factory functions ===

/** Create a new empty ticket state */
export const emptyTicketState = (): TicketState => ({
  id: null,
  status: 'new',
  priority: 'medium',
  assigneeId: null,
  reporterId: null,
  customerId: null,
  commentCount: 0,
  hasFirstResponse: false,
  slaBreached: false,
  mergedIntoTicketId: null,
  createdAt: null,
  updatedAt: null,
});

// === Type guards ===

export const isOpenStatus = (status: TicketStatus): boolean =>
  status !== 'closed';

export const isEscalatablePriority = (priority: TicketPriority): boolean =>
  priority !== 'urgent';

export const canBeMerged = (state: TicketState): boolean =>
  state.mergedIntoTicketId === null && state.status !== 'closed';

export const canBeReopened = (state: TicketState): boolean =>
  state.status === 'closed' && state.mergedIntoTicketId === null;

// === Status transition rules ===

/** Valid status transitions */
export const VALID_STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['open', 'in_progress', 'pending_customer', 'closed'],
  open: ['in_progress', 'pending_customer', 'closed'],
  in_progress: ['open', 'pending_customer', 'closed'],
  pending_customer: ['open', 'in_progress', 'closed'],
  closed: ['open'], // Reopen only
} as const;

export const canTransitionTo = (from: TicketStatus, to: TicketStatus): boolean =>
  VALID_STATUS_TRANSITIONS[from].includes(to);

// === Priority escalation rules ===

export const PRIORITY_ESCALATION_ORDER: readonly TicketPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

export const canEscalatePriority = (from: TicketPriority, to: TicketPriority): boolean => {
  const fromIndex = PRIORITY_ESCALATION_ORDER.indexOf(from);
  const toIndex = PRIORITY_ESCALATION_ORDER.indexOf(to);
  return toIndex > fromIndex;
};

export const canDeescalatePriority = (from: TicketPriority, to: TicketPriority): boolean => {
  const fromIndex = PRIORITY_ESCALATION_ORDER.indexOf(from);
  const toIndex = PRIORITY_ESCALATION_ORDER.indexOf(to);
  return toIndex < fromIndex;
};
