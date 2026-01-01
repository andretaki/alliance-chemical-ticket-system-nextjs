import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { tickets as ticketsSchema, users as usersSchema, agentProducts as productsSchema } from '@/db/schema';
import { eq } from 'drizzle-orm';
import CreateQuoteClient from '@/components/CreateQuoteClient';

export const metadata: Metadata = {
  title: 'Create Quote - Alliance Chemical',
  description: 'Create a new quote for a customer.',
};

interface CreateQuotePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CreateQuotePage({ params }: CreateQuotePageProps) {
  // Await the params
  const resolvedParams = await params;
  const ticketId = parseInt(resolvedParams.id, 10);

  if (isNaN(ticketId)) {
    notFound();
  }

  // Fetch ticket data
  const ticket = await db.query.tickets.findFirst({
    where: eq(ticketsSchema.id, ticketId),
    columns: {
      id: true,
      senderEmail: true,
      senderName: true,
      senderPhone: true,
      senderCompany: true,
    },
    with: {
      reporter: {
        columns: {
          email: true,
          name: true,
        }
      },
    },
  });
  
  if (!ticket) {
    notFound();
  }

  // Extract reporter - handle potential array type from Drizzle ORM inference
  const reporter = Array.isArray(ticket.reporter) ? ticket.reporter[0] : ticket.reporter;

  // Extract customer info from ticket
  const initialCustomer = {
    email: ticket.senderEmail || reporter?.email || '',
    firstName: ticket.senderName?.split(' ')[0] || reporter?.name?.split(' ')[0] || '',
    lastName: ticket.senderName?.split(' ').slice(1).join(' ') || reporter?.name?.split(' ').slice(1).join(' ') || '',
    phone: ticket.senderPhone || '',
    company: ticket.senderCompany || '',
  };

  return (
    <div className="container-fluid py-4">
      <CreateQuoteClient 
        ticketId={ticketId} 
        initialCustomer={initialCustomer}
      />
    </div>
  );
} 