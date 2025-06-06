import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db, tickets, ticketComments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/authOptions';
import { ticketEventEmitter } from '@/lib/eventEmitter';

/**
 * POST handler to reopen a closed ticket
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication and permissions
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    
    // Parse ticket ID - await params since it's now a Promise
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return new NextResponse('Invalid ticket ID', { status: 400 });
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
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    
    if (ticket.status !== 'closed') {
      return NextResponse.json({ 
        error: 'Ticket is not closed and cannot be reopened',
        status: ticket.status
      }, { status: 400 });
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
    
    return NextResponse.json({
      success: true,
      message: 'Ticket reopened successfully',
      ticketId
    });
  } catch (error) {
    console.error(`Error reopening ticket:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}