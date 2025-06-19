import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { tickets, ticketComments as ticketCommentsSchema } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { aiGeneralReplyService } from '@/services/aiGeneralReplyService';
import type { Ticket, TicketComment } from '@/types/ticket';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticketId = parseInt(params.id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    // 1. Fetch the ticket and its comments
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        comments: {
          orderBy: [desc(ticketCommentsSchema.createdAt)],
          with: {
            commenter: true
          }
        },
        attachments: true,
        assignee: true,
        reporter: true,
      }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // 2. Find the last substantive comment from the customer
    const customerComments = ticket.comments.filter(c => c.isFromCustomer);
    
    let messageToReplyTo: TicketComment | null = null;

    if (customerComments.length > 0) {
      // Check last few comments for substance
      for (const comment of customerComments) { // Already sorted descending
        if (await aiGeneralReplyService.isSubstantive(comment.commentText)) {
          messageToReplyTo = comment as unknown as TicketComment;
          break; // Found the first substantive comment from the end
        }
      }
    }

    // If no substantive comment is found, or there are no comments, check the description
    if (!messageToReplyTo) {
      if (await aiGeneralReplyService.isSubstantive(ticket.description)) {
        messageToReplyTo = {
          id: -1,
          commentText: ticket.description,
          createdAt: ticket.createdAt.toISOString(),
          isFromCustomer: true,
          ticketId: ticket.id,
          commenterId: ticket.reporterId,
          isInternalNote: false,
          isOutgoingReply: false,
          externalMessageId: null,
          updatedAt: ticket.createdAt.toISOString(),
          commenter: ticket.reporter,
          attachments: ticket.attachments?.filter(a => !a.commentId) || [],
        } as TicketComment;
      }
    }

    if (!messageToReplyTo) {
      return NextResponse.json({ error: 'No substantive customer message found to reply to.' }, { status: 400 });
    }

    // 3. Generate the AI reply
    const draftedReply = await aiGeneralReplyService.generateReply(ticket as unknown as Ticket, messageToReplyTo);

    if (!draftedReply) {
      return NextResponse.json({ error: 'Failed to generate AI reply.' }, { status: 500 });
    }

    // 4. Return the drafted reply
    return NextResponse.json({ draftMessage: draftedReply });

  } catch (error: any) {
    console.error(`[DraftAIReply] Error drafting AI reply for ticket ${params.id}:`, error);
    return NextResponse.json({
      error: 'An unexpected error occurred while drafting the AI reply.',
      details: error.message
    }, { status: 500 });
  }
} 