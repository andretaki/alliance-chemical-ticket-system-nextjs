import { db } from '@/lib/db';
import { agentProducts, agentProductVariants } from '@/db/schema';
import { eq, or, ilike, sql } from 'drizzle-orm';
import type { ParentProductData, ProductVariantData } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

export class ProductService {
  constructor() {
    console.log("[ProductService] Initialized");
  }

  private mapDbParentProduct(dbProd: typeof agentProducts.$inferSelect): ParentProductData {
    return {
      id: String(dbProd.id),
      productIdShopify: dbProd.product_id_shopify ? String(dbProd.product_id_shopify) : undefined,
      name: dbProd.name,
      handleShopify: dbProd.handle_shopify || undefined,
      pageUrl: dbProd.page_url || (dbProd.handle_shopify ? `https://${Config.shopify.storeUrl}/products/${dbProd.handle_shopify}` : undefined),
      primaryImageUrl: dbProd.primary_image_url || undefined,
      description: dbProd.description || undefined,
    };
  }

  private mapDbVariant(dbVar: typeof agentProductVariants.$inferSelect, agentProductId: string): ProductVariantData {
    // Ensure variantIdShopify is always a string in GID format
    const variantIdShopify = dbVar.variant_id_shopify 
      ? `gid://shopify/ProductVariant/${dbVar.variant_id_shopify}`
      : ''; // Provide empty string as fallback to satisfy type requirement

    return {
      id: String(dbVar.id),
      variantIdShopify,
      numericVariantIdShopify: dbVar.variant_id_shopify ? String(dbVar.variant_id_shopify) : undefined,
      agentProductId: agentProductId,
      sku: dbVar.sku,
      variantTitle: dbVar.variant_title,
      displayName: dbVar.display_name || `${dbVar.variant_title}`,
      price: parseFloat(String(dbVar.price)),
      currency: dbVar.currency || Config.defaultCurrency,
      inventoryQuantity: dbVar.inventory_quantity === null ? undefined : Number(dbVar.inventory_quantity),
    };
  }

  public async findVariantBySku(skuOrNumericId: string): Promise<{ parentProduct: ParentProductData, variant: ProductVariantData } | null> {
    console.log(`[ProductService] Finding variant by SKU or Numeric ID: ${skuOrNumericId}`);
    try {
      // Check if the input is a numeric ID
      const isNumericId = /^\d+$/.test(skuOrNumericId);
      
      // Build the where clause based on whether it's a numeric ID
      const whereClause = isNumericId 
        ? or(
            eq(agentProductVariants.sku, skuOrNumericId),
            eq(agentProductVariants.variant_id_shopify, BigInt(skuOrNumericId))
          )
        : eq(agentProductVariants.sku, skuOrNumericId);

      let dbVariant = await db.query.agentProductVariants.findFirst({
        where: whereClause,
      });

      if (!dbVariant) {
        console.log(`[ProductService] Variant with SKU or Numeric ID ${skuOrNumericId} not found.`);
        return null;
      }

      const parentDbProduct = await db.query.agentProducts.findFirst({
        where: eq(agentProducts.id, Number(dbVariant.agent_product_id))
      });

      if (!parentDbProduct) {
        console.error(`[ProductService] Found variant ${skuOrNumericId} but its parent product ID ${dbVariant.agent_product_id} not found.`);
        return null;
      }

      const parentProduct = this.mapDbParentProduct(parentDbProduct);
      const variant = this.mapDbVariant(dbVariant, parentProduct.id);

      if (!variant.numericVariantIdShopify) {
        console.warn(`[ProductService] Variant ${variant.sku} found, but it's missing 'numericVariantIdShopify'. This is required for draft orders.`);
      }

      console.log(`[ProductService] Found variant ${variant.sku} (Numeric ID: ${variant.numericVariantIdShopify}) for product ${parentProduct.name}`);
      return { parentProduct, variant };

    } catch (error) {
      console.error(`[ProductService] Error finding variant by SKU/Numeric ID "${skuOrNumericId}":`, error);
      return null;
    }
  }

  public async findVariantByName(name: string): Promise<{ parentProduct: ParentProductData, variant: ProductVariantData }[]> {
    console.log(`[ProductService] Finding variants by name: ${name}`);
    try {
      // Find all products matching the name
      const parentDbProducts = await db.query.agentProducts.findMany({
        where: ilike(agentProducts.name, `%${name}%`),
      });

      if (parentDbProducts.length === 0) {
        console.log(`[ProductService] No products found with name containing "${name}"`);
        return [];
      }

      // Get all variants for these products
      const results: { parentProduct: ParentProductData, variant: ProductVariantData }[] = [];
      
      for (const parentDbProduct of parentDbProducts) {
        const dbVariants = await db.query.agentProductVariants.findMany({
          where: eq(agentProductVariants.agent_product_id, BigInt(parentDbProduct.id))
        });

        if (dbVariants.length > 0) {
          const parentProduct = this.mapDbParentProduct(parentDbProduct);
          
          // Add each variant to results
          for (const dbVariant of dbVariants) {
            const variant = this.mapDbVariant(dbVariant, parentProduct.id);
            
            if (!variant.numericVariantIdShopify) {
              console.warn(`[ProductService] Variant ${variant.sku} found, but it's missing 'numericVariantIdShopify'. This is required for draft orders.`);
              continue; // Skip variants without numeric ID
            }
            
            results.push({ parentProduct, variant });
          }
        }
      }

      console.log(`[ProductService] Found ${results.length} variants across ${parentDbProducts.length} products matching "${name}"`);
      return results;

    } catch (error) {
      console.error(`[ProductService] Error finding variants by name "${name}":`, error);
      return [];
    }
  }

  public async findProductWithItsVariants(
    productIdentifier: string
  ): Promise<{ parentProduct: ParentProductData, variants: ProductVariantData[] } | null> {
    console.log(`[ProductService] Finding product with variants by identifier: ${productIdentifier}`);
    try {
      let parentDbProduct: typeof agentProducts.$inferSelect | undefined;

      // Try to see if identifier is a numeric Shopify Product ID
      try {
        const numericProductId = BigInt(productIdentifier);
        if (!isNaN(Number(numericProductId))) {
          parentDbProduct = await db.query.agentProducts.findFirst({
            where: sql`${agentProducts.product_id_shopify} = ${numericProductId.toString()}`
          });
        }
      } catch (e) {
        // If BigInt conversion fails, continue with other search methods
        console.log(`[ProductService] Product identifier ${productIdentifier} is not a valid numeric ID`);
      }

      if (!parentDbProduct) {
        parentDbProduct = await db.query.agentProducts.findFirst({
          where: or(
            ilike(agentProducts.name, `%${productIdentifier}%`),
            eq(agentProducts.handle_shopify, productIdentifier)
          )
        });
      }

      if (!parentDbProduct) {
        console.log(`[ProductService] Product with identifier ${productIdentifier} not found.`);
        return null;
      }

      const parentProductData = this.mapDbParentProduct(parentDbProduct);

      const dbVariants = await db.query.agentProductVariants.findMany({
        where: eq(agentProductVariants.agent_product_id, BigInt(parentDbProduct.id))
      });

      const variants = dbVariants.map(v => this.mapDbVariant(v, parentProductData.id))
        .filter(v => v.numericVariantIdShopify); // Only return variants with numeric ID for quoting

      if (variants.length === 0 && dbVariants.length > 0) {
        console.warn(`[ProductService] Product ${parentProductData.name} found, but none of its ${dbVariants.length} variants have a 'numericVariantIdShopify'.`);
      }

      console.log(`[ProductService] Found product ${parentProductData.name} with ${variants.length} quote-eligible variants.`);
      return { parentProduct: parentProductData, variants };

    } catch (error) {
      console.error(`[ProductService] Error finding product with variants by identifier "${productIdentifier}":`, error);
      return null;
    }
  }
} 