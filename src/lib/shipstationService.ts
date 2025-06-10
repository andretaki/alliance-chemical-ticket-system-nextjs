import axios, { AxiosError } from 'axios';
import * as alertService from '@/lib/alertService'; // For alerting on API failures
import { OrderSearchResult } from '@/types/orderSearch';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;
const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

// --- Types ---
interface ShipStationShipment {
    shipmentId: number;
    trackingNumber: string | null;
    shipDate: string;
    carrierCode: string | null;
    serviceCode?: string;
    voided: boolean;
    orderId?: number;
    orderNumber?: string;
    estimatedDeliveryDate?: string;
}

interface ShipStationOrder {
    orderId: number;
    orderNumber: string;
    orderStatus: 'awaiting_payment' | 'awaiting_shipment' | 'shipped' | 'on_hold' | 'cancelled';
    customerEmail: string | null;
    orderDate: string;
    items?: { sku: string; name: string; quantity: number; unitPrice: number }[];
    shipments: ShipStationShipment[] | null;
}

interface ShipStationOrderResponse {
    orders: ShipStationOrder[];
    total: number;
    page: number;
    pages: number;
}

interface ShipStationShipmentsResponse {
    shipments: ShipStationShipment[];
    total: number;
    page: number;
    pages: number;
}

export interface ShipmentInfo {
    trackingNumber: string;
    carrier: string;
    shipDate: string;
    serviceLevel?: string;
    estimatedDelivery?: string;
}

export interface OrderTrackingInfo {
    found: boolean;
    orderStatus?: ShipStationOrder['orderStatus'];
    orderDate?: string;
    shipments?: ShipmentInfo[];
    items?: { sku: string; name: string; quantity: number; unitPrice: number }[];
    errorMessage?: string;
    shipStationOrderId?: number;
}

// --- API Request Wrapper with Rate Limiting and Retries ---
async function shipstationRequest<T>(endpoint: string, params: Record<string, any>): Promise<T> {
    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
        throw new Error("ShipStation API credentials are not configured.");
    }
    const authHeader = `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`;
    const url = `${SHIPSTATION_BASE_URL}${endpoint}`;

    // Simple in-memory rate limiting (can be improved with a dedicated library if needed)
    await new Promise(resolve => setTimeout(resolve, 1500)); // Static 1.5-second delay between requests

    try {
        console.log(`[ShipStationService] Calling endpoint: ${endpoint} with params:`, params);
        const response = await axios.get<T>(url, {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
            params,
            timeout: 20000 // 20-second timeout
        });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            console.warn(`[ShipStationService] Rate limit hit for ${endpoint}. Waiting and retrying...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on 429
            // A real implementation would have more robust retry logic
        }
        console.error(`[ShipStationService] Error calling ${endpoint}:`, error);
        throw error; // Re-throw to be handled by the caller
    }
}

// --- Main Service Function ---
export async function getOrderTrackingInfo(orderNumber: string): Promise<OrderTrackingInfo | null> {
    try {
        const orderResponse = await shipstationRequest<ShipStationOrderResponse>('/orders', {
            orderNumber: orderNumber,
            pageSize: 1 // We only need the one exact order
        });

        if (!orderResponse || orderResponse.orders.length === 0) {
            console.log(`[ShipStationService] Order #${orderNumber} not found.`);
            return { found: false, errorMessage: `Order #${orderNumber} not found in ShipStation.` };
        }

        const order = orderResponse.orders[0];

        // If the order has shipped but shipment details are missing, fetch them separately
        let shipments = order.shipments || [];
        if (order.orderStatus === 'shipped' && shipments.length === 0) {
            console.log(`[ShipStationService] Order #${orderNumber} is shipped, fetching detailed shipment data...`);
            const shipmentsResponse = await shipstationRequest<ShipStationShipmentsResponse>('/shipments', {
                orderNumber: order.orderNumber,
                pageSize: 10, // Get all shipments for this order
                sortBy: 'ShipDate',
                sortDir: 'DESC'
            });
            shipments = shipmentsResponse.shipments || [];
        }

        return {
            found: true,
            orderStatus: order.orderStatus,
            orderDate: order.orderDate,
            shipments: shipments
                .filter(s => !s.voided && s.trackingNumber)
                .map(s => ({
                    trackingNumber: s.trackingNumber!,
                    carrier: s.carrierCode!,
                    shipDate: s.shipDate,
                    serviceLevel: s.serviceCode,
                    estimatedDelivery: s.estimatedDeliveryDate,
                })),
            items: order.items,
            shipStationOrderId: order.orderId,
        };
    } catch (error: any) {
        console.error(`[ShipStationService] CRITICAL FAILURE for order #${orderNumber}:`, error.message);
        // The alerting is now moved to the calling function, but we can log here
        // await alertService.trackErrorAndAlert('ShipStationService-API', `API lookup failed for order ${orderNumber}`, { error: error.message });
        return { found: false, errorMessage: `System error looking up order #${orderNumber}.` };
    }
}

// --- Helper Functions (can be moved to a separate file if desired) ---
export function constructShipStationUrl(shipStationOrderId: number): string | null {
    if (!shipStationOrderId) return null;
    return `https://ship.shipstation.com/orders/details/${shipStationOrderId}`;
}

function mapShipStationToOrderSearchResult(
  info: OrderTrackingInfo,
  orderNumber: string,
  customerEmail?: string,
  customerName?: string
): OrderSearchResult | null {
  if (!info.found || !info.shipStationOrderId) return null;

  return {
    source: 'shipstation',
    shopifyOrderGID: `shipstation-order-${info.shipStationOrderId}`,
    shopifyOrderName: orderNumber,
    legacyResourceId: info.shipStationOrderId.toString(),
    createdAt: info.orderDate || new Date().toISOString(),
    customerFullName: customerName || 'N/A',
    customerEmail: customerEmail || 'N/A',
    fulfillmentStatus: info.orderStatus?.replace('_', ' ').toUpperCase(),
    shopifyAdminUrl: '', // No Shopify URL for ShipStation-only orders
    itemSummary: info.items?.map(i => `${i.name} (x${i.quantity})`).join(', '),
    shipStationOrderId: info.shipStationOrderId,
    shipStationUrl: constructShipStationUrl(info.shipStationOrderId) ?? undefined,
    shipStationStatus: info.orderStatus,
    trackingNumbers: info.shipments?.map(s => s.trackingNumber).filter(Boolean) as string[],
  };
}

export async function searchShipStationOrdersAndMap(
    query: string,
    searchType: string,
    customerEmail?: string,
    customerName?: string
): Promise<OrderSearchResult[]> {
    if (searchType !== 'orderNumber') {
        console.warn(`[ShipStationService] Fallback search for type '${searchType}' is not efficiently supported by ShipStation.`);
        return [];
    }

    const orderInfo = await getOrderTrackingInfo(query);
    if (orderInfo && orderInfo.found) {
        const mappedResult = mapShipStationToOrderSearchResult(orderInfo, query, customerEmail, customerName);
        return mappedResult ? [mappedResult] : [];
    }

    return [];
} 