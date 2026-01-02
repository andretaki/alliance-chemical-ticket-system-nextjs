import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db, tickets, ticketComments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { apiSuccess, apiError } from '@/lib/apiResponse';

/**
 * POST handler to reopen a closed ticket
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication and permissions
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || !session.user || session.user.role !== 'admin') {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    // Parse ticket ID - await params since it's now a Promise
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return apiError('invalid_id', 'Invalid ticket ID', null, { status: 400 });
    }

    // Check if ticket exists and is closed
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        status: true,
        title: true
      }
    });

    if (!ticket) {
      return apiError('not_found', 'Ticket not found', null, { status: 404 });
    }

    if (ticket.status !== 'closed') {
      return apiError('validation_error', 'Ticket is not closed and cannot be reopened', { status: ticket.status }, { status: 400 });
    }
    
    // Update the ticket status to open
    await db.update(tickets)
      .set({
        status: 'open',
        updatedAt: new Date()
      })
      .where(eq(tickets.id, ticketId));
    
    // Add an internal note
    await db.insert(ticketComments).values({
      ticketId: ticketId,
      commentText: `**Ticket Reopened**\n\nThis ticket was reopened by ${session.user.name || session.user.email || 'an administrator'}.`,
      isInternalNote: true,
      isFromCustomer: false,
      isOutgoingReply: false,
      commenterId: session.user.id
    });
    
    // Emit event
    ticketEventEmitter.emit({
      type: 'ticket_reopened',
      ticketId: ticketId,
      userId: session.user.id,
      userName: session.user.name
    });
    
    console.log(`Ticket #${ticketId} (${ticket.title}) reopened by ${session.user.name || session.user.email}`);

    return apiSuccess({
      success: true,
      message: 'Ticket reopened successfully',
      ticketId
    });
  } catch (error) {
    console.error(`Error reopening ticket:`, error);
    return apiError('internal_error', 'Internal Server Error', null, { status: 500 });
  }
}