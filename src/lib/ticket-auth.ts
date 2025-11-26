/**
 * Ticket Authorization Helpers
 * Implements row-level security for ticket access
 */

import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';

export interface TicketAuthResult {
  authorized: boolean;
  error?: string;
  status?: number;
  ticket?: any;
}

/**
 * Check if user has access to view a ticket
 * Access granted if:
 * - User is admin
 * - User is the assignee
 * - User is the reporter
 * - User is a manager (can view all tickets)
 */
export async function checkTicketViewAccess(ticketId: number): Promise<TicketAuthResult> {
  const { session, error } = await getServerSession();

  if (error || !session?.user) {
    return {
      authorized: false,
      error: 'Unauthorized - Please log in',
      status: 401
    };
  }

  // Admin and manager can view all tickets
  if (session.user.role === 'admin' || session.user.role === 'manager') {
    return { authorized: true };
  }

  // Fetch ticket to check ownership
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: {
      id: true,
      assigneeId: true,
      reporterId: true
    }
  });

  if (!ticket) {
    return {
      authorized: false,
      error: 'Ticket not found',
      status: 404
    };
  }

  // Check if user is assignee or reporter
  const userId = session.user.id;
  if (ticket.assigneeId === userId || ticket.reporterId === userId) {
    return { authorized: true, ticket };
  }

  return {
    authorized: false,
    error: 'Forbidden - You do not have access to this ticket',
    status: 403
  };
}

/**
 * Check if user has access to modify a ticket
 * Access granted if:
 * - User is admin
 * - User is the assignee
 * - User is a manager
 */
export async function checkTicketModifyAccess(ticketId: number): Promise<TicketAuthResult> {
  const { session, error } = await getServerSession();

  if (error || !session?.user) {
    return {
      authorized: false,
      error: 'Unauthorized - Please log in',
      status: 401
    };
  }

  // Admin and manager can modify all tickets
  if (session.user.role === 'admin' || session.user.role === 'manager') {
    return { authorized: true };
  }

  // Fetch ticket to check ownership
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: {
      id: true,
      assigneeId: true,
      reporterId: true
    }
  });

  if (!ticket) {
    return {
      authorized: false,
      error: 'Ticket not found',
      status: 404
    };
  }

  // Only assignee can modify (reporter cannot modify, only comment)
  const userId = session.user.id;
  if (ticket.assigneeId === userId) {
    return { authorized: true, ticket };
  }

  return {
    authorized: false,
    error: 'Forbidden - Only the assigned agent or manager can modify this ticket',
    status: 403
  };
}

/**
 * Check if user has access to delete a ticket
 * Access granted if:
 * - User is admin only (strict delete permissions)
 */
export async function checkTicketDeleteAccess(ticketId: number): Promise<TicketAuthResult> {
  const { session, error } = await getServerSession();

  if (error || !session?.user) {
    return {
      authorized: false,
      error: 'Unauthorized - Please log in',
      status: 401
    };
  }

  // Only admin can delete tickets
  if (session.user.role !== 'admin') {
    return {
      authorized: false,
      error: 'Forbidden - Only administrators can delete tickets',
      status: 403
    };
  }

  // Verify ticket exists
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: {
      id: true
    }
  });

  if (!ticket) {
    return {
      authorized: false,
      error: 'Ticket not found',
      status: 404
    };
  }

  return { authorized: true, ticket };
}

/**
 * Check if user can add comments to a ticket
 * Access granted if:
 * - User is admin
 * - User is the assignee
 * - User is the reporter
 * - User is a manager
 */
export async function checkTicketCommentAccess(ticketId: number): Promise<TicketAuthResult> {
  const { session, error } = await getServerSession();

  if (error || !session?.user) {
    return {
      authorized: false,
      error: 'Unauthorized - Please log in',
      status: 401
    };
  }

  // Admin and manager can comment on all tickets
  if (session.user.role === 'admin' || session.user.role === 'manager') {
    return { authorized: true };
  }

  // Fetch ticket to check ownership
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: {
      id: true,
      assigneeId: true,
      reporterId: true
    }
  });

  if (!ticket) {
    return {
      authorized: false,
      error: 'Ticket not found',
      status: 404
    };
  }

  // Check if user is assignee or reporter
  const userId = session.user.id;
  if (ticket.assigneeId === userId || ticket.reporterId === userId) {
    return { authorized: true, ticket };
  }

  return {
    authorized: false,
    error: 'Forbidden - You can only comment on tickets you are involved in',
    status: 403
  };
}
