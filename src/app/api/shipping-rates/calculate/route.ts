import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { DraftOrderLineItemInput, DraftOrderAddressInput, ShopifyMoney } from '@/agents/quoteAssistant/quoteInterfaces';

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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { lineItems, shippingAddress } = body;

    // Validate inputs
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: 'Valid line items are required' },
        { status: 400 }
      );
    }

    if (!shippingAddress || !shippingAddress.address1 || !shippingAddress.city || 
        !shippingAddress.country || !shippingAddress.zip || !shippingAddress.province) {
      return NextResponse.json(
        { error: 'Complete shipping address is required' },
        { status: 400 }
      );
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
      const calculationResult: ShippingRateResponse = await shopifyService.calculateShippingRates(
        lineItems.filter((item: DraftOrderLineItemInput) => 
          item.numericVariantIdShopify && item.quantity > 0
        ),
        addressWithCodes
      );

      // Return the array of rates directly
      return NextResponse.json(calculationResult);
    } catch (error: any) {
      console.error('Error calculating shipping rates:', error);
      return NextResponse.json(
        { 
          error: 'Failed to calculate shipping rates',
          message: error.message || 'Unknown error' 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('API error in shipping calculation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 