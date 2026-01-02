import type { NextRequest } from 'next/server';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';
import { apiSuccess, apiError } from '@/lib/apiResponse';

function mapShopifyResponseToOutput(gqlResponse: ShopifyDraftOrderGQLResponse) {
  const getPrice = (moneySet?: { shopMoney: { amount: string; currencyCode: string } }): number | undefined => {
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
    shippingAddress: gqlResponse.shippingAddress,
    appliedDiscount: gqlResponse.appliedDiscount,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let numericId = 'unknown';
  try {
    const { id } = await params;
    numericId = id;
    if (!numericId) {
      return apiError('validation_error', 'Draft order ID is required', null, { status: 400 });
    }

    const draftOrderGid = `gid://shopify/DraftOrder/${numericId}`;

    const shopifyService = new ShopifyService();
    const draftOrder = await shopifyService.getDraftOrderById(draftOrderGid);

    if (!draftOrder) {
      return apiError('not_found', 'Draft order not found', null, { status: 404 });
    }

    const output = mapShopifyResponseToOutput(draftOrder);
    return apiSuccess(output);

  } catch (error: any) {
    console.error(`[API /api/draft-orders/${numericId}] Error:`, error);
    return apiError('internal_error', error.message || 'Internal Server Error', null, { status: 500 });
  }
} 