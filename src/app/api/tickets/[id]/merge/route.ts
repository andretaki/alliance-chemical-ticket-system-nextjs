import { NextRequest, NextResponse } from 'next/server';
import { db, tickets, ticketComments, ticketAttachments } from '@/lib/db';
import { eq, inArray, and, ne, isNull } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { z } from 'zod';

const mergeTicketsSchema = z.object({
  sourceTicketIds: z.array(z.number().int().positive()).min(1, 'At least one source ticket ID is required.'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user || !['admin', 'manager'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to merge tickets.' }, { status: 403 });
    }

    const primaryTicketId = parseInt(resolvedParams.id, 10);
    if (isNaN(primaryTicketId)) {
      return NextResponse.json({ error: 'Invalid primary ticket ID.' }, { status: 400 });
    }

    const body = await request.json();
    const validation = mergeTicketsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: validation.error.format() }, { status: 400 });
    }

    const { sourceTicketIds } = validation.data;

    if (sourceTicketIds.includes(primaryTicketId)) {
      return NextResponse.json({ error: 'A ticket cannot be merged into itself.' }, { status: 400 });
    }

    // --- Database Transaction ---
    const mergeResult = await db.transaction(async (tx) => {
      // 1. Fetch and validate all tickets involved
      const allTicketIds = [primaryTicketId, ...sourceTicketIds];
      const allTickets = await tx.query.tickets.findMany({
        where: inArray(tickets.id, allTicketIds),
        columns: { id: true, title: true, mergedIntoTicketId: true },
      });

      if (allTickets.length !== allTicketIds.length) {
        throw new Error('One or more tickets not found.');
      }

      const primaryTicket = allTickets.find(t => t.id === primaryTicketId);
      if (!primaryTicket || primaryTicket.mergedIntoTicketId) {
        throw new Error(`Primary ticket #${primaryTicketId} is not a valid merge target.`);
      }

      const sourceTickets = allTickets.filter(t => sourceTicketIds.includes(t.id));
      for (const sourceTicket of sourceTickets) {
        if (sourceTicket.mergedIntoTicketId) {
          throw new Error(`Ticket #${sourceTicket.id} has already been merged.`);
        }
      }

      // 2. Move comments and attachments
      await tx.update(ticketComments)
        .set({ ticketId: primaryTicketId })
        .where(inArray(ticketComments.ticketId, sourceTicketIds));

      await tx.update(ticketAttachments)
        .set({ ticketId: primaryTicketId })
        .where(and(inArray(ticketAttachments.ticketId, sourceTicketIds), isNull(ticketAttachments.commentId)));

      // 3. Add system notes to the primary ticket
      const systemComments = sourceTickets.map(sourceTicket => ({
        ticketId: primaryTicketId,
        commentText: `**System Note:** Merged ticket #${sourceTicket.id} ("${sourceTicket.title}") into this ticket.`,
        commenterId: session.user!.id,
        isInternalNote: true,
      }));
      await tx.insert(ticketComments).values(systemComments);

      // 4. Update source tickets to be closed and linked
      await tx.update(tickets)
        .set({
          status: 'closed',
          mergedIntoTicketId: primaryTicketId,
          updatedAt: new Date(),
        })
        .where(inArray(tickets.id, sourceTicketIds));

      // 5. Touch the primary ticket's updatedAt timestamp
      await tx.update(tickets)
        .set({ updatedAt: new Date() })
        .where(eq(tickets.id, primaryTicketId));

      return { success: true, primaryTicketId };
    });

    return NextResponse.json({
      message: `Successfully merged ${sourceTicketIds.length} ticket(s) into ticket #${primaryTicketId}.`,
      data: mergeResult,
    });
  } catch (error: any) {
    console.error('Error merging tickets:', error);
    return NextResponse.json({ error: error.message || 'An internal error occurred while merging tickets.' }, { status: 500 });
  }
} 