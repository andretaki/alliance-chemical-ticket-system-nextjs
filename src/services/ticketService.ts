import { db } from '@/lib/db';
import { tickets as ticketsSchema } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getTicketById(id: number) {
  try {
    const ticket = await db.query.tickets.findFirst({
      where: eq(ticketsSchema.id, id),
      with: {
        reporter: true,
      },
    });

    if (!ticket) {
      return null;
    }

    // Extract customer information from the ticket
    return {
      ...ticket,
      customerEmail: ticket.senderEmail || ticket.reporter?.email || '',
      customerFirstName: ticket.senderName?.split(' ')[0] || ticket.reporter?.name?.split(' ')[0] || '',
      customerLastName: ticket.senderName?.split(' ').slice(1).join(' ') || ticket.reporter?.name?.split(' ').slice(1).join(' ') || '',
      customerPhone: ticket.senderPhone || '',
      customerCompany: ticket.sendercompany || '',
    };
  } catch (error) {
    console.error('Error fetching ticket:', error);
    throw error;
  }
} 