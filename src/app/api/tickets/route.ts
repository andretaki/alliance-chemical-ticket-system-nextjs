// src/app/api/tickets/route.ts
// Thin API layer - delegates to Service Layer
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { TicketService } from '@/services/TicketService';
import { rateLimiters } from '@/lib/rateLimiting';
import { ValidationError } from '@/lib/validators';
import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, ticketSentimentEnum } from '@/lib/db';

// --- Zod Validation Schemas ---
const CreateTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().min(1, 'Description is required'),
  assigneeEmail: z.string().email().nullable().optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).optional().default('medium'),
  status: z.enum(ticketStatusEnum.enumValues).optional().default('new'),
  type: z.enum(ticketTypeEcommerceEnum.enumValues).nullable().optional(),

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

// --- Standardized Response Builder ---
function jsonResponse(data: any, status: number = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Response-Time': String(Date.now()),
    },
  });
}

function errorResponse(message: string, status: number = 500, details?: any) {
  return jsonResponse(
    {
      error: message,
      ...(details && { details }),
    },
    status
  );
}

// --- GET: Fetch tickets with filtering and pagination ---
export async function GET(request: NextRequest) {
  // Rate Limiting
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { session, error } = await getServerSession();

    if (error || !session?.user) {
      return errorResponse('Unauthorized - Please sign in', 401);
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

    return jsonResponse(result);

  } catch (error) {
    console.error('[API GET /api/tickets] Error:', error);

    if (error instanceof ValidationError) {
      return errorResponse('Validation Error', 400, { field: error.field, message: error.message });
    }

    return errorResponse('Failed to fetch tickets', 500);
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
      return errorResponse('Unauthorized - Please sign in to create a ticket', 401);
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = CreateTicketSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return errorResponse('Invalid input', 400, errors);
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
      sentiment,
      ai_summary,
      ai_suggested_assignee_id,
      reporterId: session.user.id, // Current user is the reporter
    });

    console.log(`[API POST /api/tickets] Ticket ${newTicket.id} created successfully by user ${session.user.id}`);

    return jsonResponse(
      {
        message: 'Ticket created successfully',
        ticket: newTicket,
      },
      201
    );

  } catch (error) {
    console.error('[API POST /api/tickets] Error:', error);

    if (error instanceof ValidationError) {
      return errorResponse('Validation Error', 400, { field: error.field, message: error.message });
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(error.message, 404);
    }

    return errorResponse('Failed to create ticket', 500);
  }
}
