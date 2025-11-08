export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { AppDraftOrderInput, DraftOrderOutput, ShopifyDraftOrderGQLResponse, ShopifyMoney, DraftOrderAddressInput, DraftOrderLineItemInput } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';
import { customerAutoCreateService } from '@/services/customerAutoCreateService';
import { SHOPIFY_TAGS, SHOPIFY_CUSTOM_ATTRIBUTES } from '@/config/constants';

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
    lineItems: Array.isArray(gqlResponse.lineItems?.edges)
      ? gqlResponse.lineItems.edges.map(edge => ({
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
      }))
      : [],
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
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
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

    // --- Auto-create customer in Shopify if enabled and customer info is provided ---
    if (body.customer?.email && customerAutoCreateService.isAutoCreateEnabled()) {
      try {
        console.log(`[POST /api/draft-orders] Attempting to auto-create customer for quote`);
        
        // Extract ticket ID from tags if available
        let ticketId: number | undefined;
        const ticketTag = body.tags?.find(tag => tag.startsWith('TicketID-'));
        if (ticketTag) {
          ticketId = parseInt(ticketTag.replace('TicketID-', ''));
        }

        const customerResult = await customerAutoCreateService.createCustomerFromTicket({
          email: body.customer.email,
          firstName: body.customer.firstName,
          lastName: body.customer.lastName,
          phone: body.customer.phone,
          company: body.customer.company,
          ticketId,
          source: 'quote_form'
        });

        if (customerResult.success) {
          if (customerResult.alreadyExists) {
            console.log(`[POST /api/draft-orders] Customer already exists in Shopify for quote: ${body.customer.email}`);
          } else {
            console.log(`[POST /api/draft-orders] Successfully created customer in Shopify for quote: ${body.customer.email} (ID: ${customerResult.customerId})`);
          }
          
          // If we got a customer ID, use it in the draft order
          if (customerResult.customerId && !body.shopifyCustomerId) {
            body.shopifyCustomerId = customerResult.customerId;
            console.log(`[POST /api/draft-orders] Using Shopify customer ID: ${customerResult.customerId}`);
          }
        } else if (customerResult.skipped) {
          console.log(`[POST /api/draft-orders] Skipped customer creation for quote: ${customerResult.skipReason}`);
        } else {
          console.warn(`[POST /api/draft-orders] Failed to create customer in Shopify for quote: ${customerResult.error}`);
        }
      } catch (customerError) {
        // Don't fail quote creation if customer creation fails
        console.error(`[POST /api/draft-orders] Error during customer auto-creation:`, customerError);
      }
    } else if (body.customer?.email) {
      console.log(`[POST /api/draft-orders] Customer auto-creation is disabled, skipping`);
    }

    // Ensure 'TicketSystemQuote' is present without duplicating if already there
    const currentTags = new Set(body.tags || []);
    currentTags.add(SHOPIFY_TAGS.TICKET_SYSTEM_QUOTE);
    body.tags = Array.from(currentTags);

    if (!body.email && body.customer?.email) {
        body.email = body.customer.email; // Ensure draft order email is set for invoice
    }

    // Prepare custom attributes for quote metadata using constants
    const customAttributes: Array<{ key: string; value: string }> = [];

    if (body.quoteType) {
      customAttributes.push({ key: SHOPIFY_CUSTOM_ATTRIBUTES.QUOTE_TYPE, value: body.quoteType });
    }

    if (body.quoteType === 'material_only') {
      if (body.materialOnlyDisclaimer) {
        customAttributes.push({ key: SHOPIFY_CUSTOM_ATTRIBUTES.MATERIAL_ONLY_DISCLAIMER, value: body.materialOnlyDisclaimer });
      }
      if (body.deliveryTerms) {
        customAttributes.push({ key: SHOPIFY_CUSTOM_ATTRIBUTES.DELIVERY_TERMS, value: body.deliveryTerms });
      }
    }
    
    // Add custom attributes to the body for Shopify processing
    if (customAttributes.length > 0) {
      body.customAttributes = customAttributes;
    }

    console.log('[API /api/draft-orders POST] Prepared draft order input:', JSON.stringify(body, null, 2));

    const shopifyService = new ShopifyService();

    // ⚡ OPTIMIZATION: Calculate shipping BEFORE creating draft order
    // This allows us to create the draft order with shipping included in a single API call
    if (!body.shippingLine && body.shippingAddress && body.lineItems.length > 0) {
        try {
            console.log('[API /api/draft-orders POST] Pre-calculating shipping rates...');
            const shippingCalculationResult = await shopifyService.calculateShippingRates(body.lineItems, body.shippingAddress);

            if (shippingCalculationResult?.availableShippingRates?.length > 0) {
                const chosenRate = shippingCalculationResult.availableShippingRates[0]; // Pick the first rate
                console.log(`[API /api/draft-orders POST] Calculated shipping rate: ${chosenRate.title} - ${chosenRate.price.amount}`);

                // Add the shipping line to the body so it's included in the initial creation
                body.shippingLine = {
                    title: chosenRate.title,
                    price: chosenRate.price.amount // This is a string from Shopify
                };
            } else {
                console.log('[API /api/draft-orders POST] No shipping rates available for the provided address');
            }
        } catch (shippingError: any) {
            console.warn(`[API /api/draft-orders POST] Could not pre-calculate shipping: ${shippingError.message}`);
            // Continue without shipping - draft order will still be created
        }
    }

    // Step 1: Create the draft order (now with shipping included if calculated above)
    console.log('[API /api/draft-orders POST] Creating draft order...');
    let shopifyDraftOrder = await shopifyService.createDraftOrder(body);

    if (!shopifyDraftOrder) {
      console.error('[API /api/draft-orders POST] Failed to create draft order in Shopify');
      return NextResponse.json({ error: 'Failed to create draft order in Shopify' }, { status: 500 });
    }

    console.log('[API /api/draft-orders POST] Draft order created successfully:', JSON.stringify(shopifyDraftOrder, null, 2));
    let outputData = mapShopifyResponseToOutput(shopifyDraftOrder);

    // Step 2: Optionally send invoice immediately after creation
    // ⚡ OPTIMIZATION: No 5-second delay needed since shipping is included in initial creation
    if (outputData.id && body.email && body.lineItems.length > 0) {
        console.log(`[API /api/draft-orders POST] Sending invoice for draft order ${outputData.id} to ${body.email}`);
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