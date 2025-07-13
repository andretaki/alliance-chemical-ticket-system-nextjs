import { NextRequest, NextResponse } from 'next/server';
import { db, tickets, ticketComments, ticketStatusEnum } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { ticketEventEmitter } from '@/lib/eventEmitter';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const ticketId = parseInt(id);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
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
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    
    // Optional: Verify the customer email matches the ticket
    if (customerEmail && ticket.senderEmail !== customerEmail) {
      return NextResponse.json({ error: 'Email does not match ticket' }, { status: 403 });
    }
    
    if (ticket.status !== 'closed') {
      return NextResponse.json({ message: 'Ticket is already open' }, { status: 200 });
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
    
    return NextResponse.json({ message: 'Ticket reopened successfully' });
  } catch (error) {
    console.error('Error reopening ticket:', error);
    return NextResponse.json({ error: 'Failed to reopen ticket' }, { status: 500 });
  }
} 