import { NextRequest, NextResponse } from 'next/server';
import { db, ticketComments, tickets, users, ticketAttachments } from '@/lib/db';
import { and, eq, or, isNull, desc, sql } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { sendTicketReplyEmail } from '@/lib/email';
import { InferSelectModel } from 'drizzle-orm';
import { checkTicketCommentAccess } from '@/lib/ticket-auth';
import { validateTicketId, sanitizeHtmlContent, ValidationError } from '@/lib/validators';

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;
    const ticketId = validateTicketId(id);

    // Check authorization to comment on this ticket
    const authResult = await checkTicketCommentAccess(ticketId);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status || 403 });
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

    // Sanitize HTML content to prevent XSS
    const sanitizedContent = requestBody.content ? sanitizeHtmlContent(requestBody.content) : '';

    // TRANSACTION: Insert comment and attach any attachments atomically
    const newComment: CommentWithAttachments = await db.transaction(async (tx) => {
      // Set up comment data with sanitized content
      const commentData = {
        ticketId,
        commentText: sanitizedContent || '(Attachments only)',
        commenterId: currentUser.id,
        isInternalNote: requestBody.isInternalNote || false,
        isOutgoingReply: requestBody.sendAsEmail || false,
      };

      // Insert comment
      const [insertedComment] = await tx.insert(ticketComments)
        .values(commentData)
        .returning();

      // If there are attachments, associate them with this comment
      if (requestBody.attachmentIds && requestBody.attachmentIds.length > 0) {
        // Update attachments to be associated with this comment
        await tx.update(ticketAttachments)
          .set({ commentId: insertedComment.id })
          .where(
            and(
              eq(ticketAttachments.ticketId, ticketId),
              or(
                ...requestBody.attachmentIds.map(id => eq(ticketAttachments.id, id))
              )
            )
          );

        // Fetch the updated attachments to return
        const updatedAttachments = await tx.query.ticketAttachments.findMany({
          where: eq(ticketAttachments.commentId, insertedComment.id),
        });

        return {
          ...insertedComment,
          attachments: updatedAttachments
        };
      }

      return {
        ...insertedComment,
        attachments: []
      };
    });

    // TypeScript loses type narrowing after async transaction, but we verified ticket exists at line 76-78
    // Assert non-null for the disabled email block below
    const verifiedTicket = ticket!;

    // EMAIL INTEGRATION DISABLED - Comment saved but email not sent
    // If this is an email reply, send it
    if (false && requestBody.sendAsEmail && verifiedTicket.senderEmail) { // DISABLED
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
          const messageId = lastCustomerComment!.externalMessageId!; // Already checked via optional chaining
          inReplyToId = messageId;
          referencesIds.push(messageId);
        } else if (verifiedTicket.externalMessageId) {
          // If no customer reply, reply to the original ticket email
          const messageId = verifiedTicket.externalMessageId!; // Already checked in if condition
          inReplyToId = messageId;
          referencesIds.push(messageId);
        }

        // 3. Add original ticket ID to References if it wasn't the one replied to
        if (verifiedTicket.externalMessageId && verifiedTicket.externalMessageId !== inReplyToId) {
          // Add original ID before the replied-to ID for standard References order
          referencesIds.unshift(verifiedTicket.externalMessageId!); // Already checked in if condition
        }
        // Limit references to last 4 messages to stay within header limits
        referencesIds = [...new Set(referencesIds)].slice(-4); // Ensure uniqueness and limit to last 4

        // --- End Determine Threading Headers ---
        console.log(`Sending Reply - In-Reply-To: ${inReplyToId}, References: ${referencesIds.join(' ')}, ConvID: ${verifiedTicket.conversationId}`);

        // Get attachments for the email
        const emailAttachments = newComment.attachments || [];

        // Send the email
        const emailResult = await sendTicketReplyEmail({
          ticketId: verifiedTicket.id,
          recipientEmail: verifiedTicket.senderEmail!, // Already verified in if condition on line 144
          recipientName: verifiedTicket.senderName || 'Customer',
          subject: `Re: ${verifiedTicket.title}`,
          message: requestBody.content,
          senderName: currentUser!.name || 'Support Team', // Verified non-null at line 54-56
          attachments: emailAttachments,
          inReplyToId,
          referencesIds: referencesIds.length > 0 ? referencesIds : undefined,
          conversationId: verifiedTicket.conversationId || undefined
        });

        if (!emailResult) {
          throw new Error('Email sending failed - no response from email service');
        }

        console.log(`Email reply sent successfully for ticket ${ticketId} to ${verifiedTicket.senderEmail}`);

        // TRANSACTION: Update ticket and comment after successful email send
        await db.transaction(async (tx) => {
          // Update the ticket status to "pending_customer" if it's not already closed
          if (verifiedTicket.status !== 'closed') {
            await tx.update(tickets)
              .set({
                status: 'pending_customer',
                updatedAt: new Date()
              })
              .where(eq(tickets.id, ticketId));
          }

          // Update the comment to mark it as sent
          await tx.update(ticketComments)
            .set({
              isOutgoingReply: true,
              externalMessageId: emailResult!.internetMessageId || undefined // Verified non-null at line 202-204
            })
            .where(eq(ticketComments.id, newComment.id));
        });

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
          error: (emailError as Error).message || String(emailError) || 'Unknown error'
        }, { status: 207 }); // 207 Multi-Status
      }
    }

    return NextResponse.json(newComment);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating reply:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 