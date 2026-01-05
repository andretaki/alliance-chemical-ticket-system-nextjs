/**
 * Ticket Domain - State Evolution Functions
 *
 * The evolve() function applies events to state to produce new state.
 * This is the "fold" part of event sourcing:
 *
 *   newState = events.reduce(evolve, initialState)
 *
 * Key properties:
 * 1. PURE - no side effects
 * 2. IMMUTABLE - returns new state, never mutates input
 * 3. TOTAL - handles all event types
 */

import type { TicketEvent } from './events';
import type { TicketState, TicketId, UserId, CustomerId } from './types';
import { emptyTicketState } from './types';

/**
 * Apply a single event to state, returning new state.
 *
 * This function is pure and never mutates the input state.
 */
export function evolve(state: TicketState, event: TicketEvent): TicketState {
  switch (event._type) {
    case 'TicketCreated':
      return {
        ...state,
        id: event.ticketId,
        status: 'new',
        priority: event.priority,
        assigneeId: event.assigneeId,
        reporterId: event.reporterId,
        customerId: event.customerId,
        commentCount: 0,
        hasFirstResponse: false,
        slaBreached: false,
        mergedIntoTicketId: null,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      };

    case 'StatusTransitioned':
      return {
        ...state,
        status: event.toStatus,
        updatedAt: event.occurredAt,
      };

    case 'TicketClosed':
      return {
        ...state,
        status: 'closed',
        updatedAt: event.occurredAt,
      };

    case 'TicketReopened':
      return {
        ...state,
        status: 'open', // Will be updated by subsequent StatusTransitioned event
        updatedAt: event.occurredAt,
      };

    case 'TicketAssigned':
      return {
        ...state,
        assigneeId: event.newAssigneeId,
        updatedAt: event.occurredAt,
      };

    case 'TicketUnassigned':
      return {
        ...state,
        assigneeId: null,
        updatedAt: event.occurredAt,
      };

    case 'PriorityChanged':
      return {
        ...state,
        priority: event.toPriority,
        updatedAt: event.occurredAt,
      };

    case 'TicketEscalated':
      return {
        ...state,
        priority: event.toPriority,
        updatedAt: event.occurredAt,
      };

    case 'CommentAdded':
      return {
        ...state,
        commentCount: state.commentCount + 1,
        // First non-customer, non-internal comment is first response
        hasFirstResponse: state.hasFirstResponse || (!event.isFromCustomer && !event.isInternalNote),
        updatedAt: event.occurredAt,
      };

    case 'EmailReplyQueued':
      // Email reply is also a form of response
      return {
        ...state,
        hasFirstResponse: true,
        updatedAt: event.occurredAt,
      };

    case 'TicketMerged':
      return {
        ...state,
        mergedIntoTicketId: event.targetTicketId,
        status: 'closed', // Merged tickets are closed
        updatedAt: event.occurredAt,
      };

    case 'CustomerLinked':
      return {
        ...state,
        customerId: event.customerId,
        updatedAt: event.occurredAt,
      };

    case 'CustomerUnlinked':
      return {
        ...state,
        customerId: null,
        updatedAt: event.occurredAt,
      };

    case 'TicketUpdated':
      return {
        ...state,
        updatedAt: event.occurredAt,
      };

    case 'FirstResponseRecorded':
      return {
        ...state,
        hasFirstResponse: true,
        updatedAt: event.occurredAt,
      };

    case 'SlaBreached':
      return {
        ...state,
        slaBreached: true,
        updatedAt: event.occurredAt,
      };

    default:
      // Exhaustiveness check - TypeScript will error if we miss a case
      const _exhaustive: never = event;
      return state;
  }
}

/**
 * Apply multiple events to state, returning final state.
 *
 * This is the "fold left" operation from functional programming.
 */
export function evolveAll(state: TicketState, events: readonly TicketEvent[]): TicketState {
  return events.reduce(evolve, state);
}

/**
 * Reconstitute state from a stream of events.
 *
 * Useful for event-sourced aggregates where we replay all events
 * to get current state.
 */
export function reconstituteFromEvents(events: readonly TicketEvent[]): TicketState {
  return evolveAll(emptyTicketState(), events);
}

/**
 * Check if state has been modified by comparing with a baseline.
 */
export function hasStateChanged(before: TicketState, after: TicketState): boolean {
  return (
    before.status !== after.status ||
    before.priority !== after.priority ||
    before.assigneeId !== after.assigneeId ||
    before.customerId !== after.customerId ||
    before.commentCount !== after.commentCount ||
    before.hasFirstResponse !== after.hasFirstResponse ||
    before.slaBreached !== after.slaBreached ||
    before.mergedIntoTicketId !== after.mergedIntoTicketId
  );
}

/** Mutable version of TicketState for building change objects */
type MutableTicketState = {
  -readonly [K in keyof TicketState]: TicketState[K];
};

/**
 * Extract just the changes between two states.
 */
export function getStateChanges(
  before: TicketState,
  after: TicketState
): Partial<MutableTicketState> {
  const changes: Partial<MutableTicketState> = {};

  if (before.status !== after.status) {
    changes.status = after.status;
  }
  if (before.priority !== after.priority) {
    changes.priority = after.priority;
  }
  if (before.assigneeId !== after.assigneeId) {
    changes.assigneeId = after.assigneeId;
  }
  if (before.customerId !== after.customerId) {
    changes.customerId = after.customerId;
  }
  if (before.commentCount !== after.commentCount) {
    changes.commentCount = after.commentCount;
  }
  if (before.hasFirstResponse !== after.hasFirstResponse) {
    changes.hasFirstResponse = after.hasFirstResponse;
  }
  if (before.slaBreached !== after.slaBreached) {
    changes.slaBreached = after.slaBreached;
  }
  if (before.mergedIntoTicketId !== after.mergedIntoTicketId) {
    changes.mergedIntoTicketId = after.mergedIntoTicketId;
  }
  if (before.updatedAt !== after.updatedAt) {
    changes.updatedAt = after.updatedAt;
  }

  return changes;
}
