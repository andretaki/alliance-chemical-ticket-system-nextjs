export interface OrderSearchResult {
    shopifyOrderGID: string; // e.g., "gid://shopify/Order/1234567890"
    shopifyOrderName: string; // e.g., "#1001"
    legacyResourceId: string; // Numeric ID for constructing admin URL
    customerFullName?: string;
    customerEmail?: string;
    createdAt: string; // ISO Date string
    financialStatus?: string; // e.g., "PAID", "PENDING"
    fulfillmentStatus?: string; // e.g., "FULFILLED", "UNFULFILLED"
    totalPrice?: string;
    currencyCode?: string;
    shopifyAdminUrl: string;
    relatedTicketId?: number;
    relatedTicketUrl?: string;
    itemSummary?: string; // e.g., "Product A x 2, Product B x 1"
    // ShipStation fields
    shipStationOrderId?: number; // ShipStation internal order ID
    shipStationUrl?: string; // Direct link to ShipStation order page
    shipStationStatus?: string; // e.g., "shipped", "awaiting_shipment"
    trackingNumbers?: string[]; // Array of tracking numbers if available
    source?: 'shopify' | 'shipstation'; // Data source for this order
}

export interface ShopifyOrderNode {
    id: string; // GID format
    legacyResourceId: string;
    name: string; // Order name like "#1001"
    email?: string;
    phone?: string;
    createdAt: string;
    updatedAt: string;
    displayFinancialStatus?: string;
    displayFulfillmentStatus?: string;
    totalPriceSet?: {
        shopMoney: {
            amount: string;
            currencyCode: string;
        };
    };
    customer?: {
        id: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        displayName?: string;
    };
    lineItems?: {
        edges: Array<{
            node: {
                id: string;
                title: string;
                quantity: number;
                variant?: {
                    title: string;
                };
            };
        }>;
    };
}

export interface OrderSearchResponse {
    orders: OrderSearchResult[];
    searchMethod: string;
    searchType: string;
    query: string;
} 