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
// Import ShipStation customer service to potentially get customer's orders
import { searchShipStationCustomerByEmail, searchShipStationCustomerByName } from '@/lib/shipstationCustomerService';

// Helper function to map ShipStation order data to OrderSearchResult
function mapShipStationToOrderSearchResult(
  shipStationInfo: NonNullable<Awaited<ReturnType<typeof getOrderTrackingInfo>>>,
  customerEmail?: string,
  customerName?: string
): OrderSearchResult | null {
  if (!shipStationInfo.found || !shipStationInfo.orderNumber) {
    return null;
  }

  // Create a synthetic Shopify GID and Admin URL for ShipStation-only orders
  const syntheticShopifyId = `shipstation-order-${shipStationInfo.orderNumber}`;
  const customerEmailToUse = customerEmail || shipStationInfo.customerEmail;
  const customerFullNameToUse = customerName || shipStationInfo.customerName || customerEmailToUse || undefined;

  return {
    shopifyOrderGID: `gid://shipstation/Order/${syntheticShopifyId}`, // Synthetic GID
    shopifyOrderName: shipStationInfo.orderNumber,
    legacyResourceId: shipStationInfo.shipStationOrderId ? String(shipStationInfo.shipStationOrderId) : syntheticShopifyId, // Use SS ID or synthetic
    customerFullName: customerFullNameToUse,
    customerEmail: customerEmailToUse,
    createdAt: shipStationInfo.orderDate || new Date().toISOString(), // Fallback if no orderDate
    financialStatus: 'N/A', // ShipStation does not provide this directly
    fulfillmentStatus: shipStationInfo.orderStatus, // Use ShipStation status as fulfillment
    totalPrice: shipStationInfo.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toFixed(2) || '0.00',
    currencyCode: 'USD', // Assume USD for ShipStation orders
    shopifyAdminUrl: constructShipStationUrl(shipStationInfo.shipStationOrderId!, shipStationInfo.orderNumber) || '#', // Link to SS if possible
    relatedTicketId: undefined, // Not known for ShipStation-only orders
    relatedTicketUrl: undefined,
    itemSummary: shipStationInfo.items?.map(item => `${item.name} x ${item.quantity}`).join(', ') || undefined,
    shipStationOrderId: shipStationInfo.shipStationOrderId,
    shipStationUrl: constructShipStationUrl(shipStationInfo.shipStationOrderId!, shipStationInfo.orderNumber) || undefined,
    shipStationStatus: shipStationInfo.orderStatus,
    trackingNumbers: shipStationInfo.shipments?.map(s => s.trackingNumber!).filter(tn => tn && tn.trim() !== '') || [],
    source: 'shipstation', // Mark as coming from ShipStation
  };
}

// Helper function to detect search type with improved intelligence
function detectSearchType(query: string): string {
  const cleanQuery = query.trim();
  
  // Order number patterns - enhanced to catch more variations
  if (/^\d{4,}$/.test(cleanQuery) || // Pure numeric (4+ digits)
      /^#?\d{4,}$/.test(cleanQuery) || // With optional #
      /order\s*#?\s*\d+/i.test(cleanQuery) || // Contains "order"
      /inv\s*#?\s*\d+/i.test(cleanQuery) // Contains "inv" (for invoice)
    ) {
    return 'orderNumber';
  }
  
  // Email pattern - more robust
  if (/@/.test(cleanQuery) && /\.[a-zA-Z]{2,}/.test(cleanQuery)) {
    return 'email';
  }
  
  // Default to customer name search
  return 'customerName';
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

// NEW Helper: Search orders only in Shopify and enrich them with ShipStation data
async function searchShopifyOrdersAndEnrich(
  query: string,
  searchType: string,
  shopifyService: ShopifyService
): Promise<OrderSearchResult[]> {
  let shopifyOrders: ShopifyOrderNode[] = [];
  if (searchType === 'orderNumber') {
    shopifyOrders = await shopifyService.searchOrdersByNameOrNumber(query);
  } else if (searchType === 'email') {
    shopifyOrders = await shopifyService.searchOrdersByCustomerEmail(query);
  } else if (searchType === 'customerName') {
    shopifyOrders = await shopifyService.searchOrdersByCustomerName(query);
  }

  // Transform and enrich Shopify orders
  const searchResults: OrderSearchResult[] = await Promise.all(
    shopifyOrders.map(async (order: any) => {
      // Check for related tickets
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

      // Get ShipStation data (enrichment for Shopify orders)
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
              shipStationUrl = constructShipStationUrl(shipStationOrderId, orderNumberForShipStation) || undefined;
            }
          }
        } catch (shipStationError) {
          console.warn('[OrderSearch] Error enriching with ShipStation data:', shipStationError);
        }
      }

      return {
        shopifyOrderGID: order.id,
        shopifyOrderName: order.name || '',
        legacyResourceId: order.legacyResourceId || '',
        customerFullName: buildCustomerFullName(order.customer),
        customerEmail: order.customer?.email || order.email || undefined,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus || undefined,
        fulfillmentStatus: order.displayFulfillmentStatus || undefined,
        totalPrice: order.totalPriceSet?.shopMoney?.amount || undefined,
        currencyCode: order.totalPriceSet?.shopMoney?.currencyCode || undefined,
        shopifyAdminUrl: shopifyService.getOrderAdminUrl(order.legacyResourceId || ''),
        relatedTicketId,
        relatedTicketUrl,
        itemSummary: generateItemSummary(order.lineItems),
        shipStationOrderId,
        shipStationUrl,
        shipStationStatus,
        trackingNumbers,
        source: 'shopify', // Mark as Shopify source
      };
    })
  );
  return searchResults;
}

// NEW Helper: Search orders only in ShipStation and map them for fallback
async function searchShipStationOrdersAndMap(
  query: string,
  searchType: string,
  customerEmail?: string,
  customerName?: string
): Promise<OrderSearchResult[]> {
    let shipStationOrdersInfo: NonNullable<Awaited<ReturnType<typeof getOrderTrackingInfo>>>[] = [];

    if (searchType === 'orderNumber') {
        const orderInfo = await getOrderTrackingInfo(query);
        if (orderInfo && orderInfo.found) {
            shipStationOrdersInfo.push(orderInfo);
        }
    } else if (searchType === 'email' && customerEmail) {
        // Note: ShipStation customer search by email/name limitations
        console.warn("[OrderSearch] ShipStation fallback by customer email not fully implemented for all orders. `getOrderTrackingInfo` only works for specific order numbers. Consider searching Shopify customers first, then their orders.");
    } else if (searchType === 'customerName' && customerName) {
        console.warn("[OrderSearch] ShipStation fallback by customer name not fully implemented for all orders. `getOrderTrackingInfo` only works for specific order numbers. Consider searching Shopify customers first, then their orders.");
    }
    
    return shipStationOrdersInfo
        .map(info => mapShipStationToOrderSearchResult(info, customerEmail, customerName))
        .filter(Boolean) as OrderSearchResult[];
}

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
    // The `searchType` param is for explicit type selection, `detectSearchType` is for auto-detection
    const explicitSearchType = url.searchParams.get('searchType'); 

    if (!queryParam || queryParam.trim().length < 3) {
      return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    const query = queryParam.trim();
    console.log(`[OrderSearch] Incoming query: "${query}" (Explicit Type: ${explicitSearchType || 'Auto'})`);

    const shopifyService = new ShopifyService();
    // Determine the final search type, prioritizing explicit param if provided and valid
    const autoDetectedSearchType = detectSearchType(query);
    const finalSearchType = explicitSearchType && ['orderNumber', 'email', 'customerName'].includes(explicitSearchType)
                            ? explicitSearchType
                            : autoDetectedSearchType;

    let allOrders: OrderSearchResult[] = [];
    let searchMethod = '';
    let customerEmailFromQuery: string | undefined;
    let customerNameFromQuery: string | undefined;

    // Extract customer email/name from query if applicable for ShipStation fallback later
    if (finalSearchType === 'email') customerEmailFromQuery = query;
    if (finalSearchType === 'customerName') customerNameFromQuery = query;

    // === Phase 1: Search Shopify (Primary Source) ===
    console.log(`[OrderSearch] Phase 1: Searching Shopify using type "${finalSearchType}"...`);
    let shopifyResults = await searchShopifyOrdersAndEnrich(query, finalSearchType, shopifyService);
    
    // Deduplicate Shopify results by GID, just in case
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

    // === Phase 2: ShipStation Fallback (Secondary Source) ===
    // Apply fallback only if Shopify returned no results for a direct order number query
    if (allOrders.length === 0 && finalSearchType === 'orderNumber') {
      console.log(`[OrderSearch] Phase 2: Shopify returned no results for order number. Falling back to ShipStation...`);
      const shipStationResults = await searchShipStationOrdersAndMap(query, finalSearchType, customerEmailFromQuery, customerNameFromQuery);
      
      if (shipStationResults.length > 0) {
        // Add ShipStation results to allOrders
        allOrders.push(...shipStationResults);
        searchMethod = 'shipstation_fallback_order_number';
        console.log(`[OrderSearch] Phase 2: Found ${shipStationResults.length} orders in ShipStation via fallback.`);
      } else {
        console.log(`[OrderSearch] Phase 2: No orders found in ShipStation fallback.`);
      }
    }

    // Final consolidation/deduplication if orders from multiple sources
    const finalOrdersMap = new Map<string, OrderSearchResult>();
    allOrders.forEach(order => {
        // Use shopifyOrderGID as unique key (even if synthetic for ShipStation)
        finalOrdersMap.set(order.shopifyOrderGID, order);
    });

    const finalResults = Array.from(finalOrdersMap.values());
    console.log(`[OrderSearch] Final consolidated results: ${finalResults.length} orders.`);

    return NextResponse.json({
      orders: finalResults,
      searchMethod: finalResults.length > 0 ? searchMethod : 'no_results_found',
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