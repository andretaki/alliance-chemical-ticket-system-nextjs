import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db, quarantinedEmails, tickets, ticketComments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { processSingleEmail } from '@/lib/emailProcessor';
import { revalidatePath } from 'next/cache';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string; }> }
) {
  try {
    const { session, error } = await getServerSession();

        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user.role !== 'admin') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Await the params since it's now a Promise
    const { id, action } = await params;
    const { reviewNotes, targetTicketId } = await request.json();

    // Fetch the quarantined email
    const email = await db.query.quarantinedEmails.findFirst({
      where: eq(quarantinedEmails.id, parseInt(id, 10)),
    });

    if (!email) {
      return new NextResponse('Email not found', { status: 404 });
    }

    // Update the email status and reviewer info
    const updateData = {
      status: action.replace('-', '_') as any, // Convert 'approve-ticket' to 'approve_ticket'
      reviewerId: session.user.id,
      reviewedAt: new Date(),
      reviewNotes,
    };

    switch (action) {
      case 'approve-ticket':
        // Process the email as a new ticket
        const result = await processSingleEmail({
          id: email.originalGraphMessageId,
          internetMessageId: email.internetMessageId,
          subject: email.subject,
          body: {
            content: email.bodyPreview || '',
            contentType: 'text'
          },
          sender: {
            emailAddress: {
              address: email.senderEmail,
              name: email.senderName
            }
          }
        });

        if (!result.success) {
          return new NextResponse('Failed to create ticket', { status: 500 });
        }

        await db.update(quarantinedEmails)
          .set(updateData)
          .where(eq(quarantinedEmails.id, parseInt(id, 10)));

        return NextResponse.json({ success: true, message: 'Ticket created successfully' });

      case 'approve-comment':
        if (!targetTicketId) {
          return new NextResponse('Target ticket ID is required', { status: 400 });
        }

        // Verify the target ticket exists
        const ticket = await db.query.tickets.findFirst({
          where: eq(tickets.id, parseInt(targetTicketId, 10)),
        });

        if (!ticket) {
          return new NextResponse('Target ticket not found', { status: 404 });
        }

        // Add the email as a comment
        await db.insert(ticketComments).values({
          ticketId: parseInt(targetTicketId, 10),
          commentText: email.bodyPreview,
          commenterId: session.user.id,
          isFromCustomer: true,
          isInternalNote: false,
          isOutgoingReply: false,
        });

        await db.update(quarantinedEmails)
          .set(updateData)
          .where(eq(quarantinedEmails.id, parseInt(id, 10)));

        return NextResponse.json({ success: true, message: 'Comment added successfully' });

      case 'reject-spam':
      case 'reject-vendor':
      case 'delete':
        await db.update(quarantinedEmails)
          .set(updateData)
          .where(eq(quarantinedEmails.id, parseInt(id, 10)));

        return NextResponse.json({ success: true, message: 'Email status updated successfully' });

      default:
        return new NextResponse('Invalid action', { status: 400 });
    }
  } catch (error) {
    console.error('Error processing quarantine action:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}