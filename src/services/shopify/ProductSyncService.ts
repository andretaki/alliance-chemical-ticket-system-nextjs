import { db } from '@/lib/db';
import { agentProducts, agentProductVariants } from '@/db/schema';
import { ShopifyService } from './ShopifyService';
import { eq, notInArray, sql } from 'drizzle-orm';
import { Config } from '@/config/appConfig';

export class ProductSyncService {
  private shopifyService: ShopifyService;

  constructor() {
    this.shopifyService = new ShopifyService();
  }

  async syncProducts() {
    try {
      console.log('[ProductSyncService] Starting product sync...');
      const shopifyProducts = await this.shopifyService.getAllProducts();
      let productsProcessed = 0;
      let variantsProcessed = 0;
      const errorsEncountered: any[] = [];
      const allSyncedShopifyProductIds: bigint[] = [];
      const allSyncedShopifyVariantIds: bigint[] = [];

      for (const product of shopifyProducts) {
        try {
          const productIdShopifyBigInt = BigInt(product.legacyResourceId);
          allSyncedShopifyProductIds.push(productIdShopifyBigInt);

          const agentProductData = {
            product_id_shopify: productIdShopifyBigInt,
            name: product.title,
            handle_shopify: product.handle,
            description: product.descriptionHtml ? product.descriptionHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 10000) : undefined,
            product_type: product.productType || null,
            vendor: product.vendor || null,
            tags: product.tags?.join(', ') || null,
            status: product.status?.toLowerCase() || 'active',
            page_url: product.onlineStoreUrl || `https://${Config.shopify.storeUrl}/products/${product.handle}`,
            primary_image_url: product.featuredImage?.url || null,
            is_active: product.status?.toLowerCase() === 'active',
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
              console.warn(`[ProductSyncService] Skipping variant for product ${product.legacyResourceId} (Title: ${product.title}) due to missing SKU. Variant Title: ${variant.title}`);
              continue;
            }

            const variantIdShopifyBigInt = BigInt(variant.legacyResourceId);
            allSyncedShopifyVariantIds.push(variantIdShopifyBigInt);

            const agentVariantData = {
              agent_product_id: BigInt(upsertedProduct.id),
              variant_id_shopify: variantIdShopifyBigInt,
              sku: variant.sku,
              variant_title: variant.title,
              display_name: variant.displayName || `${product.title} - ${variant.title}`,
              price: String(parseFloat(variant.price)),
              currency: Config.defaultCurrency,
              inventory_quantity: variant.inventoryQuantity ? BigInt(variant.inventoryQuantity) : null,
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
          console.error(`[ProductSyncService] Error processing product ${product.legacyResourceId} (Title: ${product.title}):`, error.message);
          errorsEncountered.push({
            type: 'product_processing_error',
            productId: product.legacyResourceId,
            productTitle: product.title,
            error: error.message,
            stack: error.stack
          });
        }
      }

      // Deactivate products that no longer exist in Shopify or are not active
      if (allSyncedShopifyProductIds.length > 0) {
        await db
          .update(agentProducts)
          .set({ is_active: false, updated_at: new Date() })
          .where(notInArray(agentProducts.product_id_shopify, allSyncedShopifyProductIds));
      } else {
        console.warn("[ProductSyncService] No active products received from Shopify. Deactivating all local products.");
        await db.update(agentProducts).set({ is_active: false, updated_at: new Date() });
      }

      // Deactivate variants that no longer exist in Shopify
      if (allSyncedShopifyVariantIds.length > 0) {
        await db
          .update(agentProductVariants)
          .set({ is_active: false, updated_at: new Date() })
          .where(notInArray(agentProductVariants.variant_id_shopify, allSyncedShopifyVariantIds));
      } else {
        console.warn("[ProductSyncService] No active variants received from Shopify. Deactivating all local variants.");
        await db.update(agentProductVariants).set({ is_active: false, updated_at: new Date() });
      }

      console.log(`[ProductSyncService] Sync completed. Products processed/updated: ${productsProcessed}, Variants processed/updated: ${variantsProcessed}, Errors: ${errorsEncountered.length}`);
      if (errorsEncountered.length > 0) {
        console.error("[ProductSyncService] Errors encountered during sync:", JSON.stringify(errorsEncountered, null, 2));
      }
      return { productsProcessed, variantsProcessed, errors: errorsEncountered };

    } catch (error: any) {
      console.error('[ProductSyncService] Critical error during product sync:', error.message, error.stack);
      throw error;
    }
  }
} 