import { NextResponse, NextRequest } from 'next/server';
import { db, tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketSentimentEnum, ticketTypeEcommerceEnum } from '@/lib/db';
import { eq, desc, asc, and, or, ilike, sql, isNull, inArray, count, SQL, AnyColumn } from 'drizzle-orm';
import { z } from 'zod';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/authOptions';
import { customerAutoCreateService } from '@/services/customerAutoCreateService';

// --- Zod Schema for Validation ---
const createTicketSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(255),
  description: z.string().min(1, { message: "Description is required" }),
  assigneeEmail: z.string().email().nullable().optional(), // Optional assignee
  priority: z.enum(ticketPriorityEnum.enumValues).optional().default(ticketPriorityEnum.enumValues[1]), // Default medium
  status: z.enum(ticketStatusEnum.enumValues).optional().default(ticketStatusEnum.enumValues[0]), // Default open
  type: z.enum(ticketTypeEcommerceEnum.enumValues).nullable().optional(), // Optional ticket type
  // Customer information fields
  senderEmail: z.string().email().nullable().optional(),
  senderPhone: z.string().nullable().optional(),
  sendercompany: z.string().optional(), // Add sendercompany field
  orderNumber: z.string().optional(),
  // Email-related fields for tickets created from emails
  senderName: z.string().optional(),
  externalMessageId: z.string().optional(),
  // New AI fields
  sentiment: z.enum(ticketSentimentEnum.enumValues).nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  ai_suggested_assignee_id: z.string().nullable().optional(),
});

// --- GET: Fetch tickets with filtering and sorting ---
export async function GET(request: NextRequest) {
  try {
    // Extract query parameters with pagination
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || '';
    const priorityFilter = url.searchParams.get('priority') || '';
    const assigneeIdFilter = url.searchParams.get('assigneeId') || '';
    const searchTerm = url.searchParams.get('search') || '';
    const sortBy = url.searchParams.get('sortBy') || 'createdAt';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';

    // Pagination parameters with serverless-friendly defaults
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50'))); // Max 100 for serverless
    const offset = (page - 1) * limit;

    console.log('API [GET /api/tickets]: Filters applied:', {
      statusFilter,
      priorityFilter, 
      assigneeIdFilter,
      searchTerm,
      sortBy,
      sortOrder,
      page,
      limit
    });

    // --- Build WHERE clause ---
    const whereConditions: SQL[] = [];

    if (statusFilter) {
      const statuses = statusFilter
        .split(',')
        .map(s => s.trim())
        .filter(s => ticketStatusEnum.enumValues.includes(s as any));
      
      if (statuses.length > 0) {
        whereConditions.push(inArray(tickets.status, statuses as typeof ticketStatusEnum.enumValues));
      }
    }

    if (priorityFilter) {
      const priorities = priorityFilter
        .split(',')
        .map(p => p.trim())
        .filter(p => ticketPriorityEnum.enumValues.includes(p as any));
      
      if (priorities.length > 0) {
        whereConditions.push(inArray(tickets.priority, priorities as typeof ticketPriorityEnum.enumValues));
      }
    }

    if (assigneeIdFilter) {
      if (assigneeIdFilter === 'unassigned') {
        whereConditions.push(isNull(tickets.assigneeId));
      } else {
        whereConditions.push(eq(tickets.assigneeId, assigneeIdFilter));
      }
    }

    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      const searchConditions = or(
        sql`LOWER(${tickets.title}) LIKE ${searchPattern}`,
        sql`LOWER(${tickets.description}) LIKE ${searchPattern}`,
        sql`LOWER(${tickets.senderEmail}) LIKE ${searchPattern}`,
        sql`LOWER(${tickets.senderName}) LIKE ${searchPattern}`,
        sql`LOWER(${tickets.orderNumber}) LIKE ${searchPattern}`,
        sql`LOWER(${tickets.trackingNumber}) LIKE ${searchPattern}`
      );

      if (searchConditions) {
        whereConditions.push(searchConditions);
      }
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // --- Build ORDER BY clause ---
    const sortableColumns: Record<string, AnyColumn> = {
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
    };
    
    const columnToSort = sortableColumns[sortBy] ?? tickets.createdAt;
    const safeSortOrder = sortOrder.toLowerCase() === 'asc' ? asc : desc;
    const orderByClause = safeSortOrder(columnToSort);

    // --- Fetch Data with Pagination ---
    const filteredTickets = await db.query.tickets.findMany({
      where: whereClause,
      orderBy: orderByClause,
      limit,
      offset,
      columns: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        senderEmail: true,
        senderName: true,
        externalMessageId: true,
        description: true,
        orderNumber: true,
        trackingNumber: true,
        assigneeId: true,
        reporterId: true,
        type: true,
        sentiment: true,
        ai_summary: true,
        ai_suggested_assignee_id: true,
      },
      with: {
        assignee: { columns: { id: true, name: true, email: true } },
        reporter: { columns: { id: true, name: true, email: true } },
        aiSuggestedAssignee: { columns: { id: true, name: true, email: true } }
      },
    });

    console.log(`API [GET /api/tickets]: Found ${filteredTickets.length} tickets with current filters.`);

    // Get total count for pagination (only if needed)
    let totalCount = 0;
    if (filteredTickets.length === limit) {
      // Only count if we might have more pages
      const countResult = await db.select({ count: count() })
        .from(tickets)
        .where(whereClause);
      totalCount = countResult[0]?.count || 0;
    } else {
      totalCount = offset + filteredTickets.length;
    }

    // --- Format Response ---
    const responseData = filteredTickets.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      type: t.type,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      assigneeName: t.assignee?.name ?? 'Unassigned',
      assigneeId: t.assignee?.id ?? null,
      assigneeEmail: t.assignee?.email ?? null,
      reporterName: t.reporter?.name ?? 'Unknown',
      reporterId: t.reporter?.id ?? null,
      reporterEmail: t.reporter?.email ?? null,
      senderEmail: t.senderEmail,
      senderName: t.senderName,
      // Truncate description for list view to reduce payload size
      description: t.description ? (t.description.length > 200 ? t.description.substring(0, 200) + '...' : t.description) : null,
      isFromEmail: Boolean(t.externalMessageId),
      orderNumber: t.orderNumber,
      trackingNumber: t.trackingNumber,
      sentiment: t.sentiment,
      // Truncate AI summary for list view
      ai_summary: t.ai_summary ? (t.ai_summary.length > 150 ? t.ai_summary.substring(0, 150) + '...' : t.ai_summary) : null,
      ai_suggested_assignee_id: t.ai_suggested_assignee_id,
      aiSuggestedAssigneeName: t.aiSuggestedAssignee?.name ?? null,
      aiSuggestedAssigneeEmail: t.aiSuggestedAssignee?.email ?? null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: responseData,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    console.error('API Error [GET /api/tickets]:', error);
    // Ensure the full error is logged on the server
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return NextResponse.json({ error: 'Failed to fetch tickets', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// --- POST: Create a new ticket ---
export async function POST(request: Request) {
  try {
    // --- Authentication Check ---
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in to create a ticket.' }, { status: 401 });
    }
    // --- End Authentication Check ---

    const body = await request.json();

    // --- Input Validation ---
    const validationResult = createTicketSchema.safeParse(body);
    if (!validationResult.success) {
      // Format Zod errors for a user-friendly response
      const errors = validationResult.error.flatten().fieldErrors;
      console.warn('API Validation Error [POST /api/tickets]:', errors);
      return NextResponse.json({ error: "Invalid input", details: errors }, { status: 400 });
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
      sendercompany,
      senderName,
      externalMessageId,
      // New AI fields
      sentiment,
      ai_summary,
      ai_suggested_assignee_id
    } = validationResult.data;

    // Initialize assigneeId as null (text type in schema)
    let assigneeId: string | null = null;
    if (assigneeEmail) {
      const assignee = await db.query.users.findFirst({
        where: eq(users.email, assigneeEmail),
        columns: { id: true }
      });
      if (!assignee) {
        // If assignee is specified but not found, return an error
        return NextResponse.json({ error: `Assignee with email "${assigneeEmail}" not found` }, { status: 404 });
      }
      assigneeId = assignee.id; // Drizzle schema expects string for text type
    }

    // User ID from session is already string which matches schema
    const reporterId = session.user.id;

    // --- Create Ticket ---
    const [newTicket] = await db.insert(tickets).values({
      title,
      description,
      assigneeId,
      reporterId,
      priority, // Uses validated default if not provided
      status, // Uses validated default if not provided
      type,
      senderEmail: senderEmail || null,
      senderPhone: senderPhone || null,
      sendercompany: sendercompany || null,
      senderName: senderName || null,
      externalMessageId: externalMessageId || null,
      // Include new AI fields
      sentiment: sentiment || null,
      ai_summary: ai_summary || null,
      ai_suggested_assignee_id: ai_suggested_assignee_id || null,
    }).returning();

    console.log(`API Info [POST /api/tickets]: Ticket ${newTicket.id} created successfully.`);

    // --- Auto-create customer in Shopify if enabled and customer info is provided ---
    if (senderEmail && customerAutoCreateService.isAutoCreateEnabled()) {
      try {
        console.log(`[POST /api/tickets] Attempting to auto-create customer for ticket ${newTicket.id}`);
        
        // Parse sender name into first and last name
        let firstName: string | undefined;
        let lastName: string | undefined;
        
        if (senderName) {
          const nameParts = senderName.trim().split(' ');
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ') || undefined;
        }

        const customerResult = await customerAutoCreateService.createCustomerFromTicket({
          email: senderEmail,
          firstName,
          lastName,
          phone: senderPhone || undefined,
          company: sendercompany || undefined,
          ticketId: newTicket.id,
          source: externalMessageId ? 'email' : 'ticket'
        });

        if (customerResult.success) {
          if (customerResult.alreadyExists) {
            console.log(`[POST /api/tickets] Customer already exists in Shopify for ticket ${newTicket.id}: ${senderEmail}`);
          } else {
            console.log(`[POST /api/tickets] Successfully created customer in Shopify for ticket ${newTicket.id}: ${senderEmail} (ID: ${customerResult.customerId})`);
          }
        } else if (customerResult.skipped) {
          console.log(`[POST /api/tickets] Skipped customer creation for ticket ${newTicket.id}: ${customerResult.skipReason}`);
        } else {
          console.warn(`[POST /api/tickets] Failed to create customer in Shopify for ticket ${newTicket.id}: ${customerResult.error}`);
        }
      } catch (customerError) {
        // Don't fail ticket creation if customer creation fails
        console.error(`[POST /api/tickets] Error during customer auto-creation for ticket ${newTicket.id}:`, customerError);
      }
    } else if (senderEmail) {
      console.log(`[POST /api/tickets] Customer auto-creation is disabled, skipping for ticket ${newTicket.id}`);
    }

    return NextResponse.json(
      { message: 'Ticket created successfully', ticket: newTicket },
      { status: 201 }
    );

  } catch (error) {
    console.error('API Error [POST /api/tickets]:', error);
    // Add check for specific DB errors if necessary (e.g., unique constraints)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}