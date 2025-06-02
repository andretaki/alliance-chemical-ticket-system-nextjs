export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { OrderSearchResult, ShopifyOrderNode } from '@/types/orderSearch';
import { db } from '@/lib/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getOrderTrackingInfo, constructShipStationUrl } from '@/lib/shipstationService';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const queryParam = url.searchParams.get('query');
    const searchType = url.searchParams.get('searchType') || 'auto';

    if (!queryParam || queryParam.trim().length < 3) {
      return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    const query = queryParam.trim();
    console.log(`[OrderSearch] Searching for "${query}" with type "${searchType}"`);

    // Initialize Shopify service
    const shopifyService = new ShopifyService();

    let orders: any[] = [];
    let searchMethod = '';

    // Determine search strategy
    const detectedSearchType = detectSearchType(query);
    const finalSearchType = searchType === 'auto' ? detectedSearchType : searchType;

    console.log(`[OrderSearch] Using search type "${finalSearchType}" for query "${query}"`);

    try {
      if (finalSearchType === 'orderNumber' || 
          (finalSearchType === 'auto' && isOrderNumberLike(query))) {
        // Search by order number
        console.log(`[OrderSearch] Searching Shopify for order number: "${query}"`);
        orders = await shopifyService.searchOrdersByNameOrNumber(query);
        searchMethod = 'order_number';
        console.log(`[OrderSearch] Shopify returned ${orders.length} orders for "${query}"`);
        if (orders.length > 0) {
          console.log(`[OrderSearch] Order names returned:`, orders.map((order: any) => order.name));
        }
      } else if (finalSearchType === 'email' || 
                 (finalSearchType === 'auto' && isEmailLike(query))) {
        // Search by customer email
        orders = await shopifyService.searchOrdersByCustomerEmail(query);
        searchMethod = 'customer_email';
      } else {
        // Search by customer name
        orders = await shopifyService.searchOrdersByCustomerName(query);
        searchMethod = 'customer_name';
      }
    } catch (shopifyError: any) {
      console.error('[OrderSearch] Shopify search error:', shopifyError);
      return NextResponse.json(
        { error: 'Failed to search orders in Shopify: ' + shopifyError.message },
        { status: 500 }
      );
    }

    console.log(`[OrderSearch] Found ${orders.length} orders using method: ${searchMethod}`);

    // Transform Shopify orders to OrderSearchResult format
    const searchResults: OrderSearchResult[] = await Promise.all(
      orders.map(async (order: any) => {
        // Check for related tickets
        let relatedTicketId: number | undefined;
        let relatedTicketUrl: string | undefined;

        try {
          const orderName = order.name?.replace('#', '') || '';
          if (orderName) {
            const relatedTicket = await db.query.tickets.findFirst({
              where: eq(tickets.orderNumber, orderName),
              columns: { id: true }
            });

            if (relatedTicket) {
              relatedTicketId = relatedTicket.id;
              relatedTicketUrl = `/tickets/${relatedTicket.id}`;
            }
          }
        } catch (ticketError) {
          console.warn('[OrderSearch] Error checking for related tickets:', ticketError);
        }

        // Get ShipStation data
        let shipStationOrderId: number | undefined;
        let shipStationUrl: string | undefined;
        let shipStationStatus: string | undefined;
        let trackingNumbers: string[] | undefined;

        try {
          const orderNumberForShipStation = order.name?.replace('#', '') || '';
          if (orderNumberForShipStation) {
            console.log(`[OrderSearch] Looking up ShipStation data for order: ${orderNumberForShipStation}`);
            const shipStationData = await getOrderTrackingInfo(orderNumberForShipStation);
            
            console.log(`[OrderSearch] ShipStation response for ${orderNumberForShipStation}:`, JSON.stringify(shipStationData, null, 2));
            
            if (shipStationData && shipStationData.found) {
              shipStationOrderId = shipStationData.shipStationOrderId;
              shipStationStatus = shipStationData.orderStatus;
              
              console.log(`[OrderSearch] ShipStation found: ID=${shipStationOrderId}, Status=${shipStationStatus}`);
              
              // Extract tracking numbers from shipments
              if (shipStationData.shipments && shipStationData.shipments.length > 0) {
                console.log(`[OrderSearch] Raw shipments data:`, JSON.stringify(shipStationData.shipments, null, 2));
                trackingNumbers = shipStationData.shipments.map(shipment => shipment.trackingNumber);
                console.log(`[OrderSearch] Extracted tracking numbers:`, trackingNumbers);
                console.log(`[OrderSearch] Found ${trackingNumbers.length} tracking numbers:`, trackingNumbers);
                
                // Filter out any null/undefined tracking numbers
                trackingNumbers = trackingNumbers.filter(tn => tn && tn.trim() !== '');
                console.log(`[OrderSearch] Filtered tracking numbers:`, trackingNumbers);
              } else {
                console.log(`[OrderSearch] No shipments found for order ${orderNumberForShipStation}`);
                console.log(`[OrderSearch] shipStationData.shipments:`, shipStationData.shipments);
                
                // If order is marked as shipped but no shipments found, try direct shipment lookup
                if (shipStationStatus === 'shipped') {
                  console.log(`[OrderSearch] Order is marked as shipped but no shipments found. This usually means:`);
                  console.log(`[OrderSearch] - Order was manually marked as shipped without creating shipment`);
                  console.log(`[OrderSearch] - Shipment exists but isn't linked to order`);
                  console.log(`[OrderSearch] - Order was fulfilled outside ShipStation`);
                  console.log(`[OrderSearch] Recommendation: Check ShipStation manually for tracking`);
                }
              }
              
              // Construct ShipStation URL
              if (shipStationOrderId) {
                shipStationUrl = constructShipStationUrl(shipStationOrderId, orderNumberForShipStation) || undefined;
                console.log(`[OrderSearch] ShipStation URL: ${shipStationUrl}`);
              }
              
              console.log(`[OrderSearch] Found ShipStation data for ${orderNumberForShipStation}: ID=${shipStationOrderId}, Status=${shipStationStatus}, URL=${shipStationUrl}`);
            } else {
              console.log(`[OrderSearch] No ShipStation data found for order: ${orderNumberForShipStation}`);
            }
          }
        } catch (shipStationError) {
          console.warn('[OrderSearch] Error checking ShipStation data:', shipStationError);
        }

        // Generate item summary
        const itemSummary = generateItemSummary(order.lineItems);

        // Build customer full name
        const customerFullName = buildCustomerFullName(order.customer);

        const orderResult = {
          shopifyOrderGID: order.id,
          shopifyOrderName: order.name || '',
          legacyResourceId: order.legacyResourceId || '',
          customerFullName,
          customerEmail: order.customer?.email || order.email || undefined,
          createdAt: order.createdAt,
          financialStatus: order.displayFinancialStatus || undefined,
          fulfillmentStatus: order.displayFulfillmentStatus || undefined,
          totalPrice: order.totalPriceSet?.shopMoney?.amount || undefined,
          currencyCode: order.totalPriceSet?.shopMoney?.currencyCode || undefined,
          shopifyAdminUrl: shopifyService.getOrderAdminUrl(order.legacyResourceId || ''),
          relatedTicketId,
          relatedTicketUrl,
          itemSummary,
          // ShipStation fields
          shipStationOrderId,
          shipStationUrl,
          shipStationStatus,
          trackingNumbers
        };

        console.log(`[OrderSearch] Final order result for ${order.name}:`, JSON.stringify(orderResult, null, 2));
        return orderResult;
      })
    );

    return NextResponse.json({
      orders: searchResults,
      searchMethod,
      searchType: finalSearchType,
      query: query
    });
  } catch (error: any) {
    console.error('[OrderSearch] Error searching orders:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search orders' },
      { status: 500 }
    );
  }
}

// Helper function to detect search type
function detectSearchType(query: string): string {
  const cleanQuery = query.trim();
  
  // Order number patterns
  if (/^\d{4,}$/.test(cleanQuery) || // Pure numeric (4+ digits)
      /^#?\d{4,}$/.test(cleanQuery) || // With optional #
      /order\s*#?\s*\d+/i.test(cleanQuery)) { // Contains "order"
    return 'orderNumber';
  }
  
  // Email pattern
  if (/@/.test(cleanQuery) && /\.[a-zA-Z]{2,}/.test(cleanQuery)) {
    return 'email';
  }
  
  // Default to customer name search
  return 'customerName';
}

// Helper function to check if query looks like an order number
function isOrderNumberLike(query: string): boolean {
  const cleanQuery = query.trim().replace(/[#\s]/g, '');
  return /^\d{4,}$/.test(cleanQuery) || /order/i.test(query);
}

// Helper function to check if query looks like an email
function isEmailLike(query: string): boolean {
  return /@/.test(query) && /\.[a-zA-Z]{2,}/.test(query);
}

// Helper function to generate item summary
function generateItemSummary(lineItems: any): string | undefined {
  if (!lineItems?.edges?.length) return undefined;
  
  const items = lineItems.edges.slice(0, 3).map((edge: any) => {
    const item = edge.node;
    const title = item.title || 'Unknown Item';
    const quantity = item.quantity || 1;
    const variant = item.variant?.title ? ` (${item.variant.title})` : '';
    return `${title}${variant} x ${quantity}`;
  });
  
  const remaining = lineItems.edges.length - 3;
  if (remaining > 0) {
    items.push(`+${remaining} more`);
  }
  
  return items.join(', ');
}

// Helper function to build customer full name
function buildCustomerFullName(customer: any): string | undefined {
  if (!customer) return undefined;
  
  if (customer.displayName) {
    return customer.displayName;
  }
  
  const firstName = customer.firstName || '';
  const lastName = customer.lastName || '';
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  return undefined;
} 