export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import axios from 'axios';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env, getShopifyAccessToken } from '@/lib/env';

const SHOPIFY_STORE_DOMAIN = env.SHOPIFY_STORE_DOMAIN || env.SHOPIFY_STORE || '';
const SHOPIFY_ACCESS_TOKEN = getShopifyAccessToken();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');

    if (!name) {
      return apiError('validation_error', 'Name parameter is required', null, { status: 400 });
    }

    // Search for draft orders by name using Shopify Admin API
    const response = await axios.get(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/draft_orders.json?fields=id,name,customer,status&limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    // Find the draft order with matching name
    const draftOrders = response.data.draft_orders || [];
    const matchingOrder = draftOrders.find((order: any) => order.name === name);

    if (!matchingOrder) {
      return apiError('not_found', 'Draft order not found', null, { status: 404 });
    }

    // Return the full draft order details by fetching it individually
    const detailResponse = await axios.get(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/draft_orders/${matchingOrder.id}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    return apiSuccess(detailResponse.data.draft_order);

  } catch (error) {
    console.error('Error searching draft orders:', error);

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || 'Failed to search draft orders';
      return apiError('shopify_error', message, null, { status });
    }

    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
} 