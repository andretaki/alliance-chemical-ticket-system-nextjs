import axios from 'axios';
import { env, integrations } from '@/lib/env';

const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

// Rate limiting to respect ShipStation API limits
class RateLimiter {
    private requests: number[] = [];
    private readonly limit: number = 200; // requests per minute
    private readonly window: number = 60 * 1000; // 1 minute

    constructor(limit: number = 200, window: number = 60 * 1000) {
        this.limit = limit;
        this.window = window;
    }

    async waitForSlot(): Promise<void> {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.window);

        if (this.requests.length >= this.limit) {
            const oldestRequest = this.requests[0];
            const waitTime = this.window - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.waitForSlot();
        }

        this.requests.push(now);
    }
}

const rateLimiter = new RateLimiter();

interface ShipStationAddress {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    residential?: boolean;
}

interface ShipStationOrder {
    orderId: number;
    orderNumber: string;
    orderStatus: string;
    customerEmail: string | null;
    orderDate: string;
    shippingAddress?: ShipStationAddress;
    billingAddress?: ShipStationAddress;
}

interface ShipStationOrdersResponse {
    orders: ShipStationOrder[];
    total: number;
    page: number;
    pages: number;
}

export interface ShipStationCustomerInfo {
    email?: string;
    name?: string;
    phone?: string;
    company?: string;
    firstName?: string;
    lastName?: string;
    addresses: {
        shipping?: {
            firstName: string;
            lastName: string;
            company?: string;
            address1?: string;
            address2?: string;
            city?: string;
            province?: string;
            country?: string;
            zip?: string;
            phone?: string;
        };
        billing?: {
            firstName: string;
            lastName: string;
            company?: string;
            address1?: string;
            address2?: string;
            city?: string;
            province?: string;
            country?: string;
            zip?: string;
            phone?: string;
        };
    };
    orderCount: number;
    latestOrderDate?: string;
    source: 'shipstation';
}

/**
 * Search for customer information in ShipStation by email
 */
export async function searchShipStationCustomerByEmail(email: string): Promise<ShipStationCustomerInfo | null> {
    if (!integrations.shipstation) {
        console.error('[ShipStationCustomerService] API credentials not configured');
        return null;
    }

    const authHeader = `Basic ${Buffer.from(`${env.SHIPSTATION_API_KEY}:${env.SHIPSTATION_API_SECRET}`).toString('base64')}`;

    try {
        console.log(`[ShipStationCustomerService] Searching for customer by email: ${email}`);
        
        await rateLimiter.waitForSlot();

        // Search for orders with customer email
        const response = await axios.get<ShipStationOrdersResponse>(`${SHIPSTATION_BASE_URL}/orders`, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
            },
            params: {
                customerEmail: email,
                pageSize: 50,
                sortBy: 'OrderDate',
                sortDir: 'DESC',
            },
            timeout: 30000,
        });

        if (!response.data?.orders || response.data.orders.length === 0) {
            console.log(`[ShipStationCustomerService] No orders found for email: ${email}`);
            return null;
        }

        const orders = response.data.orders;
        const latestOrder = orders[0];

        // Extract customer information from the most recent order
        const customerInfo = extractCustomerInfoFromOrders(orders, email);
        
        console.log(`[ShipStationCustomerService] Found customer with ${orders.length} orders for email: ${email}`);
        
        return customerInfo;

    } catch (error: any) {
        console.error('[ShipStationCustomerService] Error searching by email:', error.message);
        return null;
    }
}

/**
 * Search for customer information in ShipStation by name
 */
export async function searchShipStationCustomerByName(name: string): Promise<ShipStationCustomerInfo[]> {
    if (!integrations.shipstation) {
        console.error('[ShipStationCustomerService] API credentials not configured');
        return [];
    }

    const authHeader = `Basic ${Buffer.from(`${env.SHIPSTATION_API_KEY}:${env.SHIPSTATION_API_SECRET}`).toString('base64')}`;

    try {
        console.log(`[ShipStationCustomerService] Searching for customers by name: ${name}`);
        
        await rateLimiter.waitForSlot();

        // ShipStation doesn't support direct name search, so we'll search by customer name
        const response = await axios.get<ShipStationOrdersResponse>(`${SHIPSTATION_BASE_URL}/orders`, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
            },
            params: {
                customerName: name,
                pageSize: 50,
                sortBy: 'OrderDate',
                sortDir: 'DESC',
            },
            timeout: 30000,
        });

        if (!response.data?.orders || response.data.orders.length === 0) {
            console.log(`[ShipStationCustomerService] No orders found for name: ${name}`);
            return [];
        }

        // Group orders by customer email to create unique customer records
        const customerMap = new Map<string, ShipStationOrder[]>();
        
        response.data.orders.forEach(order => {
            const email = order.customerEmail || 'unknown';
            if (!customerMap.has(email)) {
                customerMap.set(email, []);
            }
            customerMap.get(email)!.push(order);
        });

        const customers: ShipStationCustomerInfo[] = [];
        
        for (const [email, orders] of customerMap) {
            if (email !== 'unknown') {
                const customerInfo = extractCustomerInfoFromOrders(orders, email);
                customers.push(customerInfo);
            }
        }

        console.log(`[ShipStationCustomerService] Found ${customers.length} unique customers for name: ${name}`);
        
        return customers;

    } catch (error: any) {
        console.error('[ShipStationCustomerService] Error searching by name:', error.message);
        return [];
    }
}

/**
 * Search for customer information in ShipStation by phone number
 */
export async function searchShipStationCustomerByPhone(phone: string): Promise<ShipStationCustomerInfo[]> {
    if (!integrations.shipstation) {
        console.error('[ShipStationCustomerService] API credentials not configured');
        return [];
    }

    // ShipStation API doesn't support direct phone search
    // We would need to fetch recent orders and filter by phone number
    // This is less efficient but could be implemented if needed
    console.log(`[ShipStationCustomerService] Phone search not directly supported by ShipStation API`);
    return [];
}

/**
 * Extract customer information from ShipStation orders
 */
function extractCustomerInfoFromOrders(orders: ShipStationOrder[], email: string): ShipStationCustomerInfo {
    const latestOrder = orders[0];
    
    // Extract name from shipping address
    let firstName = '';
    let lastName = '';
    
    if (latestOrder.shippingAddress?.name) {
        const nameParts = latestOrder.shippingAddress.name.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
    }

    // Build address information
    const addresses: ShipStationCustomerInfo['addresses'] = {};
    
    if (latestOrder.shippingAddress) {
        addresses.shipping = {
            firstName,
            lastName,
            company: latestOrder.shippingAddress.company || '',
            address1: latestOrder.shippingAddress.street1 || '',
            address2: latestOrder.shippingAddress.street2 || '',
            city: latestOrder.shippingAddress.city || '',
            province: latestOrder.shippingAddress.state || '',
            country: latestOrder.shippingAddress.country || 'United States',
            zip: latestOrder.shippingAddress.postalCode || '',
            phone: latestOrder.shippingAddress.phone || '',
        };
    }

    if (latestOrder.billingAddress) {
        const billingNameParts = latestOrder.billingAddress.name?.split(' ') || [];
        addresses.billing = {
            firstName: billingNameParts[0] || firstName,
            lastName: billingNameParts.slice(1).join(' ') || lastName,
            company: latestOrder.billingAddress.company || '',
            address1: latestOrder.billingAddress.street1 || '',
            address2: latestOrder.billingAddress.street2 || '',
            city: latestOrder.billingAddress.city || '',
            province: latestOrder.billingAddress.state || '',
            country: latestOrder.billingAddress.country || 'United States',
            zip: latestOrder.billingAddress.postalCode || '',
            phone: latestOrder.billingAddress.phone || '',
        };
    }

    return {
        email,
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        phone: addresses.shipping?.phone || addresses.billing?.phone || '',
        company: addresses.shipping?.company || addresses.billing?.company || '',
        addresses,
        orderCount: orders.length,
        latestOrderDate: latestOrder.orderDate,
        source: 'shipstation',
    };
}

/**
 * Convert ShipStation customer info to match Shopify customer format
 */
export function convertShipStationToShopifyFormat(shipStationCustomer: ShipStationCustomerInfo) {
    return {
        id: `shipstation-${shipStationCustomer.email}`, // Use a special ID format
        email: shipStationCustomer.email,
        firstName: shipStationCustomer.firstName,
        lastName: shipStationCustomer.lastName,
        phone: shipStationCustomer.phone,
        company: shipStationCustomer.company,
        source: 'shipstation',
        defaultAddress: shipStationCustomer.addresses.shipping ? {
            firstName: shipStationCustomer.addresses.shipping.firstName,
            lastName: shipStationCustomer.addresses.shipping.lastName,
            address1: shipStationCustomer.addresses.shipping.address1,
            address2: shipStationCustomer.addresses.shipping.address2,
            city: shipStationCustomer.addresses.shipping.city,
            province: shipStationCustomer.addresses.shipping.province,
            country: shipStationCustomer.addresses.shipping.country,
            zip: shipStationCustomer.addresses.shipping.zip,
            company: shipStationCustomer.addresses.shipping.company,
            phone: shipStationCustomer.addresses.shipping.phone,
        } : undefined,
    };
} 