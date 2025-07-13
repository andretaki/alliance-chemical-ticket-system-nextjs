import { NextRequest, NextResponse } from 'next/server';
import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getOrderTrackingInfo } from '@/lib/shipstationService';
import { AIOrderStatusService } from '@/services/aiOrderStatusService';
import { extractOrderIds } from '@/lib/orderResponseService';
import { getServerSession } from '@/lib/auth-helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let ticketIdString: string | undefined; // For logging raw ID from path
    let ticketId: number = NaN; // Initialize numeric ticketId to prevent 'used before assigned'

    try {
        // Authenticate the user (agent)
        const { session, error } = await getServerSession();
            if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;
        ticketIdString = id; // Assign raw string ID for logging
        ticketId = parseInt(id, 10);
        if (isNaN(ticketId)) {
            return new NextResponse('Invalid ticket ID', { status: 400 });
        }

        // Fetch ticket details from database
        const ticket = await db.query.tickets.findFirst({
            where: eq(tickets.id, ticketId),
            columns: {
                orderNumber: true,
                senderName: true,
                senderEmail: true,
                description: true,
                title: true,
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        let orderNumber = ticket.orderNumber;

        // If no direct order number, try to extract from ticket content
        if (!orderNumber) {
            const combinedText = `${ticket.title || ''} ${ticket.description || ''}`;
            const extractedOrderIds = extractOrderIds(combinedText);
            
            if (extractedOrderIds.length === 0) {
                return NextResponse.json({ 
                    error: 'No order number found for this ticket',
                    draftMessage: 'I notice you\'re asking about an order, but I don\'t see an order number in your message. Could you please provide your order number so I can look up the current status for you?'
                }, { status: 400 });
            }
            
            // Use the first extracted order ID
            orderNumber = extractedOrderIds[0];
            console.log(`[OrderStatusAPI] Order number extracted from ticket content: ${orderNumber}`);
        }
        
        console.log(`[OrderStatusAPI] Fetching order status for ticket ${ticketId}, order #${orderNumber}`);
        
        // Get order information from ShipStation
        const orderInfo = await getOrderTrackingInfo(orderNumber);

        // Initialize AI service
        const aiOrderStatusService = new AIOrderStatusService();
        
        // Prepare customer context
        const customerName = ticket.senderName || 
                           ticket.senderEmail?.split('@')[0] || 
                           'Customer';
        
        const customerQueryContext = [
            ticket.title ? `Subject: ${ticket.title}` : '',
            ticket.description ? `Message: ${ticket.description}` : ''
        ].filter(Boolean).join('\n');

        // Handle case where ShipStation service returned null (critical failure)
        if (!orderInfo) {
            console.error(`[OrderStatusAPI] ShipStation service returned null for order ${orderNumber}`);
            const draftNotFound = await aiOrderStatusService.generateOrderStatusDraft(
                { 
                    found: false, 
                    errorMessage: `We encountered a technical issue looking up order #${orderNumber}. Our team will investigate and get back to you shortly.` 
                },
                customerName,
                customerQueryContext
            );
            return NextResponse.json(draftNotFound);
        }
        
        // Generate AI draft using the order information
        const draftData = await aiOrderStatusService.generateOrderStatusDraft(
            orderInfo,
            customerName,
            customerQueryContext
        );

        // Add order number to response for frontend reference
        const response = {
            ...draftData,
            orderNumber: orderNumber,
            orderFound: orderInfo.found
        };

        console.log(`[OrderStatusAPI] Successfully generated draft for order ${orderNumber}, confidence: ${draftData.confidence}`);
        return NextResponse.json(response);

    } catch (error) {
        console.error(`[OrderStatusAPI] Error in /api/tickets/${ticketIdString || 'unknown'}/draft-order-status:`, error);
        
        let errorMessage = 'Failed to generate order status draft.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        
        // Return error response with fallback draft message
        return NextResponse.json({ 
            error: errorMessage,
            draftMessage: `I apologize, but I'm experiencing a technical issue while looking up your order information. Let me investigate this for you personally and get back to you with an update shortly. Thank you for your patience.`,
            confidence: 'low' as const
        }, { status: 500 });
    }
} 