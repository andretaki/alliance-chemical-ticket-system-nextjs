import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import axios from 'axios';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;
const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

export async function GET(req: NextRequest) {
  try {
    console.log(`[ShipStation Order Details] API endpoint hit!`);
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log(`[ShipStation Order Details] Unauthorized access attempt`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const orderNumber = url.searchParams.get('orderNumber');

    if (!orderNumber) {
      console.log(`[ShipStation Order Details] Missing order number`);
      return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
    }

    if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
      console.error('ShipStation API credentials not configured');
      return NextResponse.json({ error: 'ShipStation API not configured' }, { status: 500 });
    }

    console.log(`[ShipStation Order Details] Looking up order: ${orderNumber}`);

    const authHeader = `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`;

    // Search for the specific order by order number
    const response = await axios.get(`${SHIPSTATION_BASE_URL}/orders`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
      params: {
        orderNumber: orderNumber,
        pageSize: 10,
        sortBy: 'OrderDate',
        sortDir: 'DESC'
      },
      timeout: 30000
    });

    console.log(`[ShipStation Order Details] ShipStation API response:`, response.data);

    if (!response.data?.orders || response.data.orders.length === 0) {
      console.log(`[ShipStation Order Details] No orders found for ${orderNumber}`);
      return NextResponse.json({ 
        error: `Order #${orderNumber} not found in ShipStation`,
        order: null 
      }, { status: 404 });
    }

    // Get the first matching order
    const order = response.data.orders[0];
    console.log(`[ShipStation Order Details] Found order:`, JSON.stringify(order, null, 2));

    // Transform shipping address
    const shippingAddr = order.shipTo;
    let transformedShippingAddress = null;

    if (shippingAddr) {
      const nameParts = shippingAddr.name?.split(' ') || [];
      transformedShippingAddress = {
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
      };
      console.log(`[ShipStation Order Details] Transformed address:`, transformedShippingAddress);
    } else {
      console.log(`[ShipStation Order Details] No shipping address found in order data`);
    }

    return NextResponse.json({
      order: {
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        orderDate: order.orderDate,
        items: order.items?.map((item: any) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
        })) || [],
        shippingAddress: transformedShippingAddress
      },
      message: transformedShippingAddress 
        ? `Found shipping address for order ${orderNumber}` 
        : `Order ${orderNumber} found but no shipping address available`
    });

  } catch (error: any) {
    console.error('[ShipStation Order Details] Error:', error);
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      console.error('[ShipStation Order Details] Axios error status:', status);
      console.error('[ShipStation Order Details] Axios error data:', error.response?.data);
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch order details from ShipStation' },
      { status: 500 }
    );
  }
} 