export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { AppDraftOrderInput, DraftOrderOutput, ShopifyDraftOrderGQLResponse, ShopifyMoney, DraftOrderAddressInput, DraftOrderLineItemInput } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';
import { customerAutoCreateService } from '@/services/customerAutoCreateService';
import { rateLimiters } from '@/lib/rateLimiting';

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
    // Rate limiting check
    const rateLimitResponse = await rateLimiters.admin.middleware(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

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

    // --- Idempotency Check: Prevent duplicate draft orders for the same ticket ---
    const ticketTag = body.tags?.find(tag => tag.startsWith('TicketID-'));
    if (ticketTag) {
      const ticketId = parseInt(ticketTag.replace('TicketID-', ''));
      console.log(`[POST /api/draft-orders] Checking for existing draft order for ticket ${ticketId}`);

      try {
        const shopifyService = new ShopifyService();
        // Search for existing draft orders with this ticket tag
        const existingDraftOrders = await shopifyService.searchDraftOrdersByTag(ticketTag);

        if (existingDraftOrders && existingDraftOrders.length > 0) {
          const existingDraftOrder = existingDraftOrders[0]; // Get the first matching draft order
          console.log(`[POST /api/draft-orders] Found existing draft order for ticket ${ticketId}: ${existingDraftOrder.name}`);

          // Return the existing draft order instead of creating a duplicate
          return NextResponse.json({
            ...existingDraftOrder,
            _note: 'Existing draft order returned (idempotency protection)'
          }, { status: 200 });
        }
      } catch (searchError) {
        console.warn(`[POST /api/draft-orders] Could not check for existing draft orders: ${searchError}`);
        // Continue with creation if search fails (fail open to avoid blocking legitimate requests)
      }
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
    currentTags.add('TicketSystemQuote');
    body.tags = Array.from(currentTags);

    if (!body.email && body.customer?.email) {
        body.email = body.customer.email; // Ensure draft order email is set for invoice
    }

    // Prepare custom attributes for quote metadata
    const customAttributes: Array<{ key: string; value: string }> = [];
    
    if (body.quoteType) {
      customAttributes.push({ key: 'quoteType', value: body.quoteType });
    }
    
    if (body.quoteType === 'material_only') {
      if (body.materialOnlyDisclaimer) {
        customAttributes.push({ key: 'materialOnlyDisclaimer', value: body.materialOnlyDisclaimer });
      }
      if (body.deliveryTerms) {
        customAttributes.push({ key: 'deliveryTerms', value: body.deliveryTerms });
      }
    }
    
    // Add custom attributes to the body for Shopify processing
    if (customAttributes.length > 0) {
      body.customAttributes = customAttributes;
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

    // Step 2: If a shipping line is provided directly, use it. Otherwise, calculate.
    if (body.shippingLine && outputData.id) {
        console.log(`[API /api/draft-orders POST] Applying provided shipping line: ${body.shippingLine.title} - ${body.shippingLine.price}`);
        const updatedDraftOrderWithShipping = await shopifyService.updateDraftOrderShippingLine(
            outputData.id,
            { 
                title: body.shippingLine.title, 
                price: typeof body.shippingLine.price === 'number' ? body.shippingLine.price.toString() : body.shippingLine.price 
            }
        );

        if (updatedDraftOrderWithShipping) {
            console.log('[API /api/draft-orders POST] Successfully applied provided shipping line to draft order.');
            outputData = mapShopifyResponseToOutput(updatedDraftOrderWithShipping); // Remap the whole output
        } else {
            console.warn(`[API /api/draft-orders POST] Failed to apply provided shipping line to draft order ${outputData.id}.`);
        }
    } else if (body.shippingAddress && outputData.id) {
        // Original logic to calculate shipping if no shippingLine is provided
        try {
            const lineItemsForCalc: DraftOrderLineItemInput[] = outputData.lineItems.map(item => ({
                numericVariantIdShopify: item.variant?.legacyResourceId || '', // Fallback if not present
                quantity: item.quantity,
                title: item.title,
            })).filter(item => item.numericVariantIdShopify); // Filter out items without a variant ID

            // Use the calculateShippingRates method which constructs input correctly for calculation
            const shippingCalculationResult = await shopifyService.calculateShippingRates(lineItemsForCalc, body.shippingAddress);

            if (shippingCalculationResult?.availableShippingRates?.length > 0) {
                const chosenRate = shippingCalculationResult.availableShippingRates[0]; // For simplicity, pick the first one
                console.log(`[API /api/draft-orders POST] Calculated shipping rate: ${chosenRate.title} - ${chosenRate.price.amount}`);

                // Step 2.1: Update the draft order with this shipping line
                const updatedDraftOrderWithShipping = await shopifyService.updateDraftOrderShippingLine(
                    outputData.id,
                    { title: chosenRate.title, price: chosenRate.price.amount } // Price needs to be string for Shopify API
                );

                if (updatedDraftOrderWithShipping) {
                    console.log('[API /api/draft-orders POST] Successfully applied shipping line to draft order.');
                    // Update our outputData with information from the newly updated order
                    if (updatedDraftOrderWithShipping.shippingLine) {
                         outputData.shippingLine = {
                            title: updatedDraftOrderWithShipping.shippingLine.title,
                            price: parseFloat(updatedDraftOrderWithShipping.shippingLine.price) // price is a string (Money scalar)
                        };
                    }
                    if (updatedDraftOrderWithShipping.totalPriceSet?.shopMoney?.amount) {
                        outputData.totalPrice = parseFloat(updatedDraftOrderWithShipping.totalPriceSet.shopMoney.amount);
                    }
                    if (updatedDraftOrderWithShipping.totalShippingPriceSet?.shopMoney?.amount) {
                        outputData.totalShippingPrice = parseFloat(updatedDraftOrderWithShipping.totalShippingPriceSet.shopMoney.amount);
                    }
                } else {
                    console.warn(`[API /api/draft-orders POST] Failed to apply shipping line to draft order ${outputData.id}. Proceeding without it.`);
                    // Even if update fails, use the calculated rate for display
                    outputData.shippingLine = {
                        title: chosenRate.title,
                        price: parseFloat(chosenRate.price.amount)
                    };
                }
            }

            // Update prices from the calculated order
            if (shippingCalculationResult?.totalPriceSet?.shopMoney?.amount) {
                outputData.totalPrice = parseFloat(shippingCalculationResult.totalPriceSet.shopMoney.amount);
            }
            if (shippingCalculationResult?.totalShippingPriceSet?.shopMoney?.amount) {
                outputData.totalShippingPrice = parseFloat(shippingCalculationResult.totalShippingPriceSet.shopMoney.amount);
            }
            if (shippingCalculationResult?.totalTaxSet?.shopMoney?.amount) {
                outputData.totalTax = parseFloat(shippingCalculationResult.totalTaxSet.shopMoney.amount);
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
        // Introduce a small delay to allow Shopify to finish processing the draft order update
        console.log('[API /api/draft-orders POST] Waiting a few seconds before sending invoice...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay

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