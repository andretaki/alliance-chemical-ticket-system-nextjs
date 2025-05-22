import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { AppDraftOrderInput, DraftOrderOutput, ShopifyDraftOrderGQLResponse, ShopifyMoney, DraftOrderAddressInput, DraftOrderLineItemInput } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

function mapShopifyResponseToOutput(gqlResponse: ShopifyDraftOrderGQLResponse): DraftOrderOutput {
  const getPrice = (moneySet?: { shopMoney: ShopifyMoney }): number | undefined => {
    return moneySet ? parseFloat(moneySet.shopMoney.amount) : undefined;
  };

  return {
    id: gqlResponse.id,
    legacyResourceId: gqlResponse.legacyResourceId,
    name: gqlResponse.name,
    invoiceUrl: gqlResponse.invoiceUrl,
    status: gqlResponse.status,
    totalPrice: parseFloat(gqlResponse.totalPriceSet.shopMoney.amount),
    currencyCode: gqlResponse.totalPriceSet.shopMoney.currencyCode,
    subtotalPrice: getPrice(gqlResponse.subtotalPriceSet),
    totalShippingPrice: getPrice(gqlResponse.totalShippingPriceSet),
    totalTax: getPrice(gqlResponse.totalTaxSet),
    customer: gqlResponse.customer ? {
      id: gqlResponse.customer.id,
      email: gqlResponse.customer.email,
      firstName: gqlResponse.customer.firstName,
      lastName: gqlResponse.customer.lastName,
    } : undefined,
    lineItems: gqlResponse.lineItems.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      quantity: edge.node.quantity,
      originalUnitPrice: parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
      variant: edge.node.variant ? {
        id: edge.node.variant.id,
        legacyResourceId: edge.node.variant.legacyResourceId, // This is the numeric ID
        sku: edge.node.variant.sku,
        title: edge.node.variant.title,
        image: edge.node.variant.image,
      } : undefined,
      product: edge.node.product ? {
        id: edge.node.product.id,
        legacyResourceId: edge.node.product.legacyResourceId, // Numeric ID
        title: edge.node.product.title,
      } : undefined,
    })),
    shippingLine: gqlResponse.shippingLine ? {
      title: gqlResponse.shippingLine.title,
      price: parseFloat(gqlResponse.shippingLine.price),
    } : null,
    shippingAddress: gqlResponse.shippingAddress ? {
        ...gqlResponse.shippingAddress,
    } : undefined,
    appliedDiscount: gqlResponse.appliedDiscount ? {
        title: gqlResponse.appliedDiscount.title,
        description: gqlResponse.appliedDiscount.description,
        value: typeof gqlResponse.appliedDiscount.value === 'string' ? parseFloat(gqlResponse.appliedDiscount.value) : gqlResponse.appliedDiscount.value,
        valueType: gqlResponse.appliedDiscount.valueType,
    } : undefined,
    createdAt: gqlResponse.createdAt,
    updatedAt: gqlResponse.updatedAt,
    completedAt: gqlResponse.completedAt,
    invoiceSentAt: gqlResponse.invoiceSentAt,
    tags: gqlResponse.tags,
    customAttributes: gqlResponse.customAttributes,
    email: gqlResponse.email,
    taxExempt: gqlResponse.taxExempt,
    billingAddress: gqlResponse.billingAddress,
  };
}


export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as AppDraftOrderInput;
    console.log('[API /api/draft-orders POST] Received request body:', JSON.stringify(body, null, 2));

    if (!body.lineItems || body.lineItems.length === 0) {
      return NextResponse.json({ error: 'Line items are required' }, { status: 400 });
    }
    if (!body.shippingAddress && !body.customer?.email) {
        // Shopify might require more for customer creation if it's a new one.
        // For calculating shipping, shippingAddress is definitely needed.
        return NextResponse.json({ error: 'Shipping address or customer email is required' }, { status: 400 });
    }
    if (!body.shippingAddress) {
        return NextResponse.json({ error: 'Shipping address is required to calculate shipping rates.' }, { status: 400 });
    }

    // Ensure 'TicketSystemQuote' is present without duplicating if already there
    const currentTags = new Set(body.tags || []);
    currentTags.add('TicketSystemQuote');
    body.tags = Array.from(currentTags);

    if (!body.email && body.customer?.email) {
        body.email = body.customer.email; // Ensure draft order email is set for invoice
    }

    console.log('[API /api/draft-orders POST] Prepared draft order input:', JSON.stringify(body, null, 2));

    const shopifyService = new ShopifyService();
    
    // Step 1: Create the draft order (without shipping initially to get an ID)
    console.log('[API /api/draft-orders POST] Creating draft order...');
    let shopifyDraftOrder = await shopifyService.createDraftOrder(body);

    if (!shopifyDraftOrder) {
      console.error('[API /api/draft-orders POST] Failed to create draft order in Shopify (initial creation)');
      return NextResponse.json({ error: 'Failed to create draft order in Shopify (initial creation)' }, { status: 500 });
    }
    
    console.log('[API /api/draft-orders POST] Draft order created successfully:', JSON.stringify(shopifyDraftOrder, null, 2));
    let outputData = mapShopifyResponseToOutput(shopifyDraftOrder);

    // Step 2: If shipping address is provided, calculate shipping rates
    // This part is tricky because `draftOrderCalculate` doesn't *save* the shipping line.
    // It just returns available rates. The `draftOrderUpdate` mutation would be needed to set a shipping line.
    // For now, we'll get the rates and return the first one as an example.
    // A more complete solution would let the user pick a rate on the frontend.
    if (body.shippingAddress && outputData.id) {
        try {
            const calculatedOrder = await shopifyService.calculateDraftOrderShipping(outputData.id, body.shippingAddress);
            if (calculatedOrder?.availableShippingRates?.length > 0) {
                const firstRate = calculatedOrder.availableShippingRates[0];
                outputData.shippingLine = {
                    title: firstRate.title,
                    price: parseFloat(firstRate.price)
                };
                 console.log(`[API /api/draft-orders POST] Calculated shipping: ${firstRate.title} - ${firstRate.price}`);
            } else if (calculatedOrder?.shippingLine?.title && calculatedOrder?.shippingLine?.price) { 
                 outputData.shippingLine = {
                    title: calculatedOrder.shippingLine.title,
                    price: parseFloat(calculatedOrder.shippingLine.price)
                 };
                 console.log(`[API /api/draft-orders POST] Default/Applied shipping: ${outputData.shippingLine.title} - ${outputData.shippingLine.price}`);
            }

            // If draftOrderCalculate returns the full order object with updated prices, use them
            if (calculatedOrder?.totalPriceSet?.shopMoney?.amount) {
                outputData.totalPrice = parseFloat(calculatedOrder.totalPriceSet.shopMoney.amount);
            }
            if (calculatedOrder?.totalShippingPriceSet?.shopMoney?.amount) {
                outputData.totalShippingPrice = parseFloat(calculatedOrder.totalShippingPriceSet.shopMoney.amount);
            }


        } catch (shippingError: any) {
            console.warn(`[API /api/draft-orders POST] Could not calculate shipping for draft order ${outputData.id}: ${shippingError.message}`);
            // Proceed without shipping calculation if it fails, but log it.
            // The draft order is still created.
            console.warn(`Warning: Shipping calculation failed: ${shippingError.message}. Please set manually in Shopify.`);
        }
    }


    // Step 3: Optionally send invoice immediately after creation
    if (outputData.id && body.email && body.lineItems.length > 0) { // Check lineItems again before sending
        console.log(`Attempting to send invoice for draft order ${outputData.id} to ${body.email}`);
        const invoiceResult = await shopifyService.sendDraftOrderInvoice(outputData.id);
        if (invoiceResult.success) {
            console.log(`Invoice sent successfully for draft order ${outputData.id}. New status: ${invoiceResult.status}`);
            if (invoiceResult.invoiceUrl) outputData.invoiceUrl = invoiceResult.invoiceUrl;
            if (invoiceResult.status) outputData.status = invoiceResult.status;
        } else {
            console.warn(`Failed to send invoice for draft order ${outputData.id}: ${invoiceResult.error}`);
            console.warn(`Automated invoice sending failed: ${invoiceResult.error}. Please send manually from Shopify.`);
        }
    }


    return NextResponse.json(outputData, { status: 201 });

  } catch (error: any) {
    console.error('[API /api/draft-orders POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
} 