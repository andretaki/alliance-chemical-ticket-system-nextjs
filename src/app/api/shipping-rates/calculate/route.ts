import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { DraftOrderLineItemInput, ShopifyMoney } from '@/agents/quoteAssistant/quoteInterfaces';
import { apiSuccess, apiError } from '@/lib/apiResponse';

// Interface for Shopify shipping rate response
interface ShippingRateResponse {
  availableShippingRates?: Array<{
    handle: string;
    title: string;
    price: ShopifyMoney;
  }>;
  subtotalPriceSet: { shopMoney: ShopifyMoney } | null;
  totalPriceSet: { shopMoney: ShopifyMoney } | null;
  totalShippingPriceSet?: { shopMoney: ShopifyMoney } | null;
  totalTaxSet?: { shopMoney: ShopifyMoney } | null;
}

// Define the shipping rate type
interface ShippingRate {
  handle: string;
  title: string;
  price: ShopifyMoney;
}

// API endpoint to calculate shipping rates for quote creation
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { lineItems, shippingAddress } = body;

    // Validate inputs
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return apiError('validation_error', 'Valid line items are required', null, { status: 400 });
    }

    if (!shippingAddress || !shippingAddress.address1 || !shippingAddress.city ||
        !shippingAddress.country || !shippingAddress.zip || !shippingAddress.province) {
      return apiError('validation_error', 'Complete shipping address is required', null, { status: 400 });
    }

    // Create a temporary draft order to calculate shipping
    const shopifyService = new ShopifyService();
    
    try {
      // Convert province to province code (2-letter code)
      const addressWithCodes = {
        ...shippingAddress,
        provinceCode: shippingAddress.province,
        countryCode: shippingAddress.country === 'United States' ? 'US' : 'CA'
      };

      // Use the Shopify GraphQL API to calculate shipping
      const rawRates: any[] = await shopifyService.calculateShippingRates(
        lineItems.filter((item: DraftOrderLineItemInput) => 
          item.numericVariantIdShopify && item.quantity > 0
        ),
        addressWithCodes
      );

      // Transform rates to the format expected by the client
      const transformedRates = rawRates.map(rate => ({
        handle: rate.handle,
        title: rate.title,
        price: parseFloat(rate.price.amount),
        currencyCode: rate.price.currencyCode,
      }));

      // Return the transformed rates
      return apiSuccess({ rates: transformedRates });
    } catch (error: any) {
      console.error('Error calculating shipping rates:', error);

      return apiError('shopify_error', 'Failed to calculate shipping rates', { message: error.message || 'Unknown error' }, { status: 500 });
    }
  } catch (error) {
    console.error('API error in shipping calculation:', error);
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
} 