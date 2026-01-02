import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import axios from 'axios';
import { apiSuccess, apiError } from '@/lib/apiResponse';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;
const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

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
  shipDate: string;
  carrierCode: string | null;
  serviceCode?: string;
  packageCode?: string;
  confirmation?: string;
  estimatedDeliveryDate?: string;
  voided: boolean;
  orderId?: number;
  orderNumber?: string;
}

interface ShipStationOrderResponse {
  orderId: number;
  orderNumber: string;
  orderStatus: 'awaiting_payment' | 'awaiting_shipment' | 'shipped' | 'on_hold' | 'cancelled';
  customerEmail: string | null;
  orderDate: string;
  items?: ShipStationOrderItem[];
  shipments: ShipStationShipment[] | null;
  shippingAddress?: {
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
  };
  billingAddress?: {
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
  };
}

interface ShipStationOrdersResponse {
  orders: ShipStationOrderResponse[];
  total: number;
  page: number;
  pages: number;
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user?.id) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const customerEmail = url.searchParams.get('email');
    const customerName = url.searchParams.get('name');

    if (!customerEmail && !customerName) {
      return apiError('validation_error', 'Customer email or name is required', null, { status: 400 });
    }

    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
      console.error('ShipStation API credentials not configured');
      return apiError('configuration_error', 'ShipStation API not configured', null, { status: 500 });
    }

    const authHeader = `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`;

    console.log(`[ShipStation Customer Orders] Searching for orders by customer name: ${customerName || 'N/A'}, email: ${customerEmail || 'N/A'}`);

    // ShipStation API limitation: Cannot filter by customerEmail, only by customerName
    // We'll search by name if provided, otherwise show a helpful message
    const requestParams: any = {
      pageSize: 50, // Get up to 50 orders
      sortBy: 'OrderDate',
      sortDir: 'DESC', // Most recent first
      includeShipmentItems: true
    };

    if (customerName) {
      requestParams.customerName = customerName;
    }

    console.log(`[ShipStation Customer Orders] API Request URL: ${SHIPSTATION_BASE_URL}/orders`);
    console.log(`[ShipStation Customer Orders] API Request Params:`, JSON.stringify(requestParams, null, 2));

    const response = await axios.get<ShipStationOrdersResponse>(`${SHIPSTATION_BASE_URL}/orders`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
      params: requestParams,
      timeout: 30000 // 30 second timeout
    });

    console.log(`[ShipStation Customer Orders] HTTP Status:`, response.status);
    console.log(`[ShipStation Customer Orders] Found ${response.data?.orders?.length || 0} orders total`);

    if (!response.data?.orders) {
      console.log(`[ShipStation Customer Orders] No orders array in response`);
      return apiSuccess({
        orders: [],
        message: 'No orders found',
        limitation: 'ShipStation API limitation: Cannot search by email address directly. Try searching by customer name instead.'
      });
    }

    // If we have customerEmail, filter the results to only include orders from that email
    let filteredOrders = response.data.orders;
    if (customerEmail) {
      const emailLower = customerEmail.toLowerCase();
      filteredOrders = response.data.orders.filter(order =>
        order.customerEmail?.toLowerCase() === emailLower
      );

      console.log(`[ShipStation Customer Orders] Filtered to ${filteredOrders.length} orders matching email ${customerEmail}`);

      if (filteredOrders.length === 0) {
        return apiSuccess({
          orders: [],
          message: `No orders found for ${customerEmail}`,
          limitation: 'ShipStation API limitation: Cannot search by email directly. The system searched by customer name and filtered results, but found no matching orders. Try providing the customer name for better results.',
          suggestion: 'To find orders for this customer, try searching by their name instead of email address.'
        });
      }
    }

    // Transform the ShipStation data to our interface
    const transformedOrders = filteredOrders.map(order => {
      const shippingAddr = order.shippingAddress;
      const nameParts = shippingAddr?.name?.split(' ') || [];
      
      return {
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        orderStatus: order.orderStatus,
        customerEmail: order.customerEmail,
        shippingAddress: shippingAddr ? {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          company: shippingAddr.company || '',
          address1: shippingAddr.street1 || '',
          address2: shippingAddr.street2 || '',
          city: shippingAddr.city || '',
          province: shippingAddr.state || '',
          country: shippingAddr.country || 'United States',
          zip: shippingAddr.postalCode || '',
          phone: shippingAddr.phone || '',
        } : undefined,
        items: order.items?.map(item => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
        })) || [],
        trackingNumbers: order.shipments?.filter(s => s.trackingNumber && !s.voided)
          .map(s => s.trackingNumber!) || []
      };
    });

    console.log(`[ShipStation Customer Orders] Returning ${transformedOrders.length} orders`);

    const resultMessage = customerEmail
      ? `Found ${transformedOrders.length} orders for ${customerEmail}`
      : `Found ${transformedOrders.length} orders for customer name: ${customerName}`;

    return apiSuccess({
      orders: transformedOrders,
      total: transformedOrders.length,
      message: resultMessage,
      apiLimitation: 'Note: ShipStation API does not support direct email search. Results may be limited.',
    });

  } catch (error: any) {
    console.error('[ShipStation Customer Orders] Error:', error);

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401) {
        return apiError('shipstation_error', 'ShipStation API authentication failed', null, { status: 500 });
      } else if (status === 429) {
        return apiError('rate_limit', 'ShipStation API rate limit exceeded', null, { status: 429 });
      } else if (status === 404) {
        return apiSuccess({
          orders: [],
          message: 'No orders found for this customer',
          limitation: 'ShipStation API limitation: Cannot search by email address directly.'
        });
      }
    }

    return apiError('internal_error', error.message || 'Failed to fetch customer orders from ShipStation', null, { status: 500 });
  }
} 