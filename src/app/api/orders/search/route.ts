import { NextRequest, NextResponse } from 'next/server';
import { ShopifyService, ShopifyOrderNode } from '@/services/shopify/ShopifyService';
import { getOrderTrackingInfo, constructShipStationUrl } from '@/lib/shipstationService';
import { db, tickets } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';
import { OrderSearchResult } from '@/types/orderSearch';
import { AdvancedSearchProcessor } from '@/lib/advancedSearch';
import { CacheService } from '@/lib/cache';

let _shopifyService: ShopifyService | null = null;
function getShopifyService() {
  if (!_shopifyService) _shopifyService = new ShopifyService();
  return _shopifyService;
}

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
        shopifyAdminUrl: getShopifyService().getOrderAdminUrl(order.legacyResourceId),
        itemSummary: order.lineItems?.edges.map(item => `${item.node.name} x ${item.node.quantity}`).join(', '),
        relatedTicketId: relatedTicket?.id,
        relatedTicketUrl: relatedTicket ? `/tickets/${relatedTicket.id}` : undefined,
        shipStationOrderId: shipStationInfo?.shipStationOrderId,
        shipStationUrl: (shipStationInfo?.shipStationOrderId && typeof shipStationInfo.shipStationOrderId === 'number') ? constructShipStationUrl(shipStationInfo.shipStationOrderId) || undefined : undefined,
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

  const query = queryParam.trim();
  
  // Check cache first
  const cachedResults = await CacheService.get<OrderSearchResult[]>(query);
  if (cachedResults) {
    return NextResponse.json({ results: cachedResults, source: 'cache' });
  }

  try {
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
    if (parsedQuery.skus && parsedQuery.skus.length > 0) {
      shopifyQueryParts.push(parsedQuery.skus.map(sku => `sku:${sku}`).join(' OR '));
    }
    if (parsedQuery.customerNames.length > 0) {
      const nameQuery = parsedQuery.customerNames.join(' ');
      // Use a broad search for names across different fields
      shopifyQueryParts.push(`(first_name:*${nameQuery}* OR last_name:*${nameQuery}* OR name:*${nameQuery}*)`);
    }
    
    let allResults: OrderSearchResult[] = [];

    if (shopifyQueryParts.length > 0) {
        const shopifyQueryString = shopifyQueryParts.join(' OR ');
        console.log(`[UnifiedSearch] Executing Shopify Query: "${shopifyQueryString}"`);
        const shopifyOrders: ShopifyOrderNode[] = await getShopifyService().searchOrders(shopifyQueryString);

        if (shopifyOrders.length > 0) {
            const orderNames = shopifyOrders.map(o => o.name.replace('#', '')).filter(Boolean);

            // Batch fetch related data
            const [ticketsData, shipStationDataResults] = await Promise.all([
                db.query.tickets.findMany({
                    where: inArray(tickets.orderNumber, orderNames),
                    columns: { id: true, orderNumber: true }
                }),
                Promise.all(orderNames.map(async (name) => ({
                    orderName: name,
                    trackingInfo: await getOrderTrackingInfo(name)
                })))
            ]);

            // Create maps for quick lookups
            const ticketsMap = new Map(ticketsData.map(t => [t.orderNumber, t]));
            const shipStationMap = new Map(
                shipStationDataResults
                    .filter(result => result.trackingInfo)
                    .map(result => [result.orderName, result.trackingInfo!])
            );

            // Enrich orders using the pre-fetched data
            const enrichedResults = shopifyOrders.map((order): OrderSearchResult => {
                const orderName = order.name.replace('#', '');
                const relatedTicket = ticketsMap.get(orderName);
                const shipStationInfo = shipStationMap.get(orderName);

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
                    shopifyAdminUrl: getShopifyService().getOrderAdminUrl(order.legacyResourceId),
                    itemSummary: order.lineItems?.edges.map(item => `${item.node.name} x ${item.node.quantity}`).join(', '),
                    relatedTicketId: relatedTicket?.id,
                    relatedTicketUrl: relatedTicket ? `/tickets/${relatedTicket.id}` : undefined,
                    shipStationOrderId: shipStationInfo?.shipStationOrderId,
                    shipStationUrl: (shipStationInfo?.shipStationOrderId && typeof shipStationInfo.shipStationOrderId === 'number') ? constructShipStationUrl(shipStationInfo.shipStationOrderId) || undefined : undefined,
                    shipStationStatus: shipStationInfo?.orderStatus || undefined,
                    trackingNumbers: shipStationInfo?.shipments?.map(s => s.trackingNumber).filter((tn): tn is string => Boolean(tn)),
                };
            });
            allResults.push(...enrichedResults);
        }
    }
    
    // Sort final results by date, newest first
    allResults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Store in cache for next time
    await CacheService.set(query, allResults);

    return NextResponse.json({
      results: allResults,
    });

  } catch (error: any) {
    console.error('[UnifiedSearch] Unhandled error in search route:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during the search.', details: error.message }, { status: 500 });
  }
} 