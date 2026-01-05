/**
 * Ticket Domain Module - Public API
 *
 * This module exports the ticket domain's public interface:
 * - Types (pure domain model)
 * - Commands (input DTOs)
 * - Events (output facts)
 * - decide() - pure decision function
 * - evolve() - pure state evolution
 */

// === Types ===
export type {
  TicketStatus,
  TicketPriority,
  TicketType,
  TicketSentiment,
  AiSuggestedAction,
  TicketId,
  UserId,
  CommentId,
  AttachmentId,
  CustomerId,
  UserRef,
  AttachmentRef,
  TicketComment,
  SenderInfo,
  ShippingAddress,
  SlaInfo,
  AiAnalysis,
  Ticket,
  TicketState,
} from './types';

export {
  emptyTicketState,
  isOpenStatus,
  isEscalatablePriority,
  canBeMerged,
  canBeReopened,
  canTransitionTo,
  canEscalatePriority,
  canDeescalatePriority,
  VALID_STATUS_TRANSITIONS,
  PRIORITY_ESCALATION_ORDER,
} from './types';

// === Commands ===
export type {
  TicketCommand,
  CreateTicketCommand,
  TransitionStatusCommand,
  CloseTicketCommand,
  ReopenTicketCommand,
  AssignTicketCommand,
  UnassignTicketCommand,
  ChangePriorityCommand,
  EscalatePriorityCommand,
  AddCommentCommand,
  AddEmailReplyCommand,
  MergeTicketCommand,
  LinkToCustomerCommand,
  UnlinkFromCustomerCommand,
  UpdateTicketCommand,
  RecordFirstResponseCommand,
  BreachSlaCommand,
} from './commands';

export {
  createTicket,
  transitionStatus,
  assignTicket,
  addComment,
  closeTicket,
  reopenTicket,
  changePriority,
  mergeTicket,
  linkToCustomer,
} from './commands';

// === Events ===
export type {
  TicketEvent,
  TicketCreatedEvent,
  StatusTransitionedEvent,
  TicketClosedEvent,
  TicketReopenedEvent,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  PriorityChangedEvent,
  TicketEscalatedEvent,
  CommentAddedEvent,
  EmailReplyQueuedEvent,
  TicketMergedEvent,
  CustomerLinkedEvent,
  CustomerUnlinkedEvent,
  TicketUpdatedEvent,
  FirstResponseRecordedEvent,
  SlaBreachedEvent,
} from './events';

export {
  isTicketCreated,
  isStatusTransitioned,
  isCommentAdded,
  isTicketClosed,
  isTicketAssigned,
  isPriorityChanged,
  ticketCreated,
  statusTransitioned,
  commentAdded,
  ticketAssigned,
  priorityChanged,
  ticketClosed,
  ticketMerged,
} from './events';

// === Decision logic ===
export type { DomainError, DecideContext } from './decide';
export { decide } from './decide';

// === State evolution ===
export {
  evolve,
  evolveAll,
  reconstituteFromEvents,
  hasStateChanged,
  getStateChanges,
} from './evolve';
