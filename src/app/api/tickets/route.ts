// src/app/api/tickets/route.ts
// Thin API layer - delegates to Service Layer
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { TicketService } from '@/services/TicketService';
import { rateLimiters } from '@/lib/rateLimiting';
import { ValidationError } from '@/lib/validators';
import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, ticketSentimentEnum } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/apiResponse';

// --- Zod Validation Schemas ---
const CreateTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().min(1, 'Description is required'),
  assigneeEmail: z.string().email().nullable().optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).optional().default('medium'),
  status: z.enum(ticketStatusEnum.enumValues).optional().default('new'),
  type: z.enum(ticketTypeEcommerceEnum.enumValues).nullable().optional(),
  opportunityId: z.number().int().positive().nullable().optional(),

  // Customer information
  senderEmail: z.string().email().nullable().optional(),
  senderPhone: z.string().nullable().optional(),
  senderCompany: z.string().nullable().optional(),
  orderNumber: z.string().nullable().optional(),

  // AI-generated fields
  sentiment: z.enum(ticketSentimentEnum.enumValues).nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  ai_suggested_assignee_id: z.string().nullable().optional(),
});

// --- GET: Fetch tickets with filtering and pagination ---
export async function GET(request: NextRequest) {
  // Rate Limiting
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { session, error } = await getServerSession();

    if (error || !session?.user) {
      return apiError('unauthorized', 'Unauthorized - Please sign in', null, { status: 401 });
    }

    // Extract and validate query parameters
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || undefined;
    const priorityFilter = url.searchParams.get('priority') || undefined;
    const assigneeIdFilter = url.searchParams.get('assigneeId') || undefined;
    const searchTerm = url.searchParams.get('search') || undefined;
    const sortBy = url.searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    // Delegate to Service Layer
    const ticketService = new TicketService();
    const result = await ticketService.getTickets({
      statusFilter,
      priorityFilter,
      assigneeIdFilter,
      searchTerm,
      sortBy,
      sortOrder,
      page,
      limit,
      userId: session.user.id,
      userRole: session.user.role,
    });

    return apiSuccess(result);

  } catch (error) {
    console.error('[API GET /api/tickets] Error:', error);

    if (error instanceof ValidationError) {
      return apiError('validation_error', 'Validation Error', { field: error.field, message: error.message }, { status: 400 });
    }

    return apiError('internal_error', 'Failed to fetch tickets', null, { status: 500 });
  }
}

// --- POST: Create a new ticket ---
export async function POST(request: NextRequest) {
  // Rate Limiting
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { session, error } = await getServerSession();

    if (error || !session?.user) {
      return apiError('unauthorized', 'Unauthorized - Please sign in to create a ticket', null, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = CreateTicketSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return apiError('validation_error', 'Invalid input', errors, { status: 400 });
    }

    const {
      title,
      description,
      assigneeEmail,
      priority,
      status,
      type,
      senderEmail,
      senderPhone,
      senderCompany,
      orderNumber,
      opportunityId,
      sentiment,
      ai_summary,
      ai_suggested_assignee_id,
    } = validationResult.data;

    // Delegate to Service Layer
    const ticketService = new TicketService();
    const newTicket = await ticketService.createTicket({
      title,
      description,
      assigneeEmail,
      priority,
      status,
      type,
      senderEmail,
      senderPhone,
      senderCompany,
      orderNumber,
      opportunityId,
      sentiment,
      ai_summary,
      ai_suggested_assignee_id,
      reporterId: session.user.id, // Current user is the reporter
    });

    console.log(`[API POST /api/tickets] Ticket ${newTicket.id} created successfully by user ${session.user.id}`);

    return apiSuccess({ ticket: newTicket }, { status: 201 });

  } catch (error) {
    console.error('[API POST /api/tickets] Error:', error);

    if (error instanceof ValidationError) {
      return apiError('validation_error', 'Validation Error', { field: error.field, message: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return apiError('not_found', error.message, null, { status: 404 });
    }

    return apiError('internal_error', 'Failed to create ticket', null, { status: 500 });
  }
}
