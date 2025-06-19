import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { tickets, ticketComments as ticketCommentsSchema } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { aiGeneralReplyService } from '@/services/aiGeneralReplyService';
import type { Ticket, TicketComment, TicketUser, AttachmentData } from '@/types/ticket';

// Helper to convert DB user to TicketUser
const toTicketUser = (user: any): TicketUser | null => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus,
    image: user.image,
  };
};

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

    const ticketFromDb = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        comments: {
          orderBy: [desc(ticketCommentsSchema.createdAt)],
          with: {
            commenter: true,
            attachments: true,
          }
        },
        attachments: true,
        assignee: true,
        reporter: true,
      }
    });

    if (!ticketFromDb) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    
    // --- Start Type Conversion ---
    const ticketForAI: Ticket = {
      ...ticketFromDb,
      createdAt: ticketFromDb.createdAt.toISOString(),
      updatedAt: ticketFromDb.updatedAt.toISOString(),
      assignee: toTicketUser(ticketFromDb.assignee),
      reporter: toTicketUser(ticketFromDb.reporter)!,
      comments: ticketFromDb.comments.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        commenter: toTicketUser(c.commenter),
        attachments: (c.attachments || []).map(a => ({
          ...a,
          uploadedAt: a.uploadedAt.toISOString(),
        })) as AttachmentData[],
      })) as TicketComment[],
       attachments: (ticketFromDb.attachments || []).map(a => ({
        ...a,
        uploadedAt: a.uploadedAt.toISOString(),
      })) as AttachmentData[],
    };
    // --- End Type Conversion ---

    const customerComments = ticketForAI.comments.filter(c => c.isFromCustomer);
    
    let messageToReplyTo: TicketComment | null = null;

    if (customerComments.length > 0) {
      for (const comment of customerComments) {
        if (await aiGeneralReplyService.isSubstantive(comment.commentText)) {
          messageToReplyTo = comment;
          break;
        }
      }
    }

    if (!messageToReplyTo) {
      if (await aiGeneralReplyService.isSubstantive(ticketForAI.description)) {
        messageToReplyTo = {
          id: -1,
          commentText: ticketForAI.description,
          createdAt: ticketForAI.createdAt,
          isFromCustomer: true,
          ticketId: ticketForAI.id,
          commenterId: ticketForAI.reporterId,
          isInternalNote: false,
          isOutgoingReply: false,
          externalMessageId: null,
          updatedAt: ticketForAI.updatedAt,
          commenter: ticketForAI.reporter,
          attachments: ticketForAI.attachments?.filter(a => !a.commentId) || [],
        };
      }
    }

    if (!messageToReplyTo) {
      return NextResponse.json({ error: 'No substantive customer message found to reply to.' }, { status: 400 });
    }

    const draftedReply = await aiGeneralReplyService.generateReply(ticketForAI, messageToReplyTo);

    if (!draftedReply) {
      return NextResponse.json({ error: 'Failed to generate AI reply.' }, { status: 500 });
    }

    return NextResponse.json({ draftMessage: draftedReply });

  } catch (error: any) {
    console.error(`[DraftAIReply] Error drafting AI reply for ticket ${params.id}:`, error);
    return NextResponse.json({
      error: 'An unexpected error occurred while drafting the AI reply.',
      details: error.message
    }, { status: 500 });
  }
} 