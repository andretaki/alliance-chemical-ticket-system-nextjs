/**
 * Ticket Domain - Decision Functions
 *
 * This is the heart of the domain logic. The decide() function takes:
 * - A command (what the user wants to do)
 * - Current state (what we know about the ticket)
 *
 * And returns:
 * - Result<DomainError, TicketEvent[]>
 *
 * Key properties:
 * 1. PURE - no side effects, no I/O, no Date.now()
 * 2. DETERMINISTIC - same inputs always produce same outputs
 * 3. TOTAL - handles all possible inputs (no exceptions)
 * 4. TESTABLE - can test every edge case
 */

import { type Result, ok, err } from '@domain/shared/result';
import type { TicketCommand, CreateTicketCommand, TransitionStatusCommand, AssignTicketCommand, AddCommentCommand, CloseTicketCommand, ReopenTicketCommand, ChangePriorityCommand, MergeTicketCommand, AddEmailReplyCommand, LinkToCustomerCommand, UnlinkFromCustomerCommand, UnassignTicketCommand, UpdateTicketCommand } from './commands';
import type { TicketEvent, CommentAddedEvent, TicketCreatedEvent, StatusTransitionedEvent } from './events';
import {
  ticketCreated,
  statusTransitioned,
  commentAdded,
  ticketAssigned,
  priorityChanged,
  ticketClosed,
  ticketMerged,
} from './events';
import type { TicketState, TicketId, CommentId } from './types';
import { canTransitionTo, canBeMerged, canBeReopened, VALID_STATUS_TRANSITIONS } from './types';

// === Domain Errors ===

export type DomainError =
  | { readonly code: 'INVALID_STATUS_TRANSITION'; readonly message: string; readonly from: string; readonly to: string }
  | { readonly code: 'TICKET_ALREADY_CLOSED'; readonly message: string }
  | { readonly code: 'TICKET_NOT_CLOSED'; readonly message: string }
  | { readonly code: 'TICKET_ALREADY_MERGED'; readonly message: string }
  | { readonly code: 'CANNOT_MERGE_INTO_SELF'; readonly message: string }
  | { readonly code: 'CANNOT_MERGE_CLOSED_TICKET'; readonly message: string }
  | { readonly code: 'TICKET_NOT_FOUND'; readonly message: string }
  | { readonly code: 'ASSIGNEE_REQUIRED'; readonly message: string }
  | { readonly code: 'SAME_ASSIGNEE'; readonly message: string }
  | { readonly code: 'ALREADY_UNASSIGNED'; readonly message: string }
  | { readonly code: 'SAME_PRIORITY'; readonly message: string }
  | { readonly code: 'COMMENT_EMPTY'; readonly message: string }
  | { readonly code: 'TITLE_REQUIRED'; readonly message: string }
  | { readonly code: 'REPORTER_REQUIRED'; readonly message: string }
  | { readonly code: 'ALREADY_LINKED_TO_CUSTOMER'; readonly message: string }
  | { readonly code: 'NO_CUSTOMER_LINKED'; readonly message: string };

// === Error constructors ===

const invalidStatusTransition = (from: string, to: string): DomainError => ({
  code: 'INVALID_STATUS_TRANSITION',
  message: `Cannot transition from '${from}' to '${to}'. Valid transitions from '${from}': ${VALID_STATUS_TRANSITIONS[from as keyof typeof VALID_STATUS_TRANSITIONS]?.join(', ') || 'none'}`,
  from,
  to,
});

const ticketAlreadyClosed = (): DomainError => ({
  code: 'TICKET_ALREADY_CLOSED',
  message: 'Ticket is already closed',
});

const ticketNotClosed = (): DomainError => ({
  code: 'TICKET_NOT_CLOSED',
  message: 'Cannot reopen a ticket that is not closed',
});

const ticketAlreadyMerged = (): DomainError => ({
  code: 'TICKET_ALREADY_MERGED',
  message: 'This ticket has already been merged into another ticket',
});

const cannotMergeIntoSelf = (): DomainError => ({
  code: 'CANNOT_MERGE_INTO_SELF',
  message: 'Cannot merge a ticket into itself',
});

const cannotMergeClosedTicket = (): DomainError => ({
  code: 'CANNOT_MERGE_CLOSED_TICKET',
  message: 'Cannot merge a closed ticket',
});

const assigneeRequired = (): DomainError => ({
  code: 'ASSIGNEE_REQUIRED',
  message: 'Assignee is required',
});

const sameAssignee = (): DomainError => ({
  code: 'SAME_ASSIGNEE',
  message: 'Ticket is already assigned to this user',
});

const alreadyUnassigned = (): DomainError => ({
  code: 'ALREADY_UNASSIGNED',
  message: 'Ticket is already unassigned',
});

const samePriority = (): DomainError => ({
  code: 'SAME_PRIORITY',
  message: 'Ticket already has this priority',
});

const commentEmpty = (): DomainError => ({
  code: 'COMMENT_EMPTY',
  message: 'Comment text cannot be empty',
});

const titleRequired = (): DomainError => ({
  code: 'TITLE_REQUIRED',
  message: 'Title is required',
});

const reporterRequired = (): DomainError => ({
  code: 'REPORTER_REQUIRED',
  message: 'Reporter is required',
});

const alreadyLinkedToCustomer = (): DomainError => ({
  code: 'ALREADY_LINKED_TO_CUSTOMER',
  message: 'Ticket is already linked to this customer',
});

// === Context needed by decide (injected dependencies) ===

export interface DecideContext {
  /** Generate a new ticket ID */
  readonly generateTicketId: () => TicketId;
  /** Generate a new comment ID */
  readonly generateCommentId: () => CommentId;
}

// === Main decide function ===

/**
 * Decide what events should be emitted based on a command and current state.
 *
 * This is the core domain logic - pure, testable, no side effects.
 */
export function decide(
  command: TicketCommand,
  state: TicketState,
  context: DecideContext
): Result<DomainError, TicketEvent[]> {
  switch (command._type) {
    case 'CreateTicket':
      return decideCreateTicket(command, context);

    case 'TransitionStatus':
      return decideTransitionStatus(command, state);

    case 'CloseTicket':
      return decideCloseTicket(command, state);

    case 'ReopenTicket':
      return decideReopenTicket(command, state);

    case 'AssignTicket':
      return decideAssignTicket(command, state);

    case 'UnassignTicket':
      return decideUnassignTicket(command, state);

    case 'ChangePriority':
      return decideChangePriority(command, state);

    case 'EscalatePriority':
      // Escalate always goes to 'urgent'
      return decideChangePriority(
        { ...command, _type: 'ChangePriority', newPriority: 'urgent' },
        state
      );

    case 'AddComment':
      return decideAddComment(command, state, context);

    case 'AddEmailReply':
      return decideAddEmailReply(command, state, context);

    case 'MergeTicket':
      return decideMergeTicket(command, state);

    case 'LinkToCustomer':
      return decideLinkToCustomer(command, state);

    case 'UnlinkFromCustomer':
      return decideUnlinkFromCustomer(command, state);

    case 'UpdateTicket':
      return decideUpdateTicket(command, state);

    case 'RecordFirstResponse':
      // Allow recording first response
      return ok([{
        _type: 'FirstResponseRecorded' as const,
        ticketId: command.ticketId,
        causedBy: command.actorId,
        occurredAt: command.timestamp,
        respondedAt: command.respondedAt,
        wasWithinSla: !state.slaBreached,
      }]);

    case 'BreachSla':
      return ok([{
        _type: 'SlaBreached' as const,
        ticketId: command.ticketId,
        causedBy: command.actorId,
        occurredAt: command.timestamp,
        breachedAt: command.breachedAt,
        reason: command.reason,
      }]);
  }
}

// === Individual decision functions ===

function decideCreateTicket(
  cmd: CreateTicketCommand,
  context: DecideContext
): Result<DomainError, TicketEvent[]> {
  // Validate required fields
  if (!cmd.title || cmd.title.trim() === '') {
    return err(titleRequired());
  }

  if (!cmd.reporterId) {
    return err(reporterRequired());
  }

  const ticketId = context.generateTicketId();

  const event: TicketCreatedEvent = {
    _type: 'TicketCreated',
    ticketId,
    occurredAt: cmd.timestamp,
    causedBy: cmd.actorId,
    title: cmd.title.trim(),
    description: cmd.description,
    priority: cmd.priority,
    type: cmd.type,
    reporterId: cmd.reporterId,
    assigneeId: cmd.assigneeId,
    sender: cmd.sender,
    orderNumber: cmd.orderNumber,
    trackingNumber: cmd.trackingNumber,
    externalMessageId: cmd.externalMessageId,
    conversationId: cmd.conversationId,
    shippingAddress: cmd.shippingAddress,
    customerId: cmd.customerId,
  };

  const events: TicketEvent[] = [event];

  // If assignee is set, also emit assignment event
  if (cmd.assigneeId) {
    events.push(ticketAssigned(
      ticketId,
      null,
      cmd.assigneeId,
      cmd.actorId,
      cmd.timestamp
    ));
  }

  return ok(events);
}

function decideTransitionStatus(
  cmd: TransitionStatusCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  // Same status is a no-op (check this first!)
  if (state.status === cmd.newStatus) {
    return ok([]);
  }

  // Check if transition is valid
  if (!canTransitionTo(state.status, cmd.newStatus)) {
    return err(invalidStatusTransition(state.status, cmd.newStatus));
  }

  return ok([
    statusTransitioned(
      cmd.ticketId,
      state.status,
      cmd.newStatus,
      cmd.actorId,
      cmd.timestamp,
      cmd.reason
    ),
  ]);
}

function decideCloseTicket(
  cmd: CloseTicketCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (state.status === 'closed') {
    return err(ticketAlreadyClosed());
  }

  return ok([
    ticketClosed(
      cmd.ticketId,
      state.status,
      cmd.actorId,
      cmd.timestamp,
      cmd.resolution
    ),
  ]);
}

function decideReopenTicket(
  cmd: ReopenTicketCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (!canBeReopened(state)) {
    if (state.status !== 'closed') {
      return err(ticketNotClosed());
    }
    if (state.mergedIntoTicketId !== null) {
      return err(ticketAlreadyMerged());
    }
  }

  return ok([
    {
      _type: 'TicketReopened' as const,
      ticketId: cmd.ticketId,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
      reason: cmd.reason,
    },
    statusTransitioned(
      cmd.ticketId,
      'closed',
      'open',
      cmd.actorId,
      cmd.timestamp,
      `Reopened: ${cmd.reason}`
    ),
  ]);
}

function decideAssignTicket(
  cmd: AssignTicketCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (!cmd.assigneeId) {
    return err(assigneeRequired());
  }

  if (state.assigneeId === cmd.assigneeId) {
    return err(sameAssignee());
  }

  const events: TicketEvent[] = [
    ticketAssigned(
      cmd.ticketId,
      state.assigneeId,
      cmd.assigneeId,
      cmd.actorId,
      cmd.timestamp
    ),
  ];

  // Auto-transition to in_progress if new and being assigned
  if (state.status === 'new') {
    events.push(
      statusTransitioned(
        cmd.ticketId,
        'new',
        'in_progress',
        cmd.actorId,
        cmd.timestamp,
        'Auto-transitioned on assignment'
      )
    );
  }

  return ok(events);
}

function decideUnassignTicket(
  cmd: UnassignTicketCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (!state.assigneeId) {
    return err(alreadyUnassigned());
  }

  return ok([
    {
      _type: 'TicketUnassigned' as const,
      ticketId: cmd.ticketId,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
      previousAssigneeId: state.assigneeId,
    },
  ]);
}

function decideChangePriority(
  cmd: ChangePriorityCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (state.priority === cmd.newPriority) {
    return err(samePriority());
  }

  return ok([
    priorityChanged(
      cmd.ticketId,
      state.priority,
      cmd.newPriority,
      cmd.actorId,
      cmd.timestamp,
      cmd.reason
    ),
  ]);
}

function decideAddComment(
  cmd: AddCommentCommand,
  state: TicketState,
  context: DecideContext
): Result<DomainError, TicketEvent[]> {
  // Validate comment text
  if (!cmd.text || cmd.text.trim() === '') {
    return err(commentEmpty());
  }

  const commentId = context.generateCommentId();

  const events: TicketEvent[] = [
    commentAdded(
      cmd.ticketId,
      commentId,
      cmd.text.trim(),
      cmd.actorId,
      cmd.timestamp,
      {
        isInternalNote: cmd.isInternalNote,
        isFromCustomer: cmd.isFromCustomer,
        isOutgoingReply: false,
        externalMessageId: cmd.externalMessageId,
        attachmentIds: cmd.attachmentIds,
      }
    ),
  ];

  // Customer reply auto-transitions from pending_customer to open
  if (cmd.isFromCustomer && state.status === 'pending_customer') {
    events.push(
      statusTransitioned(
        cmd.ticketId,
        'pending_customer',
        'open',
        cmd.actorId,
        cmd.timestamp,
        'Auto-transitioned on customer reply'
      )
    );
  }

  return ok(events);
}

function decideAddEmailReply(
  cmd: AddEmailReplyCommand,
  state: TicketState,
  context: DecideContext
): Result<DomainError, TicketEvent[]> {
  if (!cmd.text || cmd.text.trim() === '') {
    return err(commentEmpty());
  }

  const commentId = context.generateCommentId();

  const events: TicketEvent[] = [
    commentAdded(
      cmd.ticketId,
      commentId,
      cmd.text.trim(),
      cmd.actorId,
      cmd.timestamp,
      {
        isInternalNote: false,
        isFromCustomer: false,
        isOutgoingReply: true,
        externalMessageId: null,
        attachmentIds: cmd.attachmentIds,
      }
    ),
    {
      _type: 'EmailReplyQueued' as const,
      ticketId: cmd.ticketId,
      commentId,
      toEmail: cmd.toEmail,
      text: cmd.text.trim(),
      attachmentIds: cmd.attachmentIds,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
    },
  ];

  // After reply, transition to pending_customer
  if (state.status === 'open' || state.status === 'in_progress') {
    events.push(
      statusTransitioned(
        cmd.ticketId,
        state.status,
        'pending_customer',
        cmd.actorId,
        cmd.timestamp,
        'Auto-transitioned after sending reply'
      )
    );
  }

  return ok(events);
}

function decideMergeTicket(
  cmd: MergeTicketCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  // Can't merge into self
  if (cmd.sourceTicketId === cmd.targetTicketId) {
    return err(cannotMergeIntoSelf());
  }

  // Can't merge if already merged
  if (!canBeMerged(state)) {
    if (state.mergedIntoTicketId !== null) {
      return err(ticketAlreadyMerged());
    }
    if (state.status === 'closed') {
      return err(cannotMergeClosedTicket());
    }
  }

  return ok([
    ticketMerged(
      cmd.sourceTicketId,
      cmd.targetTicketId,
      cmd.actorId,
      cmd.timestamp,
      cmd.reason
    ),
    ticketClosed(
      cmd.sourceTicketId,
      state.status,
      cmd.actorId,
      cmd.timestamp,
      `Merged into ticket #${cmd.targetTicketId}`
    ),
  ]);
}

function decideLinkToCustomer(
  cmd: LinkToCustomerCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (state.customerId === cmd.customerId) {
    return err(alreadyLinkedToCustomer());
  }

  return ok([
    {
      _type: 'CustomerLinked' as const,
      ticketId: cmd.ticketId,
      customerId: cmd.customerId,
      previousCustomerId: state.customerId,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
    },
  ]);
}

function decideUnlinkFromCustomer(
  cmd: UnlinkFromCustomerCommand,
  state: TicketState
): Result<DomainError, TicketEvent[]> {
  if (!state.customerId) {
    return err({
      code: 'NO_CUSTOMER_LINKED',
      message: 'Ticket is not linked to any customer',
    });
  }

  return ok([
    {
      _type: 'CustomerUnlinked' as const,
      ticketId: cmd.ticketId,
      previousCustomerId: state.customerId,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
    },
  ]);
}

function decideUpdateTicket(
  cmd: UpdateTicketCommand,
  _state: TicketState
): Result<DomainError, TicketEvent[]> {
  // Build changes object (we'd need current values from state in real impl)
  // For now, just emit the update event
  return ok([
    {
      _type: 'TicketUpdated' as const,
      ticketId: cmd.ticketId,
      causedBy: cmd.actorId,
      occurredAt: cmd.timestamp,
      changes: {
        ...(cmd.title !== undefined && { title: { from: '', to: cmd.title } }),
        ...(cmd.description !== undefined && { description: { from: null, to: cmd.description } }),
        ...(cmd.type !== undefined && { type: { from: null, to: cmd.type } }),
        ...(cmd.orderNumber !== undefined && { orderNumber: { from: null, to: cmd.orderNumber } }),
        ...(cmd.trackingNumber !== undefined && { trackingNumber: { from: null, to: cmd.trackingNumber } }),
      },
    },
  ]);
}
