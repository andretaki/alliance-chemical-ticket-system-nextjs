import { NextResponse, NextRequest } from 'next/server';
import { db, ticketComments, tickets, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';

// --- Zod Schema for Validation ---
const createCommentSchema = z.object({
  content: z.string().min(1, { message: "Comment content is required" }),
  // commenterId will come from auth session
});

// Helper to parse and validate ticket ID
const getTicketId = (params: { id: string }) => {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw new Error('Invalid ticket ID');
  }
  return id;
};

// POST: Add a new comment to a ticket
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- Authentication Check ---
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in to comment.' }, { status: 401 });
    }
    // --- End Authentication Check ---

    // Parse and validate ID
    const { id } = await params;
    const ticketId = getTicketId({ id });
    
    // Check if ticket exists
    const ticketExists = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: { id: true }
    });

    if (!ticketExists) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Get request body
    const body = await request.json();

    // Validate input
    const validationResult = createCommentSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json({ error: "Invalid input", details: errors }, { status: 400 });
    }

    const { content } = validationResult.data;

    // User ID from authentication - already string type which matches schema
    const commenterId = session.user.id;
    
    // Get commenter details for convenience
    const commenter = await db.query.users.findFirst({
      where: eq(users.id, commenterId),
      columns: { id: true, name: true, email: true }
    });

    if (!commenter) {
      return NextResponse.json({ error: 'Commenter not found' }, { status: 404 });
    }

    // Create the comment
    const [newComment] = await db.insert(ticketComments)
      .values({
        commentText: content,
        ticketId,
        commenterId,
      })
      .returning();

    // Update the ticket's updatedAt timestamp
    await db.update(tickets)
      .set({ updatedAt: new Date() })
      .where(eq(tickets.id, ticketId));

    // Fetch the comment with commenter details for response
    const commentWithDetails = await db.query.ticketComments.findFirst({
      where: eq(ticketComments.id, newComment.id),
      with: {
        commenter: {
          columns: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    console.log(`API Info [POST /api/tickets/${ticketId}/comments]: Comment ${newComment.id} created successfully.`);
    return NextResponse.json(
      { message: 'Comment added successfully', comment: commentWithDetails },
      { status: 201 }
    );
  } catch (error) {
    console.error(`API Error [POST /api/tickets/comments]:`, error);
    
    // Handle specific error types
    if (error instanceof Error && error.message === 'Invalid ticket ID') {
      return NextResponse.json({ error: 'Invalid ticket ID format' }, { status: 400 });
    }
    
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

// GET: Fetch all comments for a specific ticket
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Parse and validate ID
    const { id } = await params;
    const ticketId = getTicketId({ id });

    // Check if ticket exists
    const ticketExists = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: { id: true }
    });

    if (!ticketExists) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Fetch all comments for this ticket with commenter information
    const comments = await db.query.ticketComments.findMany({
      where: eq(ticketComments.ticketId, ticketId),
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
    });

    // Optional: Filter internal notes based on user role
    // TODO: Add role-based filtering for internal notes
    // const currentUser = await getCurrentUser();
    // const visibleComments = comments.filter(comment => 
    //   !comment.isInternalNote || currentUser.role === 'admin' || currentUser.role === 'staff'
    // );

    return NextResponse.json(comments);
  } catch (error) {
    console.error(`API Error [GET /api/tickets/comments]:`, error);
    
    // Handle specific error types
    if (error instanceof Error && error.message === 'Invalid ticket ID') {
      return NextResponse.json({ error: 'Invalid ticket ID format' }, { status: 400 });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
} 