import { NextRequest, NextResponse } from 'next/server';
import { ShopifyService, ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { getOrderTrackingInfo, constructShipStationUrl } from '@/lib/shipstationService';
import { db, tickets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { OrderSearchResult } from '@/types/orderSearch';
import { AdvancedSearchProcessor } from '@/lib/advancedSearch';

const shopifyService = new ShopifyService();

/**
 * Takes a Shopify order and enriches it with data from ShipStation and your internal tickets DB.
 * This is the core of the "Customer 360" view.
 * @param order - A Shopify order node.
 * @returns A fully enriched OrderSearchResult object.
 */
async function enrichShopifyOrder(order: ShopifyOrderNode): Promise<OrderSearchResult> {
    const orderName = order.name?.replace('#', '') || '';
    
    // Fetch related ticket and ShipStation info in parallel for maximum speed
    const [relatedTicket, shipStationInfo] = await Promise.all([
        orderName ? db.query.tickets.findFirst({
            where: eq(tickets.orderNumber, orderName),
            columns: { id: true }
        }) : Promise.resolve(null),
        orderName ? getOrderTrackingInfo(orderName) : Promise.resolve(null)
    ]);

    return {
        source: 'shopify',
        shopifyOrderGID: order.id,
        shopifyOrderName: order.name,
        legacyResourceId: order.legacyResourceId,
        createdAt: order.createdAt,
        customerFullName: `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
        customerEmail: order.customer?.email || undefined,
        fulfillmentStatus: order.displayFulfillmentStatus,
        totalPrice: order.totalPriceSet?.shopMoney?.amount,
        currencyCode: order.totalPriceSet?.shopMoney?.currencyCode,
        shopifyAdminUrl: shopifyService.getOrderAdminUrl(order.legacyResourceId),
        itemSummary: order.lineItems?.edges.map(item => `${item.node.name} x ${item.node.quantity}`).join(', '),
        relatedTicketId: relatedTicket?.id,
        relatedTicketUrl: relatedTicket ? `/tickets/${relatedTicket.id}` : undefined,
        shipStationOrderId: shipStationInfo?.shipStationOrderId,
        shipStationUrl: shipStationInfo?.shipStationOrderId ? constructShipStationUrl(shipStationInfo.shipStationOrderId) : undefined,
        shipStationStatus: shipStationInfo?.orderStatus || undefined,
        trackingNumbers: shipStationInfo?.shipments?.map(s => s.trackingNumber).filter((tn): tn is string => Boolean(tn)),
    };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const queryParam = searchParams.get('query');

  if (!queryParam) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    const query = queryParam.trim();
    console.log(`[UnifiedSearch] New query: "${query}"`);

    const parsedQuery = AdvancedSearchProcessor.parseQuery(query);

    // Build a single, efficient Shopify search query string
    let shopifyQueryParts: string[] = [];
    if (parsedQuery.orderNumbers.length > 0) {
      shopifyQueryParts.push(parsedQuery.orderNumbers.map(on => `name:${on}`).join(' OR '));
    }
    if (parsedQuery.emails.length > 0) {
      shopifyQueryParts.push(parsedQuery.emails.map(e => `email:${e}`).join(' OR '));
    }
    if (parsedQuery.customerNames.length > 0) {
      const nameQuery = parsedQuery.customerNames.join(' ');
      // Use a broad search for names across different fields
      shopifyQueryParts.push(`(first_name:*${nameQuery}* OR last_name:*${nameQuery}* OR name:*${nameQuery}*)`);
    }
    
    let allResults: OrderSearchResult[] = [];

    if (shopifyQueryParts.length > 0) {
        const shopifyQueryString = shopifyQueryParts.join(' OR ');
        const shopifyOrders: ShopifyOrderNode[] = await shopifyService.searchOrders(shopifyQueryString);

        if (shopifyOrders.length > 0) {
            // Enrich all found orders with data from other systems concurrently
            const enrichedResults = await Promise.all(shopifyOrders.map(order => enrichShopifyOrder(order)));
            allResults.push(...enrichedResults);
        }
    }
    
    // Sort final results by date, newest first
    allResults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      results: allResults,
    });

  } catch (error: any) {
    console.error('[UnifiedSearch] Unhandled error in search route:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during the search.', details: error.message }, { status: 500 });
  }
} 