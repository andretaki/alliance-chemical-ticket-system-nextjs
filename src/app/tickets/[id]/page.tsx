// src/app/tickets/[id]/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import TicketViewClient from '@/components/TicketViewClient';
import { Metadata } from 'next';

interface TicketViewPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params: paramsPromise }: TicketViewPageProps): Promise<Metadata> {
    const params = await paramsPromise;
    const ticketId = parseInt(params.id, 10);
    if (isNaN(ticketId)) {
        return { title: 'Invalid Ticket - Issue Tracker' };
    }

    const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: { title: true },
    });

    return {
        title: ticket ? `Ticket #${ticketId}: ${ticket.title} - Issue Tracker` : 'Ticket Not Found - Issue Tracker',
        description: `Details and comments for ticket #${ticketId}.`,
    };
}

export default async function TicketViewPage({ params: paramsPromise }: TicketViewPageProps) {
  const params = await paramsPromise;
  const ticketId = parseInt(params.id, 10);

  if (isNaN(ticketId)) {
    notFound();
  }

  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: {
      // project: true, // Ensure this is REMOVED or commented out
      assignee: { columns: { id: true, name: true, email: true } },
      reporter: { columns: { id: true, name: true, email: true } },
      comments: {
        with: { commenter: { columns: { id: true, name: true, email: true } } },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      }
    }
  });

  if (!ticket) {
    notFound();
  }

  const serializedTicket = {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    comments: ticket.comments.map(comment => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
    })),
  };

  return (
      <div className="container-fluid py-4">
          <TicketViewClient initialTicket={serializedTicket as any} />
      </div>
  );
}