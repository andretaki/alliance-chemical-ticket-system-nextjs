/**
 * PricingService - Custom pricing logic for quotes
 *
 * NOTE: Currently NOT USED. Quote pricing comes directly from Shopify product prices
 * via ShopifyService. This service is reserved for future custom pricing logic like:
 * - Volume discounts / price tiers
 * - Customer-specific pricing
 * - Promotional pricing
 * - Hazmat surcharges
 *
 * If you need custom pricing, wire this into the quote creation flow.
 */

import type { ProductVariantData, CustomerContact, PriceQuoteResult } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

export class PricingService {
  /**
   * Calculate price for a product variant.
   * Currently returns Shopify base price - extend for volume discounts, etc.
   */
  public async calculatePriceForVariant(
    variant: ProductVariantData,
    requestedQuantity: number,
    _customer?: CustomerContact
  ): Promise<PriceQuoteResult | null> {
    if (!variant || variant.price === undefined) {
      return null;
    }

    // Base pricing from Shopify
    const unitPrice = variant.price;
    const totalPrice = unitPrice * requestedQuantity;

    // TODO: Add volume discount logic here when price tiers are available
    // Example:
    // if (variant.priceTiers?.length > 0) {
    //   const tier = variant.priceTiers
    //     .sort((a, b) => b.minQuantity - a.minQuantity)
    //     .find(t => requestedQuantity >= t.minQuantity);
    //   if (tier) unitPrice = tier.unitPrice;
    // }

    return {
      productName: variant.displayName || variant.variantTitle,
      variantSku: variant.sku,
      requestedQuantity,
      quotedUnitPrice: parseFloat(unitPrice.toFixed(2)),
      quotedTotalPrice: parseFloat(totalPrice.toFixed(2)),
      currency: variant.currency || Config.defaultCurrency,
      isStandardPrice: true,
      discountApplied: undefined,
      notes: [],
    };
  }
} 