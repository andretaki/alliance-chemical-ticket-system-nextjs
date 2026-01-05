/**
 * Ticket Domain Events - The output of domain decisions.
 *
 * Events represent "facts" - things that have happened. They are:
 *
 * 1. Immutable - once created, never change
 * 2. Past-tense naming - TicketCreated, not CreateTicket
 * 3. Complete - contain all data needed to update state
 * 4. Auditable - can reconstruct history from events
 *
 * Events flow: Command -> decide() -> Event[] -> evolve() -> NewState
 */

import type {
  TicketId,
  UserId,
  CommentId,
  CustomerId,
  TicketStatus,
  TicketPriority,
  TicketType,
  SenderInfo,
  ShippingAddress,
} from './types';

// === Base event interface ===

interface BaseEvent {
  /** Discriminator for event type */
  readonly _type: string;
  /** Event timestamp (ISO string) */
  readonly occurredAt: string;
  /** User who caused this event (null for system events) */
  readonly causedBy: UserId | null;
  /** Ticket this event relates to */
  readonly ticketId: TicketId;
}

// === Lifecycle events ===

/** A new ticket was created */
export interface TicketCreatedEvent extends BaseEvent {
  readonly _type: 'TicketCreated';
  readonly title: string;
  readonly description: string | null;
  readonly priority: TicketPriority;
  readonly type: TicketType | null;
  readonly reporterId: UserId;
  readonly assigneeId: UserId | null;
  readonly sender: SenderInfo;
  readonly orderNumber: string | null;
  readonly trackingNumber: string | null;
  readonly externalMessageId: string | null;
  readonly conversationId: string | null;
  readonly shippingAddress: ShippingAddress | null;
  readonly customerId: CustomerId | null;
}

/** Ticket status changed */
export interface StatusTransitionedEvent extends BaseEvent {
  readonly _type: 'StatusTransitioned';
  readonly fromStatus: TicketStatus;
  readonly toStatus: TicketStatus;
  readonly reason: string | null;
}

/** Ticket was closed */
export interface TicketClosedEvent extends BaseEvent {
  readonly _type: 'TicketClosed';
  readonly previousStatus: TicketStatus;
  readonly resolution: string | null;
}

/** Ticket was reopened */
export interface TicketReopenedEvent extends BaseEvent {
  readonly _type: 'TicketReopened';
  readonly reason: string;
}

// === Assignment events ===

/** Ticket was assigned to a user */
export interface TicketAssignedEvent extends BaseEvent {
  readonly _type: 'TicketAssigned';
  readonly previousAssigneeId: UserId | null;
  readonly newAssigneeId: UserId;
}

/** Ticket was unassigned */
export interface TicketUnassignedEvent extends BaseEvent {
  readonly _type: 'TicketUnassigned';
  readonly previousAssigneeId: UserId;
}

// === Priority events ===

/** Ticket priority was changed */
export interface PriorityChangedEvent extends BaseEvent {
  readonly _type: 'PriorityChanged';
  readonly fromPriority: TicketPriority;
  readonly toPriority: TicketPriority;
  readonly reason: string | null;
}

/** Ticket was escalated (priority increased) */
export interface TicketEscalatedEvent extends BaseEvent {
  readonly _type: 'TicketEscalated';
  readonly fromPriority: TicketPriority;
  readonly toPriority: TicketPriority;
  readonly reason: string;
}

// === Comment events ===

/** A comment was added to the ticket */
export interface CommentAddedEvent extends BaseEvent {
  readonly _type: 'CommentAdded';
  readonly commentId: CommentId;
  readonly text: string;
  readonly isInternalNote: boolean;
  readonly isFromCustomer: boolean;
  readonly isOutgoingReply: boolean;
  readonly externalMessageId: string | null;
  readonly attachmentIds: readonly number[];
}

/** An email reply was queued for sending */
export interface EmailReplyQueuedEvent extends BaseEvent {
  readonly _type: 'EmailReplyQueued';
  readonly commentId: CommentId;
  readonly toEmail: string;
  readonly text: string;
  readonly attachmentIds: readonly number[];
}

// === Merge events ===

/** Ticket was merged into another */
export interface TicketMergedEvent extends BaseEvent {
  readonly _type: 'TicketMerged';
  readonly targetTicketId: TicketId;
  readonly reason: string | null;
}

// === Linking events ===

/** Ticket was linked to a customer */
export interface CustomerLinkedEvent extends BaseEvent {
  readonly _type: 'CustomerLinked';
  readonly customerId: CustomerId;
  readonly previousCustomerId: CustomerId | null;
}

/** Ticket was unlinked from customer */
export interface CustomerUnlinkedEvent extends BaseEvent {
  readonly _type: 'CustomerUnlinked';
  readonly previousCustomerId: CustomerId;
}

// === Update events ===

/** Ticket metadata was updated */
export interface TicketUpdatedEvent extends BaseEvent {
  readonly _type: 'TicketUpdated';
  readonly changes: {
    readonly title?: { from: string; to: string };
    readonly description?: { from: string | null; to: string };
    readonly type?: { from: TicketType | null; to: TicketType };
    readonly orderNumber?: { from: string | null; to: string | null };
    readonly trackingNumber?: { from: string | null; to: string | null };
  };
}

// === SLA events ===

/** First response was recorded */
export interface FirstResponseRecordedEvent extends BaseEvent {
  readonly _type: 'FirstResponseRecorded';
  readonly respondedAt: string;
  readonly wasWithinSla: boolean;
}

/** SLA was breached */
export interface SlaBreachedEvent extends BaseEvent {
  readonly _type: 'SlaBreached';
  readonly breachedAt: string;
  readonly reason: 'first_response' | 'resolution';
}

// === Union type of all events ===

export type TicketEvent =
  | TicketCreatedEvent
  | StatusTransitionedEvent
  | TicketClosedEvent
  | TicketReopenedEvent
  | TicketAssignedEvent
  | TicketUnassignedEvent
  | PriorityChangedEvent
  | TicketEscalatedEvent
  | CommentAddedEvent
  | EmailReplyQueuedEvent
  | TicketMergedEvent
  | CustomerLinkedEvent
  | CustomerUnlinkedEvent
  | TicketUpdatedEvent
  | FirstResponseRecordedEvent
  | SlaBreachedEvent;

// === Event type guards ===

export const isTicketCreated = (e: TicketEvent): e is TicketCreatedEvent =>
  e._type === 'TicketCreated';

export const isStatusTransitioned = (e: TicketEvent): e is StatusTransitionedEvent =>
  e._type === 'StatusTransitioned';

export const isCommentAdded = (e: TicketEvent): e is CommentAddedEvent =>
  e._type === 'CommentAdded';

export const isTicketClosed = (e: TicketEvent): e is TicketClosedEvent =>
  e._type === 'TicketClosed';

export const isTicketAssigned = (e: TicketEvent): e is TicketAssignedEvent =>
  e._type === 'TicketAssigned';

export const isPriorityChanged = (e: TicketEvent): e is PriorityChangedEvent =>
  e._type === 'PriorityChanged';

// === Event factory helpers ===

export const ticketCreated = (
  ticketId: TicketId,
  data: Omit<TicketCreatedEvent, '_type' | 'ticketId'>
): TicketCreatedEvent => ({
  _type: 'TicketCreated',
  ticketId,
  ...data,
});

export const statusTransitioned = (
  ticketId: TicketId,
  fromStatus: TicketStatus,
  toStatus: TicketStatus,
  causedBy: UserId | null,
  occurredAt: string,
  reason: string | null = null
): StatusTransitionedEvent => ({
  _type: 'StatusTransitioned',
  ticketId,
  fromStatus,
  toStatus,
  causedBy,
  occurredAt,
  reason,
});

export const commentAdded = (
  ticketId: TicketId,
  commentId: CommentId,
  text: string,
  causedBy: UserId | null,
  occurredAt: string,
  options: {
    isInternalNote?: boolean;
    isFromCustomer?: boolean;
    isOutgoingReply?: boolean;
    externalMessageId?: string | null;
    attachmentIds?: readonly number[];
  } = {}
): CommentAddedEvent => ({
  _type: 'CommentAdded',
  ticketId,
  commentId,
  text,
  causedBy,
  occurredAt,
  isInternalNote: options.isInternalNote ?? false,
  isFromCustomer: options.isFromCustomer ?? false,
  isOutgoingReply: options.isOutgoingReply ?? false,
  externalMessageId: options.externalMessageId ?? null,
  attachmentIds: options.attachmentIds ?? [],
});

export const ticketAssigned = (
  ticketId: TicketId,
  previousAssigneeId: UserId | null,
  newAssigneeId: UserId,
  causedBy: UserId | null,
  occurredAt: string
): TicketAssignedEvent => ({
  _type: 'TicketAssigned',
  ticketId,
  previousAssigneeId,
  newAssigneeId,
  causedBy,
  occurredAt,
});

export const priorityChanged = (
  ticketId: TicketId,
  fromPriority: TicketPriority,
  toPriority: TicketPriority,
  causedBy: UserId | null,
  occurredAt: string,
  reason: string | null = null
): PriorityChangedEvent => ({
  _type: 'PriorityChanged',
  ticketId,
  fromPriority,
  toPriority,
  causedBy,
  occurredAt,
  reason,
});

export const ticketClosed = (
  ticketId: TicketId,
  previousStatus: TicketStatus,
  causedBy: UserId | null,
  occurredAt: string,
  resolution: string | null = null
): TicketClosedEvent => ({
  _type: 'TicketClosed',
  ticketId,
  previousStatus,
  causedBy,
  occurredAt,
  resolution,
});

export const ticketMerged = (
  ticketId: TicketId,
  targetTicketId: TicketId,
  causedBy: UserId | null,
  occurredAt: string,
  reason: string | null = null
): TicketMergedEvent => ({
  _type: 'TicketMerged',
  ticketId,
  targetTicketId,
  causedBy,
  occurredAt,
  reason,
});
