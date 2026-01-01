import axios, { AxiosError } from 'axios';
import * as alertService from '@/lib/alertService'; // For alerting on API failures
import { OrderSearchResult } from '@/types/orderSearch';
import { env, integrations } from '@/lib/env';
import { circuitBreakers } from '@/lib/circuitBreaker';

const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

// --- Types ---
export interface ShipStationShipment {
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

export interface ShipStationShipmentsResponse {
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

// --- API Request Wrapper with Exponential Backoff Retry ---
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function shipstationRequest<T>(endpoint: string, params: Record<string, any>): Promise<T> {
    if (!integrations.shipstation) {
        throw new Error("ShipStation API credentials are not configured.");
    }
    const authHeader = `Basic ${Buffer.from(`${env.SHIPSTATION_API_KEY}:${env.SHIPSTATION_API_SECRET}`).toString('base64')}`;
    const url = `${SHIPSTATION_BASE_URL}${endpoint}`;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[ShipStationService] Attempt ${attempt}/${MAX_RETRIES} - ${endpoint}`);
            const response = await axios.get<T>(url, {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                params,
                timeout: 20000
            });
            return response.data;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (axios.isAxiosError(error)) {
                const status = error.response?.status;

                // Rate limited - use Retry-After header or exponential backoff
                if (status === 429) {
                    const retryAfter = parseInt(error.response?.headers['retry-after'] || '0', 10);
                    const delay = retryAfter > 0 ? retryAfter * 1000 : BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    console.warn(`[ShipStationService] Rate limited. Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Server errors (5xx) - retry with backoff
                if (status && status >= 500) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    console.warn(`[ShipStationService] Server error ${status}. Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Client errors (4xx except 429) - don't retry
                if (status && status >= 400 && status < 500) {
                    console.error(`[ShipStationService] Client error ${status} for ${endpoint}:`, error.message);
                    throw error;
                }
            }

            // Network errors - retry with backoff
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[ShipStationService] Network error. Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    console.error(`[ShipStationService] All ${MAX_RETRIES} attempts failed for ${endpoint}`);
    throw lastError || new Error(`ShipStation API request failed after ${MAX_RETRIES} attempts`);
}

// --- Main Service Function ---
export async function getOrderTrackingInfo(orderNumber: string): Promise<OrderTrackingInfo | null> {
    // Use circuit breaker to protect against cascading failures
    return circuitBreakers.shipstation.execute(
        async () => {
            const orderResponse = await shipstationRequest<ShipStationOrderResponse>('/orders', {
                orderNumber: orderNumber,
                pageSize: 1
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
                    pageSize: 10,
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
        },
        // Fallback when circuit is open
        () => ({ found: false, errorMessage: 'ShipStation service temporarily unavailable.' })
    );
}

// --- Helper Functions ---
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

export async function fetchShipStationShipmentsPage(params: {
    page: number;
    pageSize: number;
    modifyDateStart?: string;
    modifyDateEnd?: string;
    orderNumber?: string;
}): Promise<ShipStationShipmentsResponse> {
    return shipstationRequest<ShipStationShipmentsResponse>('/shipments', {
        page: params.page,
        pageSize: params.pageSize,
        modifyDateStart: params.modifyDateStart,
        modifyDateEnd: params.modifyDateEnd,
        orderNumber: params.orderNumber,
    });
}
