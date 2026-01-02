import type { NextRequest } from 'next/server';
import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getOrderTrackingInfo } from '@/lib/shipstationService';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return apiError('invalid_id', 'Invalid ticket ID', null, { status: 400 });
    }

    // Get the ticket to extract order number
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true,
        orderNumber: true,
        title: true
      },
    });

    if (!ticket) {
      return apiError('not_found', 'Ticket not found', null, { status: 404 });
    }

    // If no order number, return empty result
    if (!ticket.orderNumber) {
      return apiSuccess({
        hasOrderNumber: false,
        orderNumber: null,
        shipstationData: null,
        message: 'No order number found for this ticket'
      });
    }

    console.log(`🔄 [ShipStation Live API] Fetching live data for order ${ticket.orderNumber} on ticket #${ticketId}`);

    // Fetch live ShipStation data
    const shipstationData = await getOrderTrackingInfo(ticket.orderNumber);

    return apiSuccess({
      hasOrderNumber: true,
      orderNumber: ticket.orderNumber,
      shipstationData,
      fetchedAt: new Date().toISOString(),
      message: shipstationData ? 'Live ShipStation data retrieved' : 'No ShipStation data found'
    });

  } catch (error) {
    console.error('Error fetching live ShipStation data:', error);
    return apiError('internal_error', 'Failed to fetch live ShipStation data', null, { status: 500 });
  }
} 