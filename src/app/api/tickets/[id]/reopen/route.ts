import type { NextRequest } from 'next/server';
import { db, tickets, ticketComments, ticketStatusEnum } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }
    const { id } = await params;
    const ticketId = parseInt(id);
    if (isNaN(ticketId)) {
      return apiError('invalid_id', 'Invalid ticket ID', null, { status: 400 });
    }
    
    const body = await req.json();
    const { reason, customerEmail } = body;
    
    // Verify the ticket exists and is closed
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true,
        status: true,
        senderEmail: true,
        title: true
      }
    });
    
    if (!ticket) {
      return apiError('not_found', 'Ticket not found', null, { status: 404 });
    }

    // Optional: Verify the customer email matches the ticket
    if (customerEmail && ticket.senderEmail !== customerEmail) {
      return apiError('forbidden', 'Email does not match ticket', null, { status: 403 });
    }

    if (ticket.status !== 'closed') {
      return apiSuccess({ message: 'Ticket is already open' });
    }
    
    // Reopen the ticket
    await db.update(tickets)
      .set({
        status: ticketStatusEnum.enumValues[1], // 'open'
        updatedAt: new Date()
      })
      .where(eq(tickets.id, ticketId));
    
    // Add a comment about reopening
    await db.insert(ticketComments).values({
      ticketId,
      commentText: `**Ticket Reopened by Customer**\n\nThis ticket was reopened by the customer.\n\n**Reason:** ${reason || 'No reason provided'}`,
      isInternalNote: true,
      isFromCustomer: false,
      isOutgoingReply: false
    });
    
    // Emit event
    ticketEventEmitter.emit({
      type: 'ticket_reopened_by_customer',
      ticketId: ticketId,
      reason: reason || 'No reason provided'
    });
    
    console.log(`Ticket #${ticketId} (${ticket.title}) reopened by customer. Reason: ${reason || 'No reason provided'}`);

    return apiSuccess({ message: 'Ticket reopened successfully' });
  } catch (error) {
    console.error('Error reopening ticket:', error);
    return apiError('internal_error', 'Failed to reopen ticket', null, { status: 500 });
  }
} 