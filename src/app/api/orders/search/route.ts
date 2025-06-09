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
import Fuse from 'fuse.js';

// Enhanced search interface with advanced features
interface AdvancedSearchQuery {
  originalQuery: string;
  terms: string[];
  orderNumbers: string[];
  emails: string[];
  customerNames: string[];
  searchType: 'simple' | 'advanced' | 'batch' | 'fuzzy';
  confidence: number;
}

// Enhanced query parser with fuzzy matching and multi-term support
function parseAdvancedQuery(query: string): AdvancedSearchQuery {
  const originalQuery = query.trim();
  const terms = originalQuery.split(/\s+/).filter(term => term.length > 0);
  
  const orderNumbers: string[] = [];
  const emails: string[] = [];
  const customerNames: string[] = [];
  let confidence = 0;
  
  // Enhanced order number patterns
  const ORDER_PATTERNS = [
    /^\s*#?(\d{4,})\s*$/i,           // #1234 or 1234
    /order\s*#?\s*(\d+)/i,          // order #1234
    /inv(?:oice)?\s*#?\s*(\d+)/i,   // invoice #1234
    /po\s*#?\s*(\d+)/i,             // PO #1234
    /ref(?:erence)?\s*#?\s*(\d+)/i, // reference #1234
    /ticket\s*#?\s*(\d+)/i,         // ticket #1234
    /[\s,;]+(\d{4,})[\s,;]+/g,      // Multiple numbers separated by spaces/commas
  ];
  
  let remainingQuery = originalQuery;
  
  // Extract order numbers with fuzzy variants
  for (const pattern of ORDER_PATTERNS) {
    const matches = remainingQuery.match(pattern);
    if (matches) {
      const orderNum = matches[1];
      orderNumbers.push(orderNum);
      // Add fuzzy variants
      orderNumbers.push(`#${orderNum}`);
      orderNumbers.push(orderNum.padStart(4, '0'));
      orderNumbers.push(orderNum.padStart(5, '0'));
      confidence += 0.8;
      remainingQuery = remainingQuery.replace(pattern, '').trim();
    }
  }
  
  // Enhanced email detection
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emailMatches = [...remainingQuery.matchAll(emailPattern)];
  emailMatches.forEach(match => {
    emails.push(match[0]);
    confidence += 0.9;
    remainingQuery = remainingQuery.replace(match[0], '').trim();
  });
  
  // Multiple order numbers batch detection
  const multipleOrdersPattern = /(?:\d{4,}[\s,;]*){2,}/;
  if (multipleOrdersPattern.test(originalQuery)) {
    const batchNumbers = originalQuery.match(/\d{4,}/g) || [];
    orderNumbers.push(...batchNumbers);
    confidence += 0.7;
  }
  
  // Clean up customer names with fuzzy variants
  if (remainingQuery) {
    customerNames.push(remainingQuery);
    // Add fuzzy variants for common business terms
    const fuzzyVariants = generateFuzzyVariants(remainingQuery);
    customerNames.push(...fuzzyVariants);
    confidence += 0.6;
  }
  
  // Determine search type
  let searchType: 'simple' | 'advanced' | 'batch' | 'fuzzy' = 'simple';
  if (orderNumbers.length > 3) {
    searchType = 'batch';
  } else if (terms.length > 1 || (orderNumbers.length + emails.length + customerNames.length > 1)) {
    searchType = 'advanced';
  } else if (confidence < 0.7 && customerNames.length > 0) {
    searchType = 'fuzzy';
  }
  
  return {
    originalQuery,
    terms,
    orderNumbers: [...new Set(orderNumbers)], // Remove duplicates
    emails: [...new Set(emails)],
    customerNames: [...new Set(customerNames)],
    searchType,
    confidence: Math.min(confidence, 1)
  };
}

// Generate fuzzy variants for customer names
function generateFuzzyVariants(term: string): string[] {
  const variants = [];
  const lower = term.toLowerCase();
  
  // Common business term replacements
  const replacements = [
    ['&', 'and'], ['and', '&'],
    ['co', 'company'], ['company', 'co'],
    ['corp', 'corporation'], ['corporation', 'corp'],
    ['inc', 'incorporated'], ['incorporated', 'inc'],
    ['llc', 'limited liability company'],
    ['ltd', 'limited'], ['limited', 'ltd'],
    [' ', ''], ['', ' '], // With/without spaces
  ];
  
  for (const [from, to] of replacements) {
    if (lower.includes(from)) {
      variants.push(lower.replace(new RegExp(from, 'gi'), to));
    }
  }
  
  // Handle partial matches and typos
  if (term.length >= 4) {
    // Add partial matches
    variants.push(term.substring(0, Math.floor(term.length * 0.8)));
    variants.push(term.substring(Math.floor(term.length * 0.2)));
  }
  
  return [...new Set(variants)].filter(v => v.length >= 2);
}

// Fuzzy search with Fuse.js
function performFuzzySearch<T extends { customerFullName?: string; customerEmail?: string }>(
  data: T[],
  query: string,
  threshold: number = 0.4
): T[] {
  if (!query || data.length === 0) return [];
  
  const fuse = new Fuse(data, {
    keys: ['customerFullName', 'customerEmail'],
    threshold,
    distance: 100,
    minMatchCharLength: 2,
    shouldSort: true,
    includeScore: true,
    includeMatches: true,
    findAllMatches: true,
  });
  
  const results = fuse.search(query);
  return results.map(result => result.item);
}

// Helper function to map ShipStation order data to OrderSearchResult
function mapShipStationToOrderSearchResult(
  shipStationInfo: NonNullable<Awaited<ReturnType<typeof getOrderTrackingInfo>>>,
  customerEmail?: string,
  customerName?: string
): OrderSearchResult | null {
  if (!shipStationInfo.found || !shipStationInfo.shipStationOrderId) {
    return null;
  }

  // Use the order number passed as parameter since it's not in shipStationInfo
  const orderNumber = shipStationInfo.shipStationOrderId?.toString() || 'unknown';
  const syntheticShopifyId = `shipstation-order-${orderNumber}`;
  const customerEmailToUse = customerEmail;
  const customerFullNameToUse = customerName || customerEmailToUse || undefined;

  return {
    shopifyOrderGID: `gid://shipstation/Order/${syntheticShopifyId}`, // Synthetic GID
    shopifyOrderName: orderNumber,
    legacyResourceId: shipStationInfo.shipStationOrderId ? String(shipStationInfo.shipStationOrderId) : syntheticShopifyId, // Use SS ID or synthetic
    customerFullName: customerFullNameToUse,
    customerEmail: customerEmailToUse,
    createdAt: shipStationInfo.orderDate || new Date().toISOString(), // Fallback if no orderDate
    financialStatus: 'N/A', // ShipStation does not provide this directly
    fulfillmentStatus: shipStationInfo.orderStatus, // Use ShipStation status as fulfillment
    totalPrice: shipStationInfo.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toFixed(2) || '0.00',
    currencyCode: 'USD', // Assume USD for ShipStation orders
    shopifyAdminUrl: '#', // ShipStation-only orders don't have Shopify admin URLs
    relatedTicketId: undefined, // Not known for ShipStation-only orders
    relatedTicketUrl: undefined,
    itemSummary: shipStationInfo.items?.map(item => `${item.name} x ${item.quantity}`).join(', ') || undefined,
    shipStationOrderId: shipStationInfo.shipStationOrderId,
    shipStationUrl: shipStationInfo.shipStationOrderId ? constructShipStationUrl(shipStationInfo.shipStationOrderId, orderNumber) || undefined : undefined,
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
        legacyResourceId: String(order.legacyResourceId || ''),
        customerFullName: buildCustomerFullName(order.customer),
        customerEmail: order.customer?.email || order.email || undefined,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus || undefined,
        fulfillmentStatus: order.displayFulfillmentStatus || undefined,
        totalPrice: order.totalPriceSet?.shopMoney?.amount || undefined,
        currencyCode: order.totalPriceSet?.shopMoney?.currencyCode || undefined,
        shopifyAdminUrl: shopifyService.getOrderAdminUrl(String(order.legacyResourceId || '')),
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