import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ticketComments, tickets, users, ticketAttachments } from '@/db/schema';
import { and, eq, or, isNull, desc, sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { sendTicketReplyEmail } from '@/lib/email';
import { InferSelectModel } from 'drizzle-orm';

// Define types for database models
type TicketComment = InferSelectModel<typeof ticketComments>;
type TicketAttachment = InferSelectModel<typeof ticketAttachments>;

// Define type for the comment with attachments
interface CommentWithAttachments extends TicketComment {
  attachments?: TicketAttachment[];
}

// Type for the request body
interface ReplyRequestBody {
  content: string;
  isInternalNote?: boolean;
  sendAsEmail?: boolean;
  attachmentIds?: number[];
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await context.params;
    const ticketId = parseInt(id);
    if (isNaN(ticketId)) {
      return new NextResponse('Invalid ticket ID', { status: 400 });
    }

    // Get the current user
    const currentUser = await db.query.users.findFirst({
      where: eq(users.email, session.user.email || ''),
    });

    if (!currentUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Verify the ticket exists AND fetch necessary fields for threading
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true,
        title: true,
        senderEmail: true,
        senderName: true,
        status: true,
        externalMessageId: true,
        conversationId: true
      },
      with: {
        assignee: true,
        reporter: true,
      },
    });

    if (!ticket) {
      return new NextResponse('Ticket not found', { status: 404 });
    }

    // Parse the request body
    const requestBody = await request.json() as ReplyRequestBody;
    
    // Check if content is provided when not attaching files
    if (!requestBody.content && (!requestBody.attachmentIds || requestBody.attachmentIds.length === 0)) {
      return new NextResponse('Comment content is required if no attachments', { status: 400 });
    }

    // Set up comment data
    const commentData = {
      ticketId,
      commentText: requestBody.content || '(Attachments only)',
      commenterId: currentUser.id,
      isInternalNote: requestBody.isInternalNote || false,
      isOutgoingReply: requestBody.sendAsEmail || false,
    };

    // Insert comment
    const [insertedComment] = await db.insert(ticketComments)
      .values(commentData)
      .returning();
      
    // Create a comment object that can have attachments
    const newComment: CommentWithAttachments = {
      ...insertedComment,
      attachments: []
    };

    // If there are attachments, associate them with this comment
    if (requestBody.attachmentIds && requestBody.attachmentIds.length > 0) {
      // Update attachments to be associated with this comment
      await db.update(ticketAttachments)
        .set({ commentId: newComment.id })
        .where(
          and(
            eq(ticketAttachments.ticketId, ticketId),
            or(
              ...requestBody.attachmentIds.map(id => eq(ticketAttachments.id, id))
            )
          )
        );
      
      // Fetch the updated attachments to return
      const updatedAttachments = await db.query.ticketAttachments.findMany({
        where: eq(ticketAttachments.commentId, newComment.id),
      });

      // Enhance the response with attachment data
      newComment.attachments = updatedAttachments;
    }

    // If this is an email reply, send it
    if (requestBody.sendAsEmail && ticket.senderEmail) {
      try {
        // --- Determine Threading Headers ---
        let inReplyToId: string | undefined = undefined;
        let referencesIds: string[] = [];

        // 1. Find the last message from the customer in this thread
        const lastCustomerComment = await db.query.ticketComments.findFirst({
          where: and(
            eq(ticketComments.ticketId, ticketId),
            eq(ticketComments.isFromCustomer, true),
            // Using SQL to check for non-null externalMessageId
            sql`${ticketComments.externalMessageId} IS NOT NULL`
          ),
          orderBy: [desc(ticketComments.createdAt)],
          columns: { externalMessageId: true }
        });

        // 2. Set In-Reply-To and initial References
        if (lastCustomerComment?.externalMessageId) {
          inReplyToId = lastCustomerComment.externalMessageId;
          referencesIds.push(lastCustomerComment.externalMessageId);
        } else if (ticket.externalMessageId) {
          // If no customer reply, reply to the original ticket email
          inReplyToId = ticket.externalMessageId;
          referencesIds.push(ticket.externalMessageId);
        }

        // 3. Add original ticket ID to References if it wasn't the one replied to
        if (ticket.externalMessageId && ticket.externalMessageId !== inReplyToId) {
          // Add original ID before the replied-to ID for standard References order
          referencesIds.unshift(ticket.externalMessageId);
        }
        // Limit references to last 4 messages to stay within header limits
        referencesIds = [...new Set(referencesIds)].slice(-4); // Ensure uniqueness and limit to last 4

        // --- End Determine Threading Headers ---
        console.log(`Sending Reply - In-Reply-To: ${inReplyToId}, References: ${referencesIds.join(' ')}, ConvID: ${ticket.conversationId}`);

        // Get attachments for the email
        const emailAttachments = newComment.attachments || [];

        // Send the email
        const emailResult = await sendTicketReplyEmail({
          ticketId: ticket.id,
          recipientEmail: ticket.senderEmail,
          recipientName: ticket.senderName || 'Customer',
          subject: `Re: ${ticket.title}`,
          message: requestBody.content,
          senderName: currentUser.name || 'Support Team',
          attachments: emailAttachments,
          inReplyToId,
          referencesIds: referencesIds.length > 0 ? referencesIds : undefined,
          conversationId: ticket.conversationId || undefined
        });

        if (!emailResult) {
          throw new Error('Email sending failed - no response from email service');
        }

        console.log(`Email reply sent successfully for ticket ${ticketId} to ${ticket.senderEmail}`);
        
        // Update the ticket status to "pending_customer" if it's not already closed
        if (ticket.status !== 'closed') {
          await db.update(tickets)
            .set({ 
              status: 'pending_customer',
              updatedAt: new Date()
            })
            .where(eq(tickets.id, ticketId));
        }

        // Update the comment to mark it as sent
        await db.update(ticketComments)
          .set({ 
            isOutgoingReply: true,
            externalMessageId: emailResult.internetMessageId || undefined
          })
          .where(eq(ticketComments.id, newComment.id));

      } catch (emailError) {
        console.error('Failed to send email reply:', emailError);
        
        // Update the comment to mark it as failed
        await db.update(ticketComments)
          .set({ 
            isOutgoingReply: false
          })
          .where(eq(ticketComments.id, newComment.id));

        // Return a response indicating the comment was saved but email failed
        return NextResponse.json({ 
          ...newComment, 
          warning: 'Comment saved but email delivery failed',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        }, { status: 207 }); // 207 Multi-Status
      }
    }

    return NextResponse.json(newComment);
  } catch (error) {
    console.error('Error creating reply:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 