export interface OrderSearchResult {
    source: 'shopify' | 'shipstation';
    shopifyOrderGID: string; // e.g., "gid://shopify/Order/1234567890"
    shopifyOrderName: string; // e.g., "#1001"
    legacyResourceId: string; // Numeric ID for constructing admin URL
    createdAt: string; // ISO Date string
    customerFullName?: string;
    customerEmail?: string;
    fulfillmentStatus?: string; // e.g., "FULFILLED", "UNFULFILLED"
    totalPrice?: string;
    currencyCode?: string;
    shopifyAdminUrl?: string;
    relatedTicketId?: number;
    relatedTicketUrl?: string;
    itemSummary?: string; // e.g., "Product A x 2, Product B x 1"
    // ShipStation fields
    shipStationOrderId?: number; // ShipStation internal order ID
    shipStationUrl?: string; // Direct link to ShipStation order page
    shipStationStatus?: string; // e.g., "shipped", "awaiting_shipment"
    trackingNumbers?: string[]; // Array of tracking numbers if available
}

export interface ShopifyOrderNode {
    id: string;
    name: string;
    legacyResourceId: string;
    createdAt: string;
    displayFulfillmentStatus: string;
    customer?: {
        firstName?: string;
        lastName?: string;
        email?: string;
    } | null;
    totalPriceSet?: {
        shopMoney: {
            amount: string;
            currencyCode: string;
        };
    };
    lineItems: {
        edges: {
            node: {
                name: string;
                quantity: number;
            };
        }[];
    };
}

export interface OrderSearchResponse {
    orders: OrderSearchResult[];
    searchMethod: string;
    searchType: string;
    query: string;
} 