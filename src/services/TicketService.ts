// src/services/TicketService.ts
// Business Logic Layer for Ticket Management
import { db, tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/lib/db';
import { eq, desc, asc, and, or, inArray, count, sql, isNull, SQL, AnyColumn } from 'drizzle-orm';
import { validatePagination, sanitizeSearchTerm, ValidationError } from '@/lib/validators';
import { outboxService } from '@/services/outboxService';

// --- Types ---
export interface GetTicketsOptions {
  statusFilter?: string;
  priorityFilter?: string;
  assigneeIdFilter?: string;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  userId: string;
  userRole: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  assigneeEmail?: string | null;
  priority?: typeof ticketPriorityEnum.enumValues[number];
  status?: typeof ticketStatusEnum.enumValues[number];
  type?: typeof ticketTypeEcommerceEnum.enumValues[number] | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  senderCompany?: string | null;
  orderNumber?: string | null;
  sentiment?: string | null;
  ai_summary?: string | null;
  ai_suggested_assignee_id?: string | null;
  reporterId: string;
}

export interface GetTicketByIdOptions {
  includeComments?: boolean;
  includeAttachments?: boolean;
  includeAssignee?: boolean;
  includeReporter?: boolean;
}

// --- Service Class ---
export class TicketService {
  /**
   * Get tickets with filtering, sorting, and pagination
   */
  async getTickets(options: GetTicketsOptions) {
    const {
      statusFilter,
      priorityFilter,
      assigneeIdFilter,
      searchTerm,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      userId,
      userRole,
    } = options;

    // Validate pagination parameters
    const { page, limit } = validatePagination({
      page: options.page,
      limit: options.limit,
    });

    const offset = (page - 1) * limit;

    console.log('[TicketService] Fetching tickets with filters:', {
      statusFilter,
      priorityFilter,
      assigneeIdFilter,
      searchTerm,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    // Build WHERE clause
    const whereConditions: SQL[] = [];

    // Role-based filtering
    if (userRole === 'user') {
      // Users can only see tickets they created or are assigned to
      whereConditions.push(
        or(
          eq(tickets.reporterId, userId),
          eq(tickets.assigneeId, userId)
        )!
      );
    }

    // Status filter
    if (statusFilter) {
      const statuses = statusFilter
        .split(',')
        .map(s => s.trim())
        .filter(s => ticketStatusEnum.enumValues.includes(s as any));

      if (statuses.length > 0) {
        whereConditions.push(inArray(tickets.status, statuses as typeof ticketStatusEnum.enumValues));
      }
    }

    // Priority filter
    if (priorityFilter) {
      const priorities = priorityFilter
        .split(',')
        .map(p => p.trim())
        .filter(p => ticketPriorityEnum.enumValues.includes(p as any));

      if (priorities.length > 0) {
        whereConditions.push(inArray(tickets.priority, priorities as typeof ticketPriorityEnum.enumValues));
      }
    }

    // Assignee filter
    if (assigneeIdFilter) {
      if (assigneeIdFilter === 'unassigned') {
        whereConditions.push(isNull(tickets.assigneeId));
      } else {
        whereConditions.push(eq(tickets.assigneeId, assigneeIdFilter));
      }
    }

    // Search filter - use full-text search if available, fallback to LIKE
    if (searchTerm) {
      const sanitized = sanitizeSearchTerm(searchTerm);
      if (sanitized) {
        // Try full-text search first (much faster with GIN index)
        // Fallback to LIKE for partial matches or if FTS not set up
        const useFTS = sanitized.length >= 3; // FTS works better with 3+ chars

        if (useFTS) {
          // PostgreSQL full-text search using plainto_tsquery
          const ftsCondition = sql`${tickets.searchVector} @@ plainto_tsquery('english', ${sanitized})`;
          whereConditions.push(ftsCondition);
        } else {
          // Fallback to LIKE for short searches
          const searchPattern = `%${sanitized.toLowerCase()}%`;
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
      }
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Build ORDER BY clause
    const sortableColumns: Record<string, AnyColumn> = {
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
    };

    const columnToSort = sortableColumns[sortBy] ?? tickets.createdAt;
    const safeSortOrder = sortOrder === 'asc' ? asc : desc;
    const orderByClause = safeSortOrder(columnToSort);

    // Fetch tickets
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
        type: true,
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
        sentiment: true,
        ai_summary: true,
        ai_suggested_assignee_id: true,
      },
      with: {
        assignee: { columns: { id: true, name: true, email: true } },
        reporter: { columns: { id: true, name: true, email: true } },
        aiSuggestedAssignee: { columns: { id: true, name: true, email: true } },
      },
    });

    // Get total count for pagination (only if needed)
    let totalCount = 0;
    if (filteredTickets.length === limit) {
      const countResult = await db.select({ count: count() }).from(tickets).where(whereClause);
      totalCount = countResult[0]?.count || 0;
    } else {
      totalCount = offset + filteredTickets.length;
    }

    // Format response
    const data = filteredTickets.map(t => ({
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
      description: t.description ? (t.description.length > 200 ? t.description.substring(0, 200) + '...' : t.description) : null,
      isFromEmail: Boolean(t.externalMessageId),
      orderNumber: t.orderNumber,
      trackingNumber: t.trackingNumber,
      sentiment: t.sentiment,
      ai_summary: t.ai_summary ? (t.ai_summary.length > 150 ? t.ai_summary.substring(0, 150) + '...' : t.ai_summary) : null,
      ai_suggested_assignee_id: t.ai_suggested_assignee_id,
      aiSuggestedAssigneeName: t.aiSuggestedAssignee?.name ?? null,
      aiSuggestedAssigneeEmail: t.aiSuggestedAssignee?.email ?? null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get a single ticket by ID
   */
  async getTicketById(ticketId: number, options: GetTicketByIdOptions = {}) {
    const {
      includeComments = false,
      includeAttachments = false,
      includeAssignee = true,
      includeReporter = true,
    } = options;

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        ...(includeAssignee && { assignee: true }),
        ...(includeReporter && { reporter: true }),
        ...(includeComments && {
          comments: {
            with: {
              commenter: true,
              ...(includeAttachments && { attachments: true }),
            },
            orderBy: (comments, { asc }) => [asc(comments.createdAt)],
          },
        }),
        ...(includeAttachments && { attachments: true }),
      },
    });

    return ticket;
  }

  /**
   * Get active tickets for sidebar display
   */
  async getActiveTicketsForSidebar(options: { limit?: number } = {}) {
    const { limit = 50 } = options;

    const ticketList = await db.query.tickets.findMany({
      where: and(
        or(
          eq(tickets.status, 'new'),
          eq(tickets.status, 'open'),
          eq(tickets.status, 'pending_customer')
        )
      ),
      columns: {
        id: true,
        title: true,
        senderName: true,
        status: true,
        updatedAt: true,
      },
      orderBy: [desc(tickets.updatedAt)],
      limit,
    });

    return ticketList.map(t => ({
      ...t,
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  /**
   * Create a new ticket
   */
  async createTicket(input: CreateTicketInput) {
    const {
      title,
      description,
      assigneeEmail,
      priority = 'medium',
      status = 'new',
      type,
      senderEmail,
      senderPhone,
      senderCompany,
      orderNumber,
      sentiment,
      ai_summary,
      ai_suggested_assignee_id,
      reporterId,
    } = input;

    // Resolve assignee if email provided
    let assigneeId: string | null = null;
    if (assigneeEmail) {
      const assignee = await db.query.users.findFirst({
        where: eq(users.email, assigneeEmail),
        columns: { id: true },
      });

      if (!assignee) {
        throw new Error(`Assignee with email "${assigneeEmail}" not found`);
      }

      assigneeId = assignee.id;
    }

    // Create ticket
    const [newTicket] = await db.insert(tickets).values({
      title,
      description,
      assigneeId,
      reporterId,
      priority: priority as typeof ticketPriorityEnum.enumValues[number],
      status: status as typeof ticketStatusEnum.enumValues[number],
      type: type as typeof ticketTypeEcommerceEnum.enumValues[number] | null,
      senderEmail: senderEmail || null,
      senderPhone: senderPhone || null,
      senderCompany: senderCompany || null,
      orderNumber: orderNumber || null,
      sentiment: sentiment as any,
      ai_summary: ai_summary || null,
      ai_suggested_assignee_id: ai_suggested_assignee_id || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.log(`[TicketService] Ticket ${newTicket.id} created successfully`);

    // Enqueue CRM/customer sync to keep ticket creation fast and resilient
    try {
      await outboxService.enqueue('customer.sync', {
        ticketId: newTicket.id,
        senderEmail,
        senderPhone,
        senderCompany,
        reporterId,
        source: 'ticket',
        title,
      });
    } catch (err) {
      console.error(`[TicketService] Failed to enqueue customer sync for ticket ${newTicket.id}:`, err);
      // Do not block ticket creation on enqueue failure
    }

    return newTicket;
  }

  /**
   * Check if a user can view a ticket
   */
  canUserViewTicket(ticket: any, user: any): boolean {
    // Admin and manager can view all
    if (user.role === 'admin' || user.role === 'manager') {
      return true;
    }

    // User can view if they're the reporter or assignee
    return ticket.reporterId === user.id || ticket.assigneeId === user.id;
  }
}

// Export singleton instance
export const ticketService = new TicketService();
