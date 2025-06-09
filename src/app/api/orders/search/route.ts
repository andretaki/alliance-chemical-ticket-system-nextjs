import { NextRequest, NextResponse } from 'next/server';
import { ShopifyService, ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { getOrderTrackingInfo, searchShipStationOrdersAndMap, constructShipStationUrl } from '@/lib/shipstationService';
import { db } from '@/lib/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { OrderSearchResult } from '@/types/orderSearch';
import { AdvancedSearchProcessor } from '@/lib/advancedSearch'; // Import the new advanced processor

// Helper function to map ShipStation order data to OrderSearchResult
function mapShipStationToOrderSearchResult(
  shipStationOrder: any,
  customerEmail: string | undefined,
  customerName: string | undefined
): OrderSearchResult {
  const orderName = shipStationOrder.orderNumber;
  return {
    source: 'shipstation',
    shopifyOrderGID: `shipstation-${shipStationOrder.orderId}`, // Create a stable, unique ID
    shopifyOrderName: orderName,
    legacyResourceId: shipStationOrder.orderId.toString(),
    createdAt: shipStationOrder.orderDate,
    customerFullName: customerName || `${shipStationOrder.shipTo?.name || ''}`,
    customerEmail: customerEmail || shipStationOrder.customerEmail,
    fulfillmentStatus: shipStationOrder.orderStatus,
    totalPrice: shipStationOrder.orderTotal?.toString(),
    currencyCode: shipStationOrder.customer?.address?.country || 'USD',
    shopifyAdminUrl: '', // Not available for ShipStation-only orders
    itemSummary: shipStationOrder.items?.map((item: any) => `${item.quantity}x ${item.name}`).join(', ') || 'N/A',
    shipStationOrderId: shipStationOrder.orderId,
    shipStationUrl: constructShipStationUrl(shipStationOrder.orderId) || '',
    shipStationStatus: shipStationOrder.orderStatus,
    trackingNumbers: shipStationOrder.shipments?.map((s: any) => s.trackingNumber).filter(Boolean) || [],
  };
}

function generateItemSummary(lineItems: { node: { quantity: number; name: string } }[]): string {
  if (!lineItems || !lineItems.length) {
    return 'No items found';
  }
  const summary = lineItems.map(item => `${item.node.quantity}x ${item.node.name}`).join(', ');
  return summary.length > 100 ? summary.substring(0, 97) + '...' : summary;
}

async function searchAndEnrich(
  parsedQuery: ReturnType<typeof AdvancedSearchProcessor.parseQuery>,
  shopifyService: ShopifyService,
): Promise<OrderSearchResult[]> {
  let shopifyOrders: ShopifyOrderNode[] = [];

  // Build a single, efficient Shopify query
  let shopifyQueryString = '';
  if (parsedQuery.orderNumbers.length > 0) {
    shopifyQueryString += parsedQuery.orderNumbers.map(on => `(name:${on} OR name:#${on})`).join(' OR ');
  }
  if (parsedQuery.emails.length > 0) {
    if (shopifyQueryString) shopifyQueryString += ' OR ';
    shopifyQueryString += parsedQuery.emails.map(e => `email:${e}`).join(' OR ');
  }
  if (parsedQuery.customerNames.length > 0) {
    if (shopifyQueryString) shopifyQueryString += ' OR ';
    shopifyQueryString += `(first_name:*${parsedQuery.customerNames.join(' ')}* OR last_name:*${parsedQuery.customerNames.join(' ')}*)`;
  }

  if (shopifyQueryString) {
    try {
      shopifyOrders = await shopifyService.searchOrders(shopifyQueryString);
    } catch (error) {
      console.error(`[OrderSearch] Error during Shopify search with query "${shopifyQueryString}":`, error);
      // Return empty array to allow fallback logic to proceed if desired
      return [];
    }
  }

  // Transform and enrich Shopify orders
  const searchResults: OrderSearchResult[] = await Promise.all(
    shopifyOrders.map(async (order: any) => {
      let relatedTicketId: number | undefined;
      let relatedTicketUrl: string | undefined;
      const orderName = order.name?.replace('#', '') || '';
      if (orderName) {
        try {
          const relatedTicket = await db.query.tickets.findFirst({
            where: eq(tickets.orderNumber, orderName),
            columns: { id: true }
          });
          if (relatedTicket) {
            relatedTicketId = relatedTicket.id;
            relatedTicketUrl = `/tickets/${relatedTicket.id}`;
          }
        } catch (ticketError) {
          console.warn('[OrderSearch] Error checking for related tickets:', ticketError);
        }
      }

      let shipStationOrderId: number | undefined;
      let shipStationUrl: string | undefined;
      let shipStationStatus: string | undefined;
      let trackingNumbers: string[] | undefined;
      const orderNumberForShipStation = order.name?.replace('#', '') || '';

      if (orderNumberForShipStation) {
        try {
          const shipStationData = await getOrderTrackingInfo(orderNumberForShipStation);
          if (shipStationData && shipStationData.found) {
            shipStationOrderId = shipStationData.shipStationOrderId;
            shipStationStatus = shipStationData.orderStatus;
            trackingNumbers = shipStationData.shipments?.map(s => s.trackingNumber!).filter(tn => tn && tn.trim() !== '') || [];
            if (shipStationOrderId) {
              shipStationUrl = constructShipStationUrl(shipStationOrderId) || undefined;
            }
          }
        } catch (shipStationError) {
          console.warn(`[OrderSearch] Error enriching Shopify order #${order.name} with ShipStation data:`, shipStationError);
        }
      }

      return {
        source: 'shopify',
        shopifyOrderGID: order.id,
        shopifyOrderName: order.name,
        legacyResourceId: order.legacyResourceId,
        createdAt: order.createdAt,
        customerFullName: `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
        customerEmail: order.customer?.email,
        fulfillmentStatus: order.displayFulfillmentStatus || undefined,
        totalPrice: order.totalPriceSet?.shopMoney?.amount || undefined,
        currencyCode: order.totalPriceSet?.shopMoney?.currencyCode || undefined,
        shopifyAdminUrl: shopifyService.getOrderAdminUrl(order.legacyResourceId),
        relatedTicketId,
        relatedTicketUrl,
        itemSummary: generateItemSummary(order.lineItems),
        shipStationOrderId,
        shipStationUrl,
        shipStationStatus,
        trackingNumbers,
      };
    })
  );

  return searchResults;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const queryParam = searchParams.get('query');

  if (!queryParam) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    const query = queryParam.trim();
    console.log(`[OrderSearch] Incoming query: "${query}"`);

    const parsedQuery = AdvancedSearchProcessor.parseQuery(query);
    const shopifyService = new ShopifyService();

    let allOrders: OrderSearchResult[] = [];
    let searchMethod = '';

    console.log('[OrderSearch] Phase 1: Searching Shopify with unified query...');
    let shopifyResults = await searchAndEnrich(parsedQuery, shopifyService);

    const uniqueShopifyResults = new Map<string, OrderSearchResult>();
    shopifyResults.forEach(order => uniqueShopifyResults.set(order.shopifyOrderGID, order));
    allOrders = Array.from(uniqueShopifyResults.values());

    if (allOrders.length > 0) {
      searchMethod = 'shopify';
      console.log(`[OrderSearch] Phase 1: Found ${allOrders.length} orders in Shopify.`);
    } else {
      searchMethod = 'shopify_not_found';
      console.log(`[OrderSearch] Phase 1: No orders found in Shopify.`);
    }

    if (allOrders.length === 0 && parsedQuery.orderNumbers.length === 1 && parsedQuery.emails.length === 0 && parsedQuery.customerNames.length === 0) {
      console.log(`[OrderSearch] Phase 2: Shopify returned no results for order number. Falling back to ShipStation...`);
      const shipStationResults = await searchShipStationOrdersAndMap(
        parsedQuery.orderNumbers[0],
        'orderNumber',
        parsedQuery.emails[0], // This will be undefined, which is fine
        parsedQuery.customerNames.join(' ') // This will be empty, which is fine
      );

      if (shipStationResults.length > 0) {
        allOrders.push(...shipStationResults);
        searchMethod = 'shipstation_fallback';
        console.log(`[OrderSearch] Phase 2: Found ${shipStationResults.length} orders in ShipStation.`);
      } else {
        console.log(`[OrderSearch] Phase 2: No orders found in ShipStation for fallback search.`);
      }
    }

    allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      searchMethod,
      results: allOrders
    });

  } catch (error: any) {
    console.error('[OrderSearch] Unhandled error in search route:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during the search.', details: error.message },
      { status: 500 }
    );
  }
} 