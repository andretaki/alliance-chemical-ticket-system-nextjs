/**
 * Ticket Commands - Input DTOs for domain operations.
 *
 * Commands are "intents" - they describe what the user wants to do.
 * They are validated and transformed into events by the decide() function.
 *
 * Commands are:
 * 1. Serializable (no Date objects, just strings)
 * 2. Self-describing (discriminated union via _type)
 * 3. Minimal (only data needed for the decision)
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

// === Base command interface ===

interface BaseCommand {
  /** Discriminator for command type */
  readonly _type: string;
  /** User performing the action (null for system actions) */
  readonly actorId: UserId | null;
  /** Timestamp of the command (ISO string) */
  readonly timestamp: string;
}

// === Ticket lifecycle commands ===

/** Create a new ticket */
export interface CreateTicketCommand extends BaseCommand {
  readonly _type: 'CreateTicket';
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

/** Transition ticket status */
export interface TransitionStatusCommand extends BaseCommand {
  readonly _type: 'TransitionStatus';
  readonly ticketId: TicketId;
  readonly newStatus: TicketStatus;
  readonly reason: string | null;
}

/** Close a ticket */
export interface CloseTicketCommand extends BaseCommand {
  readonly _type: 'CloseTicket';
  readonly ticketId: TicketId;
  readonly resolution: string | null;
}

/** Reopen a closed ticket */
export interface ReopenTicketCommand extends BaseCommand {
  readonly _type: 'ReopenTicket';
  readonly ticketId: TicketId;
  readonly reason: string;
}

// === Assignment commands ===

/** Assign ticket to a user */
export interface AssignTicketCommand extends BaseCommand {
  readonly _type: 'AssignTicket';
  readonly ticketId: TicketId;
  readonly assigneeId: UserId;
}

/** Unassign ticket (remove assignee) */
export interface UnassignTicketCommand extends BaseCommand {
  readonly _type: 'UnassignTicket';
  readonly ticketId: TicketId;
}

// === Priority commands ===

/** Change ticket priority */
export interface ChangePriorityCommand extends BaseCommand {
  readonly _type: 'ChangePriority';
  readonly ticketId: TicketId;
  readonly newPriority: TicketPriority;
  readonly reason: string | null;
}

/** Escalate ticket priority (increase urgency) */
export interface EscalatePriorityCommand extends BaseCommand {
  readonly _type: 'EscalatePriority';
  readonly ticketId: TicketId;
  readonly reason: string;
}

// === Comment commands ===

/** Add a comment to the ticket */
export interface AddCommentCommand extends BaseCommand {
  readonly _type: 'AddComment';
  readonly ticketId: TicketId;
  readonly text: string;
  readonly isInternalNote: boolean;
  readonly isFromCustomer: boolean;
  readonly externalMessageId: string | null;
  /** Attachment IDs to link (infra will handle actual attachment) */
  readonly attachmentIds: readonly number[];
}

/** Add a reply that will be sent as email */
export interface AddEmailReplyCommand extends BaseCommand {
  readonly _type: 'AddEmailReply';
  readonly ticketId: TicketId;
  readonly text: string;
  readonly toEmail: string;
  /** Attachment IDs to include */
  readonly attachmentIds: readonly number[];
}

// === Merge commands ===

/** Merge this ticket into another ticket */
export interface MergeTicketCommand extends BaseCommand {
  readonly _type: 'MergeTicket';
  readonly sourceTicketId: TicketId;
  readonly targetTicketId: TicketId;
  readonly reason: string | null;
}

// === Linking commands ===

/** Link ticket to a customer */
export interface LinkToCustomerCommand extends BaseCommand {
  readonly _type: 'LinkToCustomer';
  readonly ticketId: TicketId;
  readonly customerId: CustomerId;
}

/** Unlink ticket from customer */
export interface UnlinkFromCustomerCommand extends BaseCommand {
  readonly _type: 'UnlinkFromCustomer';
  readonly ticketId: TicketId;
}

// === Update commands ===

/** Update ticket metadata */
export interface UpdateTicketCommand extends BaseCommand {
  readonly _type: 'UpdateTicket';
  readonly ticketId: TicketId;
  readonly title?: string;
  readonly description?: string;
  readonly type?: TicketType;
  readonly orderNumber?: string | null;
  readonly trackingNumber?: string | null;
}

// === SLA commands ===

/** Record first response (for SLA tracking) */
export interface RecordFirstResponseCommand extends BaseCommand {
  readonly _type: 'RecordFirstResponse';
  readonly ticketId: TicketId;
  readonly respondedAt: string; // ISO string
}

/** Mark SLA as breached */
export interface BreachSlaCommand extends BaseCommand {
  readonly _type: 'BreachSla';
  readonly ticketId: TicketId;
  readonly breachedAt: string; // ISO string
  readonly reason: 'first_response' | 'resolution';
}

// === Union type of all commands ===

export type TicketCommand =
  | CreateTicketCommand
  | TransitionStatusCommand
  | CloseTicketCommand
  | ReopenTicketCommand
  | AssignTicketCommand
  | UnassignTicketCommand
  | ChangePriorityCommand
  | EscalatePriorityCommand
  | AddCommentCommand
  | AddEmailReplyCommand
  | MergeTicketCommand
  | LinkToCustomerCommand
  | UnlinkFromCustomerCommand
  | UpdateTicketCommand
  | RecordFirstResponseCommand
  | BreachSlaCommand;

// === Command constructors (pure functions) ===

export const createTicket = (
  data: Omit<CreateTicketCommand, '_type'>
): CreateTicketCommand => ({
  _type: 'CreateTicket',
  ...data,
});

export const transitionStatus = (
  ticketId: TicketId,
  newStatus: TicketStatus,
  actorId: UserId,
  timestamp: string,
  reason: string | null = null
): TransitionStatusCommand => ({
  _type: 'TransitionStatus',
  ticketId,
  newStatus,
  actorId,
  timestamp,
  reason,
});

export const assignTicket = (
  ticketId: TicketId,
  assigneeId: UserId,
  actorId: UserId,
  timestamp: string
): AssignTicketCommand => ({
  _type: 'AssignTicket',
  ticketId,
  assigneeId,
  actorId,
  timestamp,
});

export const addComment = (
  ticketId: TicketId,
  text: string,
  actorId: UserId,
  timestamp: string,
  options: {
    isInternalNote?: boolean;
    isFromCustomer?: boolean;
    externalMessageId?: string | null;
    attachmentIds?: readonly number[];
  } = {}
): AddCommentCommand => ({
  _type: 'AddComment',
  ticketId,
  text,
  actorId,
  timestamp,
  isInternalNote: options.isInternalNote ?? false,
  isFromCustomer: options.isFromCustomer ?? false,
  externalMessageId: options.externalMessageId ?? null,
  attachmentIds: options.attachmentIds ?? [],
});

export const closeTicket = (
  ticketId: TicketId,
  actorId: UserId,
  timestamp: string,
  resolution: string | null = null
): CloseTicketCommand => ({
  _type: 'CloseTicket',
  ticketId,
  actorId,
  timestamp,
  resolution,
});

export const reopenTicket = (
  ticketId: TicketId,
  actorId: UserId,
  timestamp: string,
  reason: string
): ReopenTicketCommand => ({
  _type: 'ReopenTicket',
  ticketId,
  actorId,
  timestamp,
  reason,
});

export const changePriority = (
  ticketId: TicketId,
  newPriority: TicketPriority,
  actorId: UserId,
  timestamp: string,
  reason: string | null = null
): ChangePriorityCommand => ({
  _type: 'ChangePriority',
  ticketId,
  newPriority,
  actorId,
  timestamp,
  reason,
});

export const mergeTicket = (
  sourceTicketId: TicketId,
  targetTicketId: TicketId,
  actorId: UserId,
  timestamp: string,
  reason: string | null = null
): MergeTicketCommand => ({
  _type: 'MergeTicket',
  sourceTicketId,
  targetTicketId,
  actorId,
  timestamp,
  reason,
});

export const linkToCustomer = (
  ticketId: TicketId,
  customerId: CustomerId,
  actorId: UserId | null,
  timestamp: string
): LinkToCustomerCommand => ({
  _type: 'LinkToCustomer',
  ticketId,
  customerId,
  actorId,
  timestamp,
});
