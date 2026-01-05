/**
 * Tests for Ticket Domain - decide() and evolve() functions.
 *
 * These tests verify the business rules of the ticket system:
 * - Status transitions
 * - Assignment rules
 * - Comment handling
 * - Priority changes
 * - Merge behavior
 *
 * All tests are deterministic because domain is pure.
 */

import { isOk, isErr, unwrap, unwrapErr } from '@domain/shared/result';
import {
  decide,
  evolve,
  evolveAll,
  emptyTicketState,
  type TicketState,
  type TicketId,
  type UserId,
  type CommentId,
  type CustomerId,
  type DecideContext,
  type DomainError,
  type CreateTicketCommand,
  type TransitionStatusCommand,
  type AddCommentCommand,
  type AssignTicketCommand,
  type CloseTicketCommand,
  type MergeTicketCommand,
  type ReopenTicketCommand,
  type ChangePriorityCommand,
  VALID_STATUS_TRANSITIONS,
} from '@domain/tickets';

// === Test Fixtures ===

const NOW = '2024-01-15T10:00:00.000Z';
const LATER = '2024-01-15T11:00:00.000Z';

const ACTOR_ID = 'user-123' as UserId;
const ASSIGNEE_ID = 'user-456' as UserId;
const REPORTER_ID = 'user-789' as UserId;
const TICKET_ID = 1 as TicketId;
const CUSTOMER_ID = 100 as CustomerId;

// Deterministic ID generators for testing
let ticketIdCounter = 1;
let commentIdCounter = 1;

const createTestContext = (): DecideContext => ({
  generateTicketId: () => ticketIdCounter++ as TicketId,
  generateCommentId: () => commentIdCounter++ as CommentId,
});

const resetCounters = () => {
  ticketIdCounter = 1;
  commentIdCounter = 1;
};

// Factory for creating test ticket state
const createTicketState = (overrides: Partial<TicketState> = {}): TicketState => ({
  ...emptyTicketState(),
  id: TICKET_ID,
  status: 'new',
  priority: 'medium',
  reporterId: REPORTER_ID,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

// Factory for CreateTicketCommand
const createCreateTicketCommand = (
  overrides: Partial<CreateTicketCommand> = {}
): CreateTicketCommand => ({
  _type: 'CreateTicket',
  actorId: ACTOR_ID,
  timestamp: NOW,
  title: 'Test Ticket',
  description: 'Test description',
  priority: 'medium',
  type: 'General Inquiry',
  reporterId: REPORTER_ID,
  assigneeId: null,
  sender: {
    email: 'customer@example.com',
    name: 'Customer Name',
    phone: null,
    company: null,
  },
  orderNumber: null,
  trackingNumber: null,
  externalMessageId: null,
  conversationId: null,
  shippingAddress: null,
  customerId: null,
  ...overrides,
});

// === Tests ===

describe('Ticket Domain', () => {
  beforeEach(() => {
    resetCounters();
  });

  describe('CreateTicket command', () => {
    it('creates a ticket with valid data', () => {
      const context = createTestContext();
      const command = createCreateTicketCommand();
      const state = emptyTicketState();

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events).toHaveLength(1);
      expect(events[0]._type).toBe('TicketCreated');
      expect(events[0]).toMatchObject({
        title: 'Test Ticket',
        priority: 'medium',
        reporterId: REPORTER_ID,
      });
    });

    it('creates ticket with assignee and emits both TicketCreated and TicketAssigned', () => {
      const context = createTestContext();
      const command = createCreateTicketCommand({ assigneeId: ASSIGNEE_ID });
      const state = emptyTicketState();

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events).toHaveLength(2);
      expect(events[0]._type).toBe('TicketCreated');
      expect(events[1]._type).toBe('TicketAssigned');
    });

    it('rejects ticket without title', () => {
      const context = createTestContext();
      const command = createCreateTicketCommand({ title: '' });
      const state = emptyTicketState();

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('TITLE_REQUIRED');
    });

    it('rejects ticket without reporter', () => {
      const context = createTestContext();
      const command = createCreateTicketCommand({ reporterId: null as unknown as UserId });
      const state = emptyTicketState();

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('REPORTER_REQUIRED');
    });
  });

  describe('Status transitions', () => {
    it.each([
      ['new', 'open'],
      ['new', 'in_progress'],
      ['new', 'pending_customer'],
      ['new', 'closed'],
      ['open', 'in_progress'],
      ['open', 'pending_customer'],
      ['open', 'closed'],
      ['in_progress', 'open'],
      ['in_progress', 'pending_customer'],
      ['in_progress', 'closed'],
      ['pending_customer', 'open'],
      ['pending_customer', 'in_progress'],
      ['pending_customer', 'closed'],
      ['closed', 'open'], // Reopen
    ] as const)('allows transition from %s to %s', (from, to) => {
      const context = createTestContext();
      const state = createTicketState({ status: from });
      const command: TransitionStatusCommand = {
        _type: 'TransitionStatus',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newStatus: to,
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.length).toBeGreaterThanOrEqual(1);
      const statusEvent = events.find(e => e._type === 'StatusTransitioned');
      expect(statusEvent).toBeDefined();
    });

    it.each([
      ['closed', 'in_progress'],
      ['closed', 'pending_customer'],
    ] as const)('rejects invalid transition from %s to %s', (from, to) => {
      const context = createTestContext();
      const state = createTicketState({ status: from });
      const command: TransitionStatusCommand = {
        _type: 'TransitionStatus',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newStatus: to,
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns empty events for same-status transition', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'open' });
      const command: TransitionStatusCommand = {
        _type: 'TransitionStatus',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newStatus: 'open',
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events).toHaveLength(0);
    });
  });

  describe('Assignment', () => {
    it('assigns ticket to new assignee', () => {
      const context = createTestContext();
      const state = createTicketState({ assigneeId: null });
      const command: AssignTicketCommand = {
        _type: 'AssignTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        assigneeId: ASSIGNEE_ID,
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.find(e => e._type === 'TicketAssigned')).toBeDefined();
    });

    it('auto-transitions new ticket to in_progress on assignment', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'new', assigneeId: null });
      const command: AssignTicketCommand = {
        _type: 'AssignTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        assigneeId: ASSIGNEE_ID,
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events).toHaveLength(2);
      expect(events[0]._type).toBe('TicketAssigned');
      expect(events[1]._type).toBe('StatusTransitioned');
      if (events[1]._type === 'StatusTransitioned') {
        expect(events[1].toStatus).toBe('in_progress');
      }
    });

    it('rejects assignment to same assignee', () => {
      const context = createTestContext();
      const state = createTicketState({ assigneeId: ASSIGNEE_ID });
      const command: AssignTicketCommand = {
        _type: 'AssignTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        assigneeId: ASSIGNEE_ID,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('SAME_ASSIGNEE');
    });
  });

  describe('Comments', () => {
    it('adds a comment to ticket', () => {
      const context = createTestContext();
      const state = createTicketState();
      const command: AddCommentCommand = {
        _type: 'AddComment',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        text: 'This is a test comment',
        isInternalNote: false,
        isFromCustomer: false,
        externalMessageId: null,
        attachmentIds: [],
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.find(e => e._type === 'CommentAdded')).toBeDefined();
    });

    it('auto-transitions from pending_customer to open on customer reply', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'pending_customer' });
      const command: AddCommentCommand = {
        _type: 'AddComment',
        actorId: null,
        timestamp: NOW,
        ticketId: TICKET_ID,
        text: 'Customer reply',
        isInternalNote: false,
        isFromCustomer: true,
        externalMessageId: null,
        attachmentIds: [],
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events).toHaveLength(2);
      expect(events[0]._type).toBe('CommentAdded');
      expect(events[1]._type).toBe('StatusTransitioned');
      if (events[1]._type === 'StatusTransitioned') {
        expect(events[1].toStatus).toBe('open');
      }
    });

    it('rejects empty comment', () => {
      const context = createTestContext();
      const state = createTicketState();
      const command: AddCommentCommand = {
        _type: 'AddComment',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        text: '',
        isInternalNote: false,
        isFromCustomer: false,
        externalMessageId: null,
        attachmentIds: [],
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('COMMENT_EMPTY');
    });
  });

  describe('Close and Reopen', () => {
    it('closes an open ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'open' });
      const command: CloseTicketCommand = {
        _type: 'CloseTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        resolution: 'Issue resolved',
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.find(e => e._type === 'TicketClosed')).toBeDefined();
    });

    it('rejects closing already closed ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'closed' });
      const command: CloseTicketCommand = {
        _type: 'CloseTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        resolution: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('TICKET_ALREADY_CLOSED');
    });

    it('reopens a closed ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'closed' });
      const command: ReopenTicketCommand = {
        _type: 'ReopenTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        reason: 'Customer needs more help',
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.find(e => e._type === 'TicketReopened')).toBeDefined();
      expect(events.find(e => e._type === 'StatusTransitioned')).toBeDefined();
    });

    it('rejects reopening non-closed ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'open' });
      const command: ReopenTicketCommand = {
        _type: 'ReopenTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        reason: 'Test',
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('TICKET_NOT_CLOSED');
    });
  });

  describe('Priority changes', () => {
    it('changes priority', () => {
      const context = createTestContext();
      const state = createTicketState({ priority: 'medium' });
      const command: ChangePriorityCommand = {
        _type: 'ChangePriority',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newPriority: 'high',
        reason: 'Customer is VIP',
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      const event = events.find(e => e._type === 'PriorityChanged');
      expect(event).toBeDefined();
      if (event?._type === 'PriorityChanged') {
        expect(event.fromPriority).toBe('medium');
        expect(event.toPriority).toBe('high');
      }
    });

    it('rejects changing to same priority', () => {
      const context = createTestContext();
      const state = createTicketState({ priority: 'medium' });
      const command: ChangePriorityCommand = {
        _type: 'ChangePriority',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newPriority: 'medium',
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('SAME_PRIORITY');
    });
  });

  describe('Merge', () => {
    it('merges ticket into another', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'open' });
      const targetTicketId = 2 as TicketId;
      const command: MergeTicketCommand = {
        _type: 'MergeTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        sourceTicketId: TICKET_ID,
        targetTicketId,
        reason: 'Duplicate issue',
      };

      const result = decide(command, state, context);

      expect(isOk(result)).toBe(true);
      const events = unwrap(result);
      expect(events.find(e => e._type === 'TicketMerged')).toBeDefined();
      expect(events.find(e => e._type === 'TicketClosed')).toBeDefined();
    });

    it('rejects merging ticket into itself', () => {
      const context = createTestContext();
      const state = createTicketState();
      const command: MergeTicketCommand = {
        _type: 'MergeTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        sourceTicketId: TICKET_ID,
        targetTicketId: TICKET_ID,
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('CANNOT_MERGE_INTO_SELF');
    });

    it('rejects merging already merged ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ mergedIntoTicketId: 999 as TicketId });
      const command: MergeTicketCommand = {
        _type: 'MergeTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        sourceTicketId: TICKET_ID,
        targetTicketId: 2 as TicketId,
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('TICKET_ALREADY_MERGED');
    });

    it('rejects merging closed ticket', () => {
      const context = createTestContext();
      const state = createTicketState({ status: 'closed' });
      const command: MergeTicketCommand = {
        _type: 'MergeTicket',
        actorId: ACTOR_ID,
        timestamp: NOW,
        sourceTicketId: TICKET_ID,
        targetTicketId: 2 as TicketId,
        reason: null,
      };

      const result = decide(command, state, context);

      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('CANNOT_MERGE_CLOSED_TICKET');
    });
  });

  describe('evolve', () => {
    it('applies TicketCreated event to empty state', () => {
      const state = emptyTicketState();
      const event = {
        _type: 'TicketCreated' as const,
        ticketId: TICKET_ID,
        occurredAt: NOW,
        causedBy: ACTOR_ID,
        title: 'Test',
        description: null,
        priority: 'high' as const,
        type: null,
        reporterId: REPORTER_ID,
        assigneeId: ASSIGNEE_ID,
        sender: { email: null, name: null, phone: null, company: null },
        orderNumber: null,
        trackingNumber: null,
        externalMessageId: null,
        conversationId: null,
        shippingAddress: null,
        customerId: CUSTOMER_ID,
      };

      const newState = evolve(state, event);

      expect(newState.id).toBe(TICKET_ID);
      expect(newState.status).toBe('new');
      expect(newState.priority).toBe('high');
      expect(newState.assigneeId).toBe(ASSIGNEE_ID);
      expect(newState.reporterId).toBe(REPORTER_ID);
      expect(newState.customerId).toBe(CUSTOMER_ID);
    });

    it('applies StatusTransitioned event', () => {
      const state = createTicketState({ status: 'new' });
      const event = {
        _type: 'StatusTransitioned' as const,
        ticketId: TICKET_ID,
        occurredAt: LATER,
        causedBy: ACTOR_ID,
        fromStatus: 'new' as const,
        toStatus: 'open' as const,
        reason: null,
      };

      const newState = evolve(state, event);

      expect(newState.status).toBe('open');
      expect(newState.updatedAt).toBe(LATER);
    });

    it('applies CommentAdded event', () => {
      const state = createTicketState({ commentCount: 0, hasFirstResponse: false });
      const event = {
        _type: 'CommentAdded' as const,
        ticketId: TICKET_ID,
        commentId: 1 as CommentId,
        text: 'Test comment',
        occurredAt: LATER,
        causedBy: ACTOR_ID,
        isInternalNote: false,
        isFromCustomer: false,
        isOutgoingReply: false,
        externalMessageId: null,
        attachmentIds: [],
      };

      const newState = evolve(state, event);

      expect(newState.commentCount).toBe(1);
      expect(newState.hasFirstResponse).toBe(true);
    });

    it('does not mark internal note as first response', () => {
      const state = createTicketState({ commentCount: 0, hasFirstResponse: false });
      const event = {
        _type: 'CommentAdded' as const,
        ticketId: TICKET_ID,
        commentId: 1 as CommentId,
        text: 'Internal note',
        occurredAt: LATER,
        causedBy: ACTOR_ID,
        isInternalNote: true,
        isFromCustomer: false,
        isOutgoingReply: false,
        externalMessageId: null,
        attachmentIds: [],
      };

      const newState = evolve(state, event);

      expect(newState.commentCount).toBe(1);
      expect(newState.hasFirstResponse).toBe(false);
    });

    it('applies TicketMerged event', () => {
      const state = createTicketState({ status: 'open' });
      const targetId = 999 as TicketId;
      const event = {
        _type: 'TicketMerged' as const,
        ticketId: TICKET_ID,
        targetTicketId: targetId,
        occurredAt: LATER,
        causedBy: ACTOR_ID,
        reason: null,
      };

      const newState = evolve(state, event);

      expect(newState.mergedIntoTicketId).toBe(targetId);
      expect(newState.status).toBe('closed');
    });
  });

  describe('evolveAll', () => {
    it('applies multiple events in sequence', () => {
      const state = emptyTicketState();
      const events = [
        {
          _type: 'TicketCreated' as const,
          ticketId: TICKET_ID,
          occurredAt: NOW,
          causedBy: ACTOR_ID,
          title: 'Test',
          description: null,
          priority: 'medium' as const,
          type: null,
          reporterId: REPORTER_ID,
          assigneeId: null,
          sender: { email: null, name: null, phone: null, company: null },
          orderNumber: null,
          trackingNumber: null,
          externalMessageId: null,
          conversationId: null,
          shippingAddress: null,
          customerId: null,
        },
        {
          _type: 'TicketAssigned' as const,
          ticketId: TICKET_ID,
          previousAssigneeId: null,
          newAssigneeId: ASSIGNEE_ID,
          occurredAt: NOW,
          causedBy: ACTOR_ID,
        },
        {
          _type: 'PriorityChanged' as const,
          ticketId: TICKET_ID,
          fromPriority: 'medium' as const,
          toPriority: 'urgent' as const,
          occurredAt: LATER,
          causedBy: ACTOR_ID,
          reason: 'Escalated',
        },
      ];

      const newState = evolveAll(state, events);

      expect(newState.id).toBe(TICKET_ID);
      expect(newState.assigneeId).toBe(ASSIGNEE_ID);
      expect(newState.priority).toBe('urgent');
    });
  });

  describe('Immutability', () => {
    it('does not mutate input state in evolve', () => {
      const originalState = createTicketState({ status: 'new' });
      const stateBefore = { ...originalState };
      const event = {
        _type: 'StatusTransitioned' as const,
        ticketId: TICKET_ID,
        occurredAt: LATER,
        causedBy: ACTOR_ID,
        fromStatus: 'new' as const,
        toStatus: 'open' as const,
        reason: null,
      };

      evolve(originalState, event);

      expect(originalState).toEqual(stateBefore);
    });

    it('does not mutate input state in decide', () => {
      const context = createTestContext();
      const originalState = createTicketState({ status: 'new' });
      const stateBefore = { ...originalState };
      const command: TransitionStatusCommand = {
        _type: 'TransitionStatus',
        actorId: ACTOR_ID,
        timestamp: NOW,
        ticketId: TICKET_ID,
        newStatus: 'open',
        reason: null,
      };

      decide(command, originalState, context);

      expect(originalState).toEqual(stateBefore);
    });
  });
});
