import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/db';
import { tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketSentimentEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import { eq, desc, asc, and, or, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getServerSession } from "next-auth/next";

// --- Zod Schema for Validation ---
const createTicketSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(255),
  description: z.string().min(1, { message: "Description is required" }),
  assigneeEmail: z.string().email().nullable().optional(), // Optional assignee
  priority: z.enum(ticketPriorityEnum.enumValues).optional().default(ticketPriorityEnum.enumValues[1]), // Default medium
  status: z.enum(ticketStatusEnum.enumValues).optional().default(ticketStatusEnum.enumValues[0]), // Default open
  type: z.enum(ticketTypeEcommerceEnum.enumValues).nullable().optional(), // Optional ticket type
  // Customer information fields
  senderEmail: z.string().email().optional(),
  senderPhone: z.string().optional(),
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
    const { searchParams } = new URL(request.url);

    // --- Extract Filters ---
    const statusFilter = searchParams.get('status');
    const priorityFilter = searchParams.get('priority');
    const assigneeIdFilter = searchParams.get('assigneeId'); // Filter by assignee ID (string UUID)
    const searchTerm = searchParams.get('search');

    // --- Extract Sorting ---
    const sortBy = searchParams.get('sortBy') || 'createdAt'; // Default sort
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'; // Default desc

    // --- Build Where Clause Dynamically ---
    const conditions = [];
    if (statusFilter && ticketStatusEnum.enumValues.includes(statusFilter as any)) {
      conditions.push(eq(tickets.status, statusFilter as typeof ticketStatusEnum.enumValues[number]));
    }
    if (priorityFilter && ticketPriorityEnum.enumValues.includes(priorityFilter as any)) {
      conditions.push(eq(tickets.priority, priorityFilter as typeof ticketPriorityEnum.enumValues[number]));
    }
    if (assigneeIdFilter) {
      if (assigneeIdFilter === 'unassigned') {
        conditions.push(sql`${tickets.assigneeId} is null`);
      } else {
        // Assuming assigneeIdFilter is the UUID string if not 'unassigned'
        conditions.push(eq(tickets.assigneeId, assigneeIdFilter));
      }
    }
    if (searchTerm) {
      const term = `%${searchTerm}%`;
      conditions.push(
        or(
          ilike(tickets.title, term),
          ilike(sql`COALESCE(${tickets.description}, '')`, term),
          ilike(sql`COALESCE(${tickets.senderEmail}, '')`, term),
          ilike(sql`COALESCE(${tickets.orderNumber}, '')`, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // --- Build OrderBy Clause ---
    let orderByClause;
    const orderDirection = sortOrder === 'asc' ? asc : desc;

    switch (sortBy) {
      case 'title':
        orderByClause = [orderDirection(tickets.title)];
        break;
      case 'status':
        orderByClause = [orderDirection(tickets.status)];
        break;
      case 'priority':
        orderByClause = [orderDirection(tickets.priority)];
        break;
      case 'assignee':
        // Sorting by assignee name requires a join or subquery, which is more complex.
        // Sorting by assigneeId (UUID string) might not be ideal for user display.
        // We'll sort by assignee ID for now, acknowledging it might not be alphabetical.
        orderByClause = [orderDirection(tickets.assigneeId)];
        break;
      case 'updatedAt':
        orderByClause = [orderDirection(tickets.updatedAt)];
        break;
      case 'createdAt':
      default:
        orderByClause = [desc(tickets.createdAt)]; // Default sort by newest created
    }

    // --- Fetch Data ---
    const filteredTickets = await db.query.tickets.findMany({
      where: whereClause,
      orderBy: orderByClause,
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
        description: true, // Include description for search
        orderNumber: true, // Include order number for search
        trackingNumber: true,
        assigneeId: true, // Needed for filtering and relation
        reporterId: true, // Needed for relation
        type: true, // Include ticket type
        sentiment: true, // Include sentiment
        ai_summary: true, // Include AI summary
        ai_suggested_assignee_id: true, // Include AI suggested assignee
      },
      with: {
        assignee: { columns: { id: true, name: true, email: true } }, // Ensure User ID is fetched
        reporter: { columns: { id: true, name: true, email: true } }, // Ensure User ID is fetched
        aiSuggestedAssignee: { columns: { id: true, name: true, email: true } } // Include AI suggested assignee
      },
    });

    // --- Format Response ---
    // Map data to ensure consistent shape and convert dates
    const responseData = filteredTickets.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      type: t.type,
      createdAt: t.createdAt.toISOString(), // Send as ISO string
      updatedAt: t.updatedAt.toISOString(),
      assigneeName: t.assignee?.name ?? 'Unassigned',
      assigneeId: t.assignee?.id ?? null, // Explicitly null if no assignee
      assigneeEmail: t.assignee?.email ?? null,
      reporterName: t.reporter?.name ?? 'Unknown',
      reporterId: t.reporter?.id ?? null, // Explicitly null if no reporter (shouldn't happen based on schema)
      reporterEmail: t.reporter?.email ?? null,
      senderEmail: t.senderEmail,
      senderName: t.senderName,
      description: t.description,
      isFromEmail: Boolean(t.externalMessageId),
      orderNumber: t.orderNumber,
      trackingNumber: t.trackingNumber,
      // Include new AI fields
      sentiment: t.sentiment,
      ai_summary: t.ai_summary,
      ai_suggested_assignee_id: t.ai_suggested_assignee_id,
      aiSuggestedAssigneeName: t.aiSuggestedAssignee?.name ?? null,
      aiSuggestedAssigneeEmail: t.aiSuggestedAssignee?.email ?? null,
    }));

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('API Error [GET /api/tickets]:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

// --- POST: Create a new ticket ---
export async function POST(request: Request) {
  try {
    // --- Authentication Check ---
    const session = await getServerSession();
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