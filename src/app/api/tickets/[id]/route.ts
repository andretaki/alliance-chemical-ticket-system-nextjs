import { NextRequest } from 'next/server';
import { db, tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketSentimentEnum } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sendNotificationEmail } from '@/lib/email';
import { checkTicketViewAccess, checkTicketModifyAccess, checkTicketDeleteAccess } from '@/lib/ticket-auth';
import { rateLimiters } from '@/lib/rateLimiting';
import { enqueueRagJob } from '@/services/rag/ragIngestionService';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

// --- Zod Schema for Validation ---
const updateTicketSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(255).optional(),
  description: z.string().min(1, { message: "Description is required" }).optional(),
  status: z.enum(ticketStatusEnum.enumValues).optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).optional(),
  assigneeEmail: z.string().email().nullable().optional(), // Optional assignee by email
  assigneeId: z.string().nullable().optional(), // Optional assignee by ID
  sentiment: z.enum(ticketSentimentEnum.enumValues).nullable().optional(), // Optional sentiment
  ai_summary: z.string().nullable().optional(), // Optional AI summary
  ai_suggested_assignee_id: z.string().nullable().optional(), // Optional AI suggested assignee
  opportunityId: z.number().int().positive().nullable().optional(),
});

// Helper to parse and validate ticket ID
const parseTicketIdString = (idString: string): number => {
  const ticketId = parseInt(idString, 10);
  if (isNaN(ticketId)) {
    throw new Error('Invalid ticket ID format');
  }
  return ticketId;
};

// --- GET: Fetch a single ticket with detailed information ---
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ticketIdStr: string = 'unknown_id_in_GET_handler';
  try {
    const { id } = await params;
    ticketIdStr = id;

    const ticketId = parseTicketIdString(ticketIdStr);

    // Check authorization first
    const authResult = await checkTicketViewAccess(ticketId);
    if (!authResult.authorized) {
      return apiError('forbidden', authResult.error || 'Access denied', null, { status: authResult.status || 403 });
    }

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        assignee: {
          columns: {
            id: true,
            name: true,
            email: true
          }
        },
        reporter: {
          columns: {
            id: true,
            name: true,
            email: true
          }
        },
        aiSuggestedAssignee: {
          columns: {
            id: true,
            name: true,
            email: true
          }
        },
        comments: {
          with: {
            commenter: {
              columns: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: (comments, { asc }) => [asc(comments.createdAt)]
        }
      }
    });

    if (!ticket) {
      return apiError('not_found', 'Ticket not found', null, { status: 404 });
    }

    return apiSuccess(ticket);
  } catch (error) {
    console.error(`API Error [GET /api/tickets/${ticketIdStr}]:`, error);

    if (error instanceof Error && error.message === 'Invalid ticket ID format') {
      return apiError('invalid_id', 'Invalid ticket ID format', null, { status: 400 });
    }

    return apiError('internal_error', 'Failed to fetch ticket', null, { status: 500 });
  }
}

// --- PUT: Update a ticket ---
export async function PUT(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.api.middleware(request as NextRequest);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  let ticketIdStr: string = 'unknown_id_in_PUT_handler';
  try {
    const params = await paramsPromise;
    ticketIdStr = params.id;

    const ticketId = parseTicketIdString(ticketIdStr);

    // Check authorization first
    const authResult = await checkTicketModifyAccess(ticketId);
    if (!authResult.authorized) {
      return apiError('forbidden', authResult.error || 'Access denied', null, { status: authResult.status || 403 });
    }

    const body = await request.json();

    const validationResult = updateTicketSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return apiError('validation_error', 'Invalid input', errors, { status: 400 });
    }

    const {
      title,
      description,
      status,
      priority,
      assigneeEmail,
      assigneeId,
      sentiment,
      ai_summary,
      ai_suggested_assignee_id
    } = validationResult.data;

    const currentTicket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true,
        assigneeId: true,
        title: true
      }
    });

    if (!currentTicket) {
      return apiError('not_found', 'Ticket not found', null, { status: 404 });
    }
    
    const oldAssigneeId = currentTicket.assigneeId;
    
    const updateData: Partial<typeof tickets.$inferInsert> = {};
    
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (sentiment !== undefined) updateData.sentiment = sentiment;
    if (ai_summary !== undefined) updateData.ai_summary = ai_summary;
    if (ai_suggested_assignee_id !== undefined) updateData.ai_suggested_assignee_id = ai_suggested_assignee_id;
    if (validationResult.data.opportunityId !== undefined) {
      updateData.opportunityId = validationResult.data.opportunityId;
    }
    
    let newAssigneeId = oldAssigneeId;
    
    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        newAssigneeId = null;
        updateData.assigneeId = null;
      } else {
        const assignee = await db.query.users.findFirst({
          where: eq(users.id, assigneeId),
          columns: { id: true }
        });
        if (!assignee) {
          return apiError('not_found', `Assignee with ID "${assigneeId}" not found`, null, { status: 404 });
        }
        newAssigneeId = assigneeId;
        updateData.assigneeId = assigneeId;
      }
    } else if (assigneeEmail !== undefined) {
      if (assigneeEmail === null) {
        newAssigneeId = null;
        updateData.assigneeId = null;
      } else {
        const assignee = await db.query.users.findFirst({
          where: eq(users.email, assigneeEmail),
          columns: { id: true }
        });
        if (!assignee) {
          return apiError('not_found', `Assignee with email "${assigneeEmail}" not found`, null, { status: 404 });
        }
        newAssigneeId = assignee.id;
        updateData.assigneeId = assignee.id;
      }
    }
    
    updateData.updatedAt = new Date();
    
    if (newAssigneeId !== oldAssigneeId) {
      updateData.assigneeId = newAssigneeId;
    }
    
    let notificationSent = false;
    if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
      console.log(`API Info: Assignee changed for ticket ${ticketId}. Old: ${oldAssigneeId}, New: ${newAssigneeId}. Attempting notification...`);
      try {
        const newAssigneeUser = await db.query.users.findFirst({
          where: eq(users.id, newAssigneeId),
          columns: { email: true, name: true }
        });
        if (newAssigneeUser?.email) {
          const ticketUrl = `${env.NEXT_PUBLIC_APP_URL}/tickets/${ticketId}`;
          const emailSubject = `Ticket Assigned: #${ticketId} - ${currentTicket.title}`;
          const emailBody = `<p>Hello ${newAssigneeUser.name || 'User'},</p><p>You have been assigned ticket #${ticketId}: "${currentTicket.title}".</p><p>You can view the ticket details here:</p><p><a href="${ticketUrl}">${ticketUrl}</a></p><p>Thank you,<br/>Ticket System</p>`;
          const emailSent = await sendNotificationEmail({ recipientEmail: newAssigneeUser.email, recipientName: newAssigneeUser.name || undefined, subject: emailSubject, htmlBody: emailBody, senderName: "Ticket System" });
          if (emailSent) {
            notificationSent = true;
            console.log(`API Info: Assignment notification email sent to ${newAssigneeUser.email} for ticket ${ticketId}.`);
          } else {
            console.error(`API Error: Failed to send assignment notification email for ticket ${ticketId} to ${newAssigneeUser.email}.`);
          }
        } else {
          console.warn(`API Warning: Could not find email for new assignee ID ${newAssigneeId} on ticket ${ticketId}. Notification not sent.`);
        }
      } catch (notificationError) {
        console.error(`API Error: Exception during assignment notification for ticket ${ticketId}:`, notificationError);
      }
    }
    
    const [updatedTicket] = await db
      .update(tickets)
      .set(updateData)
      .where(eq(tickets.id, ticketId))
      .returning();
    
    console.log(`API Info [PUT /api/tickets/${ticketIdStr}]: Ticket updated successfully. Notification sent: ${notificationSent}`);
    return apiSuccess({ ticket: updatedTicket });

  } catch (error) {
    console.error(`API Error [PUT /api/tickets/${ticketIdStr}]:`, error);
    if (error instanceof Error && error.message === 'Invalid ticket ID format') {
      return apiError('invalid_id', 'Invalid ticket ID format', null, { status: 400 });
    }
    return apiError('internal_error', 'Failed to update ticket', null, { status: 500 });
  }
}

// --- DELETE: Delete a ticket ---
export async function DELETE(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.api.middleware(request as NextRequest);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  let ticketIdStr: string = 'unknown_id_in_DELETE_handler';
  try {
    const params = await paramsPromise;
    ticketIdStr = params.id;

    const ticketId = parseTicketIdString(ticketIdStr);

    // Check authorization first (admin only)
    const authResult = await checkTicketDeleteAccess(ticketId);
    if (!authResult.authorized) {
      return apiError('forbidden', authResult.error || 'Access denied', null, { status: authResult.status || 403 });
    }

    // Enqueue RAG cleanup job BEFORE deleting the ticket
    // This ensures the RAG source is cleaned up to prevent orphaned sources
    await enqueueRagJob('ticket', ticketId.toString(), 'delete');

    await db.delete(tickets).where(eq(tickets.id, ticketId));

    console.log(`API Info [DELETE /api/tickets/${ticketIdStr}]: Ticket deleted successfully.`);
    return apiSuccess({ deleted: true });

  } catch (error) {
    console.error(`API Error [DELETE /api/tickets/${ticketIdStr}]:`, error);
    if (error instanceof Error && error.message === 'Invalid ticket ID format') {
      return apiError('invalid_id', 'Invalid ticket ID format', null, { status: 400 });
    }
    return apiError('internal_error', 'Failed to delete ticket', null, { status: 500 });
  }
} 
