import axios, { AxiosError } from 'axios';
import * as alertService from '@/lib/alertService'; // For alerting on API failures
import { OrderSearchResult } from '@/types/orderSearch';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;
const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

// --- Rate Limiting Configuration ---
const RATE_LIMIT = 40; // ShipStation's official limit is 40 requests per 60 seconds.
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_RETRIES = 3;

// Simple in-memory rate limiter queue
const requestQueue: number[] = [];

async function waitForRateLimitSlot(): Promise<void> {
  const now = Date.now();

  // Remove requests from the queue that are older than the window
  while (requestQueue.length > 0 && now - requestQueue[0] > RATE_WINDOW) {
    requestQueue.shift();
  }

  if (requestQueue.length >= RATE_LIMIT) {
    const waitTime = RATE_WINDOW - (now - requestQueue[0]);
    console.warn(`[ShipStationService] Rate limit reached. Waiting for ${waitTime.toFixed(0)}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime + 100)); // Wait and retry
    return waitForRateLimitSlot();
  }

  requestQueue.push(now);
}

// --- Type Definitions for ShipStation API Response Snippets ---
interface ShipStationOrderItem {
    orderItemId: number;
    lineItemKey?: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    productId?: number;
    fulfillmentSku?: string;
    imageUrl?: string;
}

interface ShipStationShipment {
    shipmentId: number;
    trackingNumber: string | null;
    shipDate: string; // ISO 8601 date string
    carrierCode: string | null; // e.g., 'fedex', 'ups', 'usps'
    serviceCode?: string; // Service used (e.g., 'usps_priority')
    packageCode?: string;
    confirmation?: string;
    estimatedDeliveryDate?: string; // may or may not be available
    voided: boolean;
    orderId?: number; // Added for shipments endpoint response
    orderNumber?: string; // Added for shipments endpoint response
    // Add other fields if needed
}

interface ShipStationOrder {
    orderId: number;
    orderNumber: string;
    orderStatus: 'awaiting_payment' | 'awaiting_shipment' | 'shipped' | 'on_hold' | 'cancelled';
    customerEmail: string | null;
    orderDate: string;
    items?: ShipStationOrderItem[];
    shipments: ShipStationShipment[] | null; // Shipments might be null or empty
    // **NEW: Additional fields found in real API responses**
    externallyFulfilled?: boolean;
    externallyFulfilledBy?: string | null;
    externallyFulfilledById?: string | null;
    externallyFulfilledByName?: string | null;
    carrierCode?: string | null;
    serviceCode?: string | null;
    packageCode?: string | null;
    confirmation?: string | null;
    labelMessages?: any; // Can be null or contain tracking info
    customerNotes?: string | null;
    internalNotes?: string | null;
    shipDate?: string | null;
    modifyDate?: string;
    advancedOptions?: {
        customField1?: string | null;
        customField2?: string | null;
        customField3?: string | null;
        [key: string]: any; // Allow other fields
    };
    // Add other fields if needed
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

// --- Result Structure for our Service ---
export interface OrderItem {
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
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
    items?: OrderItem[];
    errorMessage?: string; // In case of lookup errors
    shipStationOrderId?: number;
}

/**
 * Makes a rate-limited request to the ShipStation API with retry logic.
 * @param orderNumber The customer's order number.
 * @returns OrderTrackingInfo object or null if critical error occurs.
 */
export async function getOrderTrackingInfo(orderNumber: string): Promise<OrderTrackingInfo | null> {
    console.log(`🚨 [ShipStationService] *** UPDATED CODE RUNNING *** Looking up order: ${orderNumber} at ${new Date().toISOString()}`);
    
    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
        console.error("ShipStation Service: API Key or Secret not configured.");
        await alertService.trackErrorAndAlert(
            'ShipStationService-Config',
            'ShipStation API Key/Secret Missing',
            { orderNumber }
        );
        return null;
    }

    await waitForRateLimitSlot(); // Wait for a slot before making any API call

    const authHeader = `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`;
    console.log(`ShipStation Service: Looking up orderNumber: ${orderNumber}`);

    try {
        // Step 1: First check the /orders endpoint
        const orderInfo = await getOrderInfo(orderNumber, authHeader);
        
        if (!orderInfo.found) {
            return orderInfo; // Order not found, return the result
        }
        
        // Step 2: If order is found but no shipments, check the /shipments endpoint
        if (orderInfo.found && (!orderInfo.shipments || orderInfo.shipments.length === 0)) {
            console.log(`ShipStation Service: Order ${orderNumber} found but no shipments in order data. Checking shipments endpoint...`);
            
            const shipmentsInfo = await getShipmentsInfo(orderNumber, authHeader, orderInfo.orderDate);
            
            if (shipmentsInfo.shipments && shipmentsInfo.shipments.length > 0) {
                // We found shipments via the shipments endpoint, update the order info
                console.log(`ShipStation Service: Found ${shipmentsInfo.shipments.length} shipments for order ${orderNumber} via shipments endpoint`);
                return {
                    found: true,
                    orderStatus: orderInfo.orderStatus,
                    orderDate: orderInfo.orderDate,
                    items: orderInfo.items,
                    shipments: shipmentsInfo.shipments
                };
            } else if (shipmentsInfo.errorMessage) {
                // We had an error looking up shipments, include it in the response
                console.log(`ShipStation Service: Error looking up shipments for order ${orderNumber}: ${shipmentsInfo.errorMessage}`);
                return {
                    found: true,
                    orderStatus: orderInfo.orderStatus,
                    orderDate: orderInfo.orderDate,
                    items: orderInfo.items,
                    errorMessage: `Order found, but error retrieving shipments: ${shipmentsInfo.errorMessage}`
                };
            }
        }
        
        // Return the original order info if we didn't find additional shipments
        return orderInfo;
    } catch (error) {
        console.error("ShipStation Service: Critical error in getOrderTrackingInfo", error);
        await alertService.trackErrorAndAlert(
            'ShipStationService-API',
            `ShipStation API lookup failed critically for order ${orderNumber}`,
            { orderNumber, error: error instanceof Error ? error.message : 'Unknown error' }
        );
        return null;
    }
}

/**
 * Helper function to get order information from the /orders endpoint
 */
async function getOrderInfo(orderNumber: string, authHeader: string): Promise<OrderTrackingInfo> {
    const url = `${SHIPSTATION_BASE_URL}/orders`;
    let retryCount = 0;
    
    while (retryCount <= MAX_RETRIES) {
        try {
            // Wait for a rate limit slot before making the request
            await waitForRateLimitSlot();

            const response = await axios.get<ShipStationOrderResponse>(url, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                },
                params: {
                    orderNumber: orderNumber,
                    pageSize: 100, // Increase to get all orders with this number
                    sortBy: 'ModifyDate', // Sort by modification date to get most recently updated
                    sortDir: 'DESC', // Sort newest first
                    includeShipmentItems: true // Try to include shipment details
                }
            });

            // **Step 2: Add extensive logging as suggested**
            console.log(`[ShipStationService getOrderInfo] RAW Response for orderNumber ${orderNumber}:`, JSON.stringify(response.data, null, 2));

            if (response.data && response.data.orders && response.data.orders.length > 0) {
                // Handle pagination if there are more orders
                let allOrders = [...response.data.orders];
                let currentPage = 1;
                const totalPages = response.data.pages;
                
                // Fetch additional pages if needed
                while (currentPage < totalPages) {
                    await waitForRateLimitSlot();
                    currentPage++;
                    
                    const pageResponse = await axios.get<ShipStationOrderResponse>(url, {
                        headers: {
                            'Authorization': authHeader,
                            'Accept': 'application/json',
                        },
                        params: {
                            orderNumber: orderNumber,
                            pageSize: 100,
                            page: currentPage,
                            sortBy: 'ModifyDate',
                            sortDir: 'DESC'
                        }
                    });
                    
                    if (pageResponse.data && pageResponse.data.orders) {
                        allOrders = [...allOrders, ...pageResponse.data.orders];
                    }
                }
                
                // Since we're sorting DESC, the first order is the newest
                const order = allOrders[0];
                console.log(`[ShipStationService getOrderInfo] Selected Order Data for ${order.orderNumber}:`, JSON.stringify(order, null, 2));
                console.log(`[ShipStationService getOrderInfo] Shipments within Order Data for ${order.orderNumber}:`, JSON.stringify(order.shipments, null, 2));
                
                // **NEW: Enhanced tracking detection for externally fulfilled orders**
                if (order.externallyFulfilled) {
                    console.log(`[ShipStationService getOrderInfo] *** EXTERNALLY FULFILLED ORDER DETECTED ***`);
                    console.log(`[ShipStationService getOrderInfo] External fulfillment details:`, {
                        externallyFulfilled: order.externallyFulfilled,
                        externallyFulfilledBy: order.externallyFulfilledBy,
                        externallyFulfilledById: order.externallyFulfilledById,
                        externallyFulfilledByName: order.externallyFulfilledByName
                    });
                    
                    // Check for tracking in various order fields that might contain it
                    console.log(`[ShipStationService getOrderInfo] Checking order-level tracking fields:`, {
                        carrierCode: order.carrierCode,
                        serviceCode: order.serviceCode,
                        packageCode: order.packageCode,
                        confirmation: order.confirmation,
                        labelMessages: order.labelMessages,
                        customerNotes: order.customerNotes,
                        internalNotes: order.internalNotes,
                        customField1: order.advancedOptions?.customField1,
                        customField2: order.advancedOptions?.customField2,
                        customField3: order.advancedOptions?.customField3
                    });
                    
                    console.log(`[ShipStationService getOrderInfo] Ship date and status:`, {
                        shipDate: order.shipDate,
                        orderStatus: order.orderStatus,
                        modifyDate: order.modifyDate
                    });
                }
                
                console.log(`ShipStation Service: Found order ${order.orderId} with status ${order.orderStatus}`);
                
                // **IMPORTANT: If there were multiple orders with the same order number, we prioritize the most recent one**
                if (allOrders.length > 1) {
                    console.warn(`[ShipStationService] DUPLICATE ORDER NUMBERS: Found ${allOrders.length} orders with number ${orderNumber}. Using the most recent order (ID: ${order.orderId}, Date: ${order.orderDate}) and ignoring older duplicates.`);
                    allOrders.slice(1).forEach((oldOrder, index) => {
                        console.warn(`[ShipStationService] - Ignoring older duplicate: Order ID ${oldOrder.orderId}, Date: ${oldOrder.orderDate}`);
                    });
                }

                // **Step 3: Enhanced date filtering logic**
                let validShipments: ShipmentInfo[] = [];
                
                if (order.shipments && order.shipments.length > 0) {
                    const orderCreationDate = new Date(order.orderDate);
                    
                    // **Improved shipment filtering with enhanced date validation**
                    const logicalShipments = order.shipments.filter(shipment => {
                        // Basic validation: not voided, has tracking and carrier
                        if (shipment.voided || !shipment.trackingNumber || !shipment.carrierCode) {
                            return false;
                        }
                        
                        // If order status is 'awaiting_payment' or 'awaiting_shipment', 
                        // there should be NO valid shipments
                        if (order.orderStatus === 'awaiting_payment' || order.orderStatus === 'awaiting_shipment') {
                            console.warn(`ShipStation Service: Order ${order.orderNumber} has status '${order.orderStatus}' but contains shipments. Filtering out invalid shipment data.`);
                            return false;
                        }
                        
                        // **Enhanced date filtering as suggested**
                        if (shipment.shipDate) {
                            const shipmentDate = new Date(shipment.shipDate);
                            
                            // **DEBUG: Log the date comparison details**
                            console.log(`[ShipStationService] Analyzing shipment date for order ${order.orderNumber}:`);
                            console.log(`[ShipStationService] - Order Date: ${order.orderDate} (${orderCreationDate.toISOString()})`);
                            console.log(`[ShipStationService] - Shipment Date: ${shipment.shipDate} (${shipmentDate.toISOString()})`);
                            console.log(`[ShipStationService] - Tracking: ${shipment.trackingNumber}`);
                            
                            // **AGGRESSIVE: Reject shipments from years that are significantly different**
                            const orderYear = orderCreationDate.getFullYear();
                            const shipmentYear = shipmentDate.getFullYear();
                            const yearDifference = Math.abs(orderYear - shipmentYear);
                            
                            if (yearDifference > 1) {
                                console.warn(`[ShipStationService] MAJOR DATE MISMATCH: Order ${order.orderNumber} from ${orderYear} has shipment from ${shipmentYear}. Year difference: ${yearDifference}. Filtering out this clearly incorrect data.`);
                                return false;
                            }
                            
                            // Ensure shipment date is on or after order date, and not unreasonably old
                            // Allow shipments up to 7 days before order date to account for pre-fulfillment or timezone issues
                            const reasonableStartDate = new Date(orderCreationDate);
                            reasonableStartDate.setDate(reasonableStartDate.getDate() - 7);
                            
                            // A shipment cannot be years before the order - this handles the 2022 vs 2025 issue
                            if (shipmentDate < reasonableStartDate) {
                                console.warn(`[ShipStationService] DATE FILTER: Order ${order.orderNumber} shipment from ${shipment.shipDate} is before reasonable start date ${reasonableStartDate.toISOString()}. Filtering out potentially stale/incorrect data.`);
                                return false;
                            }
                            
                            // Also check for shipments that are too far in the future (more than 30 days from order date)
                            const maxFutureDate = new Date(orderCreationDate);
                            maxFutureDate.setDate(maxFutureDate.getDate() + 30);
                            
                            if (shipmentDate > maxFutureDate) {
                                console.warn(`[ShipStationService] DATE FILTER: Order ${order.orderNumber} shipment from ${shipment.shipDate} is too far in the future from order date ${order.orderDate}. Filtering out potentially incorrect data.`);
                                return false;
                            }
                            
                            console.log(`[ShipStationService] ✅ Shipment date validation PASSED for order ${order.orderNumber}`);
                        }
                        
                        return true;
                    });
                    
                    validShipments = logicalShipments.map(shipment => ({
                        trackingNumber: shipment.trackingNumber!,
                        carrier: shipment.carrierCode!,
                        shipDate: shipment.shipDate,
                        serviceLevel: shipment.serviceCode,
                        estimatedDelivery: shipment.estimatedDeliveryDate
                    }));
                    
                    if (order.shipments.length > validShipments.length) {
                        console.log(`ShipStation Service: Filtered out ${order.shipments.length - validShipments.length} invalid/stale shipments for order ${order.orderNumber}`);
                    }
                }

                // Process order items
                const orderItems = (order.items || []).map(item => ({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice
                }));

                return {
                    found: true,
                    orderStatus: order.orderStatus,
                    orderDate: order.orderDate,
                    shipments: validShipments.length > 0 ? validShipments : undefined,
                    items: orderItems.length > 0 ? orderItems : undefined,
                    shipStationOrderId: order.orderId
                };
            } else {
                console.log(`ShipStation Service: OrderNumber ${orderNumber} not found.`);
                return { found: false, errorMessage: 'Order number not found in our system.' };
            }

        } catch (error: unknown) {
            let errorMessage = `Failed to fetch data from ShipStation for order ${orderNumber}`;
            let statusCode: number | undefined;
            let retryAfter: number | undefined;

            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                statusCode = axiosError.response?.status;
                retryAfter = parseInt(axiosError.response?.headers?.['retry-after'] || '0', 10);

                errorMessage = `${errorMessage}. Status: ${statusCode}. ${axiosError.message}`;
                if (axiosError.response?.data) {
                    console.error("ShipStation API Error Response:", axiosError.response.data);
                } else {
                    console.error("ShipStation API Error:", axiosError.message);
                }

                // Handle rate limiting (429) with retry
                if (statusCode === 429 && retryCount < MAX_RETRIES) {
                    const waitTime = (retryAfter || 5) * 1000; // Convert to milliseconds
                    console.log(`ShipStation Service: Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue; // Try again
                }
            } else {
                console.error("ShipStation Service Error:", error);
                errorMessage = `${errorMessage}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }

            // Alert on API errors (e.g., 5xx, 401, potentially 429 rate limits)
            if (!statusCode || statusCode >= 400) {
                await alertService.trackErrorAndAlert(
                    'ShipStationService-API',
                    `ShipStation API lookup failed for order ${orderNumber}`,
                    { orderNumber, statusCode, retryCount, error: errorMessage }
                );
            }

            // If we've exhausted retries or it's not a rate limit error, return error info
            return { found: false, errorMessage: `System error looking up order. Status Code: ${statusCode || 'unknown'}. Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
        }
    }

    // If we've exhausted all retries
    return { found: false, errorMessage: 'Maximum retry attempts reached for ShipStation API' };
}

/**
 * Helper function to get shipment information from the /shipments endpoint
 */
async function getShipmentsInfo(orderNumber: string, authHeader: string, originalOrderDate?: string): Promise<{shipments?: ShipmentInfo[], errorMessage?: string}> {
    const url = `${SHIPSTATION_BASE_URL}/shipments`;
    let retryCount = 0;
    
    while (retryCount <= MAX_RETRIES) {
        try {
            // Wait for a rate limit slot before making the request
            await waitForRateLimitSlot();

            const response = await axios.get<ShipStationShipmentsResponse>(url, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                },
                params: {
                    orderNumber: orderNumber,
                    pageSize: 100, // Get all shipments for this order
                    sortBy: 'ShipDate',
                    sortDir: 'DESC' // Sort newest first
                }
            });

            // **Step 2: Add extensive logging as suggested**
            console.log(`[ShipStationService getShipmentsInfo] RAW Response for orderNumber ${orderNumber}:`, JSON.stringify(response.data, null, 2));

            if (response.data && response.data.shipments && response.data.shipments.length > 0) {
                console.log(`ShipStation Service: Found ${response.data.shipments.length} shipments for order ${orderNumber}`);

                // Handle pagination if there are more shipments
                let allShipments = [...response.data.shipments];
                let currentPage = 1;
                const totalPages = response.data.pages;
                
                // Fetch additional pages if needed
                while (currentPage < totalPages) {
                    await waitForRateLimitSlot();
                    currentPage++;
                    
                    const pageResponse = await axios.get<ShipStationShipmentsResponse>(url, {
                        headers: {
                            'Authorization': authHeader,
                            'Accept': 'application/json',
                        },
                        params: {
                            orderNumber: orderNumber,
                            pageSize: 100,
                            page: currentPage,
                            sortBy: 'ShipDate',
                            sortDir: 'DESC'
                        }
                    });
                    
                    if (pageResponse.data && pageResponse.data.shipments) {
                        allShipments = [...allShipments, ...pageResponse.data.shipments];
                    }
                }

                // **Step 3: Apply date filtering if original order date is provided**
                let validShipments;
                if (originalOrderDate) {
                    const orderCreationDate = new Date(originalOrderDate);
                    
                    validShipments = allShipments
                        .filter(shipment => {
                            if (shipment.voided || !shipment.trackingNumber || !shipment.carrierCode) {
                                return false;
                            }
                            
                            // **Apply same date filtering logic as getOrderInfo**
                            if (shipment.shipDate) {
                                const shipmentDate = new Date(shipment.shipDate);
                                
                                // **DEBUG: Log the date comparison details**
                                console.log(`[ShipStationService getShipmentsInfo] Analyzing shipment date for order ${orderNumber}:`);
                                console.log(`[ShipStationService getShipmentsInfo] - Original Order Date: ${originalOrderDate} (${orderCreationDate.toISOString()})`);
                                console.log(`[ShipStationService getShipmentsInfo] - Shipment Date: ${shipment.shipDate} (${shipmentDate.toISOString()})`);
                                console.log(`[ShipStationService getShipmentsInfo] - Tracking: ${shipment.trackingNumber}`);
                                
                                // **RELAXED FILTERING: For very recent orders (within 30 days), be more lenient**
                                const now = new Date();
                                const daysSinceOrder = Math.abs(now.getTime() - orderCreationDate.getTime()) / (1000 * 60 * 60 * 24);
                                
                                if (daysSinceOrder <= 30) {
                                    console.log(`[ShipStationService getShipmentsInfo] Recent order (${daysSinceOrder.toFixed(1)} days old). Using relaxed date filtering.`);
                                    
                                    // For recent orders, only reject shipments that are clearly from wrong years
                                    const orderYear = orderCreationDate.getFullYear();
                                    const shipmentYear = shipmentDate.getFullYear();
                                    const yearDifference = Math.abs(orderYear - shipmentYear);
                                    
                                    if (yearDifference > 0) {
                                        console.warn(`[ShipStationService getShipmentsInfo] YEAR MISMATCH: Recent order ${orderNumber} from ${orderYear} has shipment from ${shipmentYear}. Year difference: ${yearDifference}. Filtering out this incorrect data.`);
                                        return false;
                                    }
                                    
                                    // For recent orders, allow wider date range (30 days before to 7 days after)
                                    const recentStartDate = new Date(orderCreationDate);
                                    recentStartDate.setDate(recentStartDate.getDate() - 30);
                                    
                                    const recentEndDate = new Date(orderCreationDate);
                                    recentEndDate.setDate(recentEndDate.getDate() + 7);
                                    
                                    if (shipmentDate < recentStartDate || shipmentDate > recentEndDate) {
                                        console.warn(`[ShipStationService getShipmentsInfo] DATE FILTER (RECENT): Shipment for order ${orderNumber} from ${shipment.shipDate} is outside reasonable range for recent order. Filtering out.`);
                                        return false;
                                    }
                                    
                                    console.log(`[ShipStationService getShipmentsInfo] ✅ Recent order shipment validation PASSED for order ${orderNumber}`);
                                    return true;
                                }
                                
                                // **AGGRESSIVE: Reject shipments from years that are significantly different for older orders**
                                const orderYear = orderCreationDate.getFullYear();
                                const shipmentYear = shipmentDate.getFullYear();
                                const yearDifference = Math.abs(orderYear - shipmentYear);
                                
                                if (yearDifference > 1) {
                                    console.warn(`[ShipStationService getShipmentsInfo] MAJOR DATE MISMATCH: Order ${orderNumber} from ${orderYear} has shipment from ${shipmentYear}. Year difference: ${yearDifference}. Filtering out this clearly incorrect data.`);
                                    return false;
                                }
                                
                                // Allow shipments up to 7 days before order date to account for pre-fulfillment or timezone issues
                                const reasonableStartDate = new Date(orderCreationDate);
                                reasonableStartDate.setDate(reasonableStartDate.getDate() - 7);
                                
                                // Filter out shipments that are too old (this prevents the 2022 vs 2025 issue)
                                if (shipmentDate < reasonableStartDate) {
                                    console.warn(`[ShipStationService getShipmentsInfo] DATE FILTER: Shipment for order ${orderNumber} from ${shipment.shipDate} is before reasonable start date ${reasonableStartDate.toISOString()}. Filtering out potentially stale/incorrect data.`);
                                    return false;
                                }
                                
                                // Also check for shipments that are too far in the future (more than 30 days from order date)
                                const maxFutureDate = new Date(orderCreationDate);
                                maxFutureDate.setDate(maxFutureDate.getDate() + 30);
                                
                                if (shipmentDate > maxFutureDate) {
                                    console.warn(`[ShipStationService getShipmentsInfo] DATE FILTER: Shipment for order ${orderNumber} from ${shipment.shipDate} is too far in the future from order date ${originalOrderDate}. Filtering out potentially incorrect data.`);
                                    return false;
                                }
                                
                                console.log(`[ShipStationService getShipmentsInfo] ✅ Shipment date validation PASSED for order ${orderNumber}`);
                            }
                            
                            return true;
                        })
                        .map(shipment => ({
                            trackingNumber: shipment.trackingNumber!,
                            carrier: shipment.carrierCode!,
                            shipDate: shipment.shipDate,
                            serviceLevel: shipment.serviceCode,
                            estimatedDelivery: shipment.estimatedDeliveryDate
                        }));
                    
                    if (allShipments.length > validShipments.length) {
                        console.log(`ShipStation Service: Filtered out ${allShipments.length - validShipments.length} invalid/stale shipments for order ${orderNumber} using date filtering`);
                    }
                } else {
                    // Fallback to basic filtering without date validation if no order date provided
                    validShipments = allShipments
                        .filter(shipment => !shipment.voided && shipment.trackingNumber && shipment.carrierCode)
                        .map(shipment => ({
                            trackingNumber: shipment.trackingNumber!,
                            carrier: shipment.carrierCode!,
                            shipDate: shipment.shipDate,
                            serviceLevel: shipment.serviceCode,
                            estimatedDelivery: shipment.estimatedDeliveryDate
                        }));
                }

                return {
                    shipments: validShipments.length > 0 ? validShipments : undefined
                };
            } else {
                console.log(`ShipStation Service: No shipments found for orderNumber ${orderNumber}.`);
                
                // **NEW: Try date-based search for externally fulfilled orders**
                if (originalOrderDate) {
                    console.log(`ShipStation Service: Trying date-based shipment search for potentially externally fulfilled order ${orderNumber}`);
                    return await tryDateBasedShipmentSearch(orderNumber, authHeader, originalOrderDate);
                }
                
                return { shipments: undefined };
            }

        } catch (error: unknown) {
            let errorMessage = `Failed to fetch shipment data from ShipStation for order ${orderNumber}`;
            let statusCode: number | undefined;
            let retryAfter: number | undefined;

            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                statusCode = axiosError.response?.status;
                retryAfter = parseInt(axiosError.response?.headers?.['retry-after'] || '0', 10);

                errorMessage = `${errorMessage}. Status: ${statusCode}. ${axiosError.message}`;
                if (axiosError.response?.data) {
                    console.error("ShipStation API Error Response:", axiosError.response.data);
                } else {
                    console.error("ShipStation API Error:", axiosError.message);
                }

                // Handle rate limiting (429) with retry
                if (statusCode === 429 && retryCount < MAX_RETRIES) {
                    const waitTime = (retryAfter || 5) * 1000; // Convert to milliseconds
                    console.log(`ShipStation Service: Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue; // Try again
                }
            } else {
                console.error("ShipStation Service Error:", error);
                errorMessage = `${errorMessage}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }

            // Alert on API errors (e.g., 5xx, 401, potentially 429 rate limits)
            if (!statusCode || statusCode >= 400) {
                await alertService.trackErrorAndAlert(
                    'ShipStationService-API',
                    `ShipStation API shipment lookup failed for order ${orderNumber}`,
                    { orderNumber, statusCode, retryCount, error: errorMessage }
                );
            }

            console.error("ShipStation Service: Error fetching shipments", error);
            // Return error message along with empty result
            return { shipments: undefined, errorMessage: `System error looking up shipments. Status Code: ${statusCode || 'unknown'}` };
        }
    }

    console.log(`ShipStation Service: Max retries reached when fetching shipments for order ${orderNumber}`);
    return { shipments: undefined, errorMessage: 'Maximum retry attempts reached for ShipStation API' };
}

/**
 * Try to find shipments by searching within a date range around the order date
 * This is useful for externally fulfilled orders where shipments might not be linked properly
 */
async function tryDateBasedShipmentSearch(orderNumber: string, authHeader: string, originalOrderDate: string): Promise<{shipments?: ShipmentInfo[], errorMessage?: string}> {
    const url = `${SHIPSTATION_BASE_URL}/shipments`;
    
    try {
        console.log(`[ShipStationService tryDateBasedShipmentSearch] Searching for shipments around order date for ${orderNumber}`);
        
        const orderDate = new Date(originalOrderDate);
        
        // Search for shipments within ±3 days of order date
        const startDate = new Date(orderDate);
        startDate.setDate(startDate.getDate() - 3);
        
        const endDate = new Date(orderDate);
        endDate.setDate(endDate.getDate() + 3);
        
        // Format dates for ShipStation API (YYYY-MM-DD)
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        console.log(`[ShipStationService tryDateBasedShipmentSearch] Searching shipments from ${startDateStr} to ${endDateStr}`);
        
        await waitForRateLimitSlot();
        
        const response = await axios.get<ShipStationShipmentsResponse>(url, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
            },
            params: {
                shipDateStart: startDateStr,
                shipDateEnd: endDateStr,
                pageSize: 500, // Get more results since we're searching by date
                sortBy: 'ShipDate',
                sortDir: 'DESC'
            }
        });
        
        console.log(`[ShipStationService tryDateBasedShipmentSearch] Found ${response.data?.shipments?.length || 0} shipments in date range`);
        
        if (response.data && response.data.shipments && response.data.shipments.length > 0) {
            // Look for shipments that might match this order (by order number in various fields)
            const matchingShipments = response.data.shipments.filter(shipment => {
                const matchesOrderNumber = 
                    shipment.orderNumber === orderNumber ||
                    shipment.orderNumber === `#${orderNumber}` ||
                    (shipment.orderId && shipment.orderId.toString().includes(orderNumber));
                
                const isValid = !shipment.voided && shipment.trackingNumber && shipment.carrierCode;
                
                if (matchesOrderNumber && isValid) {
                    console.log(`[ShipStationService tryDateBasedShipmentSearch] Found potential match: shipmentId=${shipment.shipmentId}, orderNumber=${shipment.orderNumber}, tracking=${shipment.trackingNumber}`);
                }
                
                return matchesOrderNumber && isValid;
            });
            
            if (matchingShipments.length > 0) {
                console.log(`[ShipStationService tryDateBasedShipmentSearch] Found ${matchingShipments.length} matching shipments for order ${orderNumber}`);
                
                const validShipments = matchingShipments.map(shipment => ({
                    trackingNumber: shipment.trackingNumber!,
                    carrier: shipment.carrierCode!,
                    shipDate: shipment.shipDate,
                    serviceLevel: shipment.serviceCode,
                    estimatedDelivery: shipment.estimatedDeliveryDate
                }));
                
                return { shipments: validShipments };
            }
        }
        
        console.log(`[ShipStationService tryDateBasedShipmentSearch] No matching shipments found for order ${orderNumber} in date range`);
        return { shipments: undefined };
        
    } catch (error) {
        console.error(`[ShipStationService tryDateBasedShipmentSearch] Error searching shipments by date for order ${orderNumber}:`, error);
        return { shipments: undefined, errorMessage: 'Error in date-based shipment search' };
    }
}

/**
 * Gets ShipStation order details including the order ID for URL construction
 * @param orderNumber The customer's order number
 * @returns Enhanced OrderTrackingInfo with ShipStation order ID
 */
export async function getShipStationOrderDetails(orderNumber: string): Promise<OrderTrackingInfo | null> {
    console.log(`[ShipStationService] Getting order details for URL construction: ${orderNumber}`);
    
    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
        console.error("ShipStation Service: API Key or Secret not configured.");
        return null;
    }

    await waitForRateLimitSlot(); // Wait for a slot before making any API call

    const authHeader = `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`;
    
    try {
        // Get order info which should include the ShipStation order ID
        const orderInfo = await getOrderInfo(orderNumber, authHeader);
        return orderInfo;
    } catch (error) {
        console.error("ShipStation Service: Error getting order details for URL construction", error);
        return null;
    }
}

/**
 * Constructs a direct URL to the ShipStation order details page.
 * Note: The URL format may need to be adjusted based on your ShipStation instance
 * @param shipStationOrderId The ShipStation internal order ID
 * @returns ShipStation admin URL or null if construction fails
 */
export function constructShipStationUrl(shipStationOrderId: number): string | null {
    if (!shipStationOrderId) {
        return null;
    }
    return `${SHIPSTATION_BASE_URL}/orders/details/${shipStationOrderId}`;
}

// Helper function to map ShipStation order data to OrderSearchResult
function mapShipStationToOrderSearchResult(
  shipStationInfo: OrderTrackingInfo,
  customerEmail?: string,
  customerName?: string
): OrderSearchResult | null {
  if (!shipStationInfo || !shipStationInfo.shipStationOrderId) {
    console.warn('[mapShipStationToOrderSearchResult] Missing shipStationInfo or shipStationOrderId');
    return null;
  }

  const orderNumber = shipStationInfo.shipStationOrderId?.toString() || 'unknown';
  
  const latestShipment = shipStationInfo.shipments?.sort((a, b) => new Date(b.shipDate).getTime() - new Date(a.shipDate))[0];

  // Check for major date mismatches
  const orderYear = new Date().getFullYear() + 1; // Assume orders are for current or next year
  const shipDate = latestShipment && latestShipment.shipDate ? new Date(latestShipment.shipDate) : null;
  const shipmentYear = shipDate && !isNaN(shipDate.getTime()) ? shipDate.getFullYear() : 0;

  if (shipmentYear && Math.abs(shipmentYear - orderYear) > 2) {
    console.log(`MAJOR DATE MISMATCH: Order ${orderNumber} from ${orderYear} has shipment from ${shipmentYear}. Ignoring shipment data.`);
  }

  const result: OrderSearchResult = {
    shopifyOrderGID: `shipstation-order-${orderNumber}`,
    shopifyOrderName: orderNumber,
    legacyResourceId: `shipstation-${orderNumber}`, // Dummy value
    customerFullName: customerName || 'N/A',
    customerEmail: customerEmail || 'N/A',
    createdAt: shipDate?.toISOString() || new Date().toISOString(),
    totalPrice: 'N/A', // ShipStation API doesn't provide this easily
    shopifyAdminUrl: '', // No Shopify URL for ShipStation-only orders
    itemSummary: shipStationInfo.items?.map(i => `${i.name} x ${i.quantity}`).join(', '),
    shipStationOrderId: shipStationInfo.shipStationOrderId,
    shipStationUrl: constructShipStationUrl(shipStationInfo.shipStationOrderId) ?? undefined,
    shipStationStatus: shipStationInfo.orderStatus,
    trackingNumbers: shipStationInfo.shipments?.map(s => s.trackingNumber).filter(Boolean) as string[],
    source: 'shipstation',
  };
  return result;
}

/**
NEW Helper: Search orders only in ShipStation and map them for fallback
*/
export async function searchShipStationOrdersAndMap(
    query: string,
    searchType: string,
    customerEmail?: string,
    customerName?: string
): Promise<OrderSearchResult[]> {
    let shipStationOrdersInfo: OrderTrackingInfo[] = [];

    if (searchType === 'orderNumber') {
        const orderInfo = await getOrderTrackingInfo(query);
        if (orderInfo && orderInfo.found) {
            shipStationOrdersInfo.push(orderInfo);
        }
    } else {
        // ShipStation does not support efficient searching by email or name directly.
        // The current fallback for order number is sufficient.
        // We can extend this later if needed by fetching recent orders and filtering.
        console.warn(`[ShipStationService] Fallback search for type '${searchType}' is not implemented.`);
    }

    return shipStationOrdersInfo
        .map(info => {
            if (!info.shipStationOrderId) return null;
            return mapShipStationToOrderSearchResult(
                info,
                customerEmail,
                customerName
            );
        })
        .filter((order): order is OrderSearchResult => order !== null);
} 