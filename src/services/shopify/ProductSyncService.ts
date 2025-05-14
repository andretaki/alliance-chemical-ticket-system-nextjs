import { db } from '@/db';
import { agentProducts, agentProductVariants } from '@/db/schema';
import { ShopifyService } from './ShopifyService';
import { eq, notInArray } from 'drizzle-orm';
import { Config } from '@/config/appConfig';

export class ProductSyncService {
  private shopifyService: ShopifyService;

  constructor() {
    this.shopifyService = new ShopifyService();
  }

  async syncProducts() {
    try {
      const shopifyProducts = await this.shopifyService.getAllProducts();
      let productsProcessed = 0;
      let variantsProcessed = 0;
      const errorsEncountered: any[] = [];

      for (const product of shopifyProducts) {
        try {
          const agentProductData = {
            product_id_shopify: BigInt(product.legacyResourceId),
            name: product.title,
            handle_shopify: product.handle,
            description: product.descriptionHtml ? product.descriptionHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : null,
            product_type: product.productType || null,
            vendor: product.vendor || null,
            tags: product.tags?.join(', ') || null,
            status: product.status?.toLowerCase() || 'active',
            page_url: product.onlineStoreUrl || `https://${Config.shopify.storeUrl}/products/${product.handle}`,
            primary_image_url: product.featuredImage?.url || null,
            is_active: true,
            metadata: {},
            updated_at: new Date(),
          };

          const [upsertedProduct] = await db
            .insert(agentProducts)
            .values(agentProductData)
            .onConflictDoUpdate({
              target: agentProducts.product_id_shopify,
              set: agentProductData,
            })
            .returning();

          productsProcessed++;

          // Process variants
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node;
            if (!variant.sku) {
              console.warn(`[ProductSyncService] Skipping variant for product ${product.legacyResourceId} due to missing SKU`);
              continue;
            }

            const agentVariantData = {
              agent_product_id: upsertedProduct.id,
              variant_id_shopify: BigInt(variant.legacyResourceId),
              sku: variant.sku,
              variant_title: variant.title,
              display_name: variant.displayName || `${product.title} - ${variant.title}`,
              price: parseFloat(variant.price),
              currency: Config.defaultCurrency,
              inventory_quantity: variant.inventoryQuantity || 0,
              weight: variant.weight ? String(variant.weight) : null,
              weight_unit: variant.weightUnit || null,
              taxable: variant.taxable ?? true,
              requires_shipping: variant.requiresShipping ?? true,
              is_active: true,
              metadata: {},
              updated_at: new Date(),
            };

            await db
              .insert(agentProductVariants)
              .values(agentVariantData)
              .onConflictDoUpdate({
                target: agentProductVariants.variant_id_shopify,
                set: agentVariantData,
              });

            variantsProcessed++;
          }
        } catch (error: any) {
          console.error(`[ProductSyncService] Error processing product ${product.legacyResourceId}:`, error.message);
          errorsEncountered.push({
            type: 'product_processing_error',
            productId: product.legacyResourceId,
            error: error.message,
          });
        }
      }

      // Deactivate products that no longer exist in Shopify
      const shopifyProductIds = shopifyProducts.map(p => BigInt(p.legacyResourceId));
      await db
        .update(agentProducts)
        .set({ is_active: false, updated_at: new Date() })
        .where(
          eq(agentProducts.is_active, true),
          notInArray(agentProducts.product_id_shopify, shopifyProductIds)
        );

      // Deactivate variants that no longer exist in Shopify
      const shopifyVariantIds = shopifyProducts.flatMap(p => 
        p.variants.edges.map(v => BigInt(v.node.legacyResourceId))
      );
      await db
        .update(agentProductVariants)
        .set({ is_active: false, updated_at: new Date() })
        .where(
          eq(agentProductVariants.is_active, true),
          notInArray(agentProductVariants.variant_id_shopify, shopifyVariantIds)
        );

      console.log(`[ProductSyncService] Sync completed. Products: ${productsProcessed}, Variants: ${variantsProcessed}, Errors: ${errorsEncountered.length}`);
      return { productsProcessed, variantsProcessed, errors: errorsEncountered };

    } catch (error: any) {
      console.error('[ProductSyncService] Error during sync:', error.message);
      throw error;
    }
  }
} 