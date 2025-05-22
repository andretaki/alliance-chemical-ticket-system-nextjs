import { ShopifyService } from '@/services/shopify/ShopifyService';
import type { DraftOrderOutput, ShopifyDraftOrderGQLResponse } from '@/agents/quoteAssistant/quoteInterfaces';

// Function to map Shopify response to our app's output format
function mapShopifyResponseToOutput(gqlResponse: ShopifyDraftOrderGQLResponse): DraftOrderOutput {
  const getPrice = (moneySet?: { shopMoney: { amount: string; currencyCode: string } }): number | undefined => {
    return moneySet ? parseFloat(moneySet.shopMoney.amount) : undefined;
  };

  // Map line items
  const lineItems = gqlResponse.lineItems?.edges?.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    quantity: edge.node.quantity,
    originalUnitPrice: parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
    variant: edge.node.variant ? {
      id: edge.node.variant.id,
      legacyResourceId: edge.node.variant.legacyResourceId,
      sku: edge.node.variant.sku,
      title: edge.node.variant.title,
      image: edge.node.variant.image
    } : undefined,
    product: edge.node.product ? {
      id: edge.node.product.id,
      legacyResourceId: edge.node.product.legacyResourceId,
      title: edge.node.product.title
    } : undefined
  })) || [];

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
    lineItems,
    shippingLine: gqlResponse.shippingLine ? {
      title: gqlResponse.shippingLine.title,
      price: parseFloat(gqlResponse.shippingLine.price)
    } : null,
    shippingAddress: gqlResponse.shippingAddress,
    appliedDiscount: gqlResponse.appliedDiscount ? {
      title: gqlResponse.appliedDiscount.title,
      description: gqlResponse.appliedDiscount.description,
      value: typeof gqlResponse.appliedDiscount.value === 'string' ? 
        parseFloat(gqlResponse.appliedDiscount.value) : 
        gqlResponse.appliedDiscount.value,
      valueType: gqlResponse.appliedDiscount.valueType
    } : undefined,
    note: gqlResponse.note
  };
}

/**
 * Fetches a draft order by ID from Shopify
 */
export async function getDraftOrderById(id: string): Promise<DraftOrderOutput | null> {
  try {
    const shopifyService = new ShopifyService();
    const draftOrder = await shopifyService.getDraftOrderById(id);
    
    if (!draftOrder) {
      return null;
    }
    
    return mapShopifyResponseToOutput(draftOrder);
  } catch (error) {
    console.error(`Error getting draft order by ID ${id}:`, error);
    throw error;
  }
} 