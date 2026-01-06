import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { getShipperHQService, type ShipperHQItem } from '@/services/shipperhq';
import { ShopifyService } from '@/services/shopify/ShopifyService';

interface LineItemInput {
  numericVariantIdShopify: string;
  quantity: number;
  title?: string;
}

interface ShippingAddressInput {
  address1: string;
  address2?: string;
  city: string;
  province: string; // State/province code like "TX", "CA"
  country: string;  // "United States" or "US", etc.
  zip: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
}

/**
 * Map country name to country code
 */
function mapCountryToCode(country: string): string {
  const countryMap: Record<string, string> = {
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'canada': 'CA',
    'ca': 'CA',
  };
  return countryMap[country.toLowerCase()] || country;
}

/**
 * API endpoint to calculate shipping rates using ShipperHQ
 * Fetches product metafields from Shopify for shipping dimensions/groups
 */
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
    const { lineItems, shippingAddress } = body as {
      lineItems: LineItemInput[];
      shippingAddress: ShippingAddressInput;
    };

    // Validate inputs
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return apiError('validation_error', 'Valid line items are required', null, { status: 400 });
    }

    if (!shippingAddress || !shippingAddress.address1 || !shippingAddress.city ||
        !shippingAddress.country || !shippingAddress.zip || !shippingAddress.province) {
      return apiError('validation_error', 'Complete shipping address is required', null, { status: 400 });
    }

    // Get ShipperHQ service
    const shipperHQ = getShipperHQService();
    if (!shipperHQ) {
      console.error('[shipping-rates] ShipperHQ service not available - SHIPPERHQ_ACCESS_TOKEN not configured');
      return apiError('configuration_error', 'Shipping rate calculation is not configured', null, { status: 503 });
    }

    // Filter valid line items
    const validLineItems = lineItems.filter(item =>
      item.numericVariantIdShopify && item.quantity > 0
    );

    if (validLineItems.length === 0) {
      return apiError('validation_error', 'No valid line items with variant IDs', null, { status: 400 });
    }

    // Fetch variant metafields from Shopify (SKU, weight, dimensions, shipping groups)
    const variantIds = validLineItems.map(item => item.numericVariantIdShopify);

    console.log('[shipping-rates] Fetching metafields for variants:', variantIds);

    const shopifyService = new ShopifyService();
    const variantMetafields = await shopifyService.getVariantShippingMetafields(variantIds);

    console.log('[shipping-rates] Retrieved metafields for', variantMetafields.size, 'variants');

    // Build ShipperHQ items with metafield data
    const shipperHQItems: ShipperHQItem[] = validLineItems.map(item => {
      const metafield = variantMetafields.get(item.numericVariantIdShopify);

      // Convert weight to pounds if needed
      let weightInPounds = metafield?.weight || 1;
      if (metafield?.weightUnit === 'KILOGRAMS') {
        weightInPounds = weightInPounds * 2.20462;
      } else if (metafield?.weightUnit === 'GRAMS') {
        weightInPounds = weightInPounds * 0.00220462;
      } else if (metafield?.weightUnit === 'OUNCES') {
        weightInPounds = weightInPounds / 16;
      }

      const shipperHQItem: ShipperHQItem = {
        itemId: item.numericVariantIdShopify,
        sku: metafield?.sku || `VAR-${item.numericVariantIdShopify}`,
        quantity: item.quantity,
        weight: weightInPounds,
      };

      // Add shipping groups if present
      if (metafield?.shippingGroups && metafield.shippingGroups.length > 0) {
        shipperHQItem.shippingGroups = metafield.shippingGroups;
      }

      // Add dimensional group if present
      if (metafield?.dimensionalGroup) {
        shipperHQItem.dimensionalGroup = metafield.dimensionalGroup;
      }

      // Add dimensions if present
      if (metafield?.dimensions) {
        shipperHQItem.dimensions = metafield.dimensions;
      }

      return shipperHQItem;
    });

    console.log('[shipping-rates] Calculating rates for items:', JSON.stringify(shipperHQItems, null, 2));
    console.log('[shipping-rates] Shipping address:', shippingAddress);

    // Calculate rates using ShipperHQ
    const result = await shipperHQ.calculateRatesForAddress(shipperHQItems, {
      city: shippingAddress.city,
      state: shippingAddress.province,
      zip: shippingAddress.zip,
      country: mapCountryToCode(shippingAddress.country),
    });

    if (result.error) {
      console.error('[shipping-rates] ShipperHQ error:', result.error);
      return apiError('shipping_error', result.error, null, { status: 400 });
    }

    // Transform rates to the format expected by the client
    const transformedRates = result.rates.map(rate => ({
      handle: `${rate.carrierCode}_${rate.methodCode}`,
      title: rate.methodTitle || `${rate.carrierTitle} - ${rate.methodCode}`,
      price: rate.price,
      currencyCode: 'USD',
      carrierCode: rate.carrierCode,
      carrierTitle: rate.carrierTitle,
      methodCode: rate.methodCode,
      deliveryDate: rate.deliveryDate,
      isFreight: rate.isFreight,
    }));

    console.log('[shipping-rates] Returning', transformedRates.length, 'rates');

    return apiSuccess({
      rates: transformedRates,
      selectedRate: result.selectedRate ? {
        handle: `${result.selectedRate.carrierCode}_${result.selectedRate.methodCode}`,
        title: result.selectedRate.methodTitle,
        price: result.selectedRate.price,
        currencyCode: 'USD',
      } : null,
    });

  } catch (error: any) {
    console.error('[shipping-rates] API error:', error);
    return apiError('internal_error', error.message || 'Internal server error', null, { status: 500 });
  }
}
