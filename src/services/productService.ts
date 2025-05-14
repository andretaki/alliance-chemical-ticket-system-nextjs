import { db } from '@/lib/db';
import { agentProducts, agentProductVariants } from '@/lib/db/schema';
import { eq, or, ilike } from 'drizzle-orm';
import type { ParentProductData, ProductVariantData } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

export class ProductService {
  constructor() {
    console.log("[ProductService] Initialized");
  }

  private mapDbParentProduct(dbProd: typeof agentProducts.$inferSelect): ParentProductData {
    return {
      id: String(dbProd.id),
      productIdShopify: dbProd.productIdShopify ? String(dbProd.productIdShopify) : undefined,
      name: dbProd.name,
      handleShopify: dbProd.handleShopify || undefined,
      pageUrl: dbProd.pageUrl || (dbProd.handleShopify ? `https://alliancechemical.com/products/${dbProd.handleShopify}` : undefined),
      primaryImageUrl: dbProd.primaryImageUrl || undefined,
      description: dbProd.description || undefined,
    };
  }

  private mapDbVariant(dbVar: typeof agentProductVariants.$inferSelect, agentProductId: string): ProductVariantData {
    return {
      id: String(dbVar.id),
      variantIdShopify: dbVar.variantIdShopify ? String(dbVar.variantIdShopify) : undefined,
      agentProductId: agentProductId,
      sku: dbVar.sku,
      variantTitle: dbVar.variantTitle,
      displayName: dbVar.displayName || `${dbVar.variantTitle}`,
      price: parseFloat(String(dbVar.price)),
      currency: dbVar.currency || Config.defaultCurrency,
      inventoryQuantity: dbVar.inventoryQuantity === null ? undefined : dbVar.inventoryQuantity,
    };
  }

  public async findVariantBySku(sku: string): Promise<{ parentProduct: ParentProductData, variant: ProductVariantData } | null> {
    console.log(`[ProductService] STUB: Finding variant by SKU: ${sku}`);
    try {
      const dbVariant = await db.query.agentProductVariants.findFirst({
        where: eq(agentProductVariants.sku, sku),
      });

      if (!dbVariant) {
        console.log(`[ProductService] STUB: Variant with SKU ${sku} not found.`);
        return null;
      }

      const parentDbProduct = await db.query.agentProducts.findFirst({
        where: eq(agentProducts.id, dbVariant.agentProductId)
      });

      if (!parentDbProduct) {
        console.error(`[ProductService] STUB: Found variant SKU ${sku} but its parent product ID ${dbVariant.agentProductId} not found.`);
        return null;
      }

      const parentProduct = this.mapDbParentProduct(parentDbProduct);
      const variant = this.mapDbVariant(dbVariant, parentProduct.id);

      console.log(`[ProductService] STUB: Found variant ${variant.sku} for product ${parentProduct.name}`);
      return { parentProduct, variant };

    } catch (error) {
      console.error(`[ProductService] Error finding variant by SKU "${sku}":`, error);
      return null;
    }
  }

  public async findProductWithItsVariants(
    productIdentifier: string
  ): Promise<{ parentProduct: ParentProductData, variants: ProductVariantData[] } | null> {
    console.log(`[ProductService] STUB: Finding product with variants by identifier: ${productIdentifier}`);
    try {
      let parentDbProduct: typeof agentProducts.$inferSelect | undefined;

      // Try to see if identifier is a numeric Shopify Product ID
      const numericProductId = BigInt(productIdentifier);
      if (!isNaN(Number(numericProductId))) {
        parentDbProduct = await db.query.agentProducts.findFirst({
          where: eq(agentProducts.productIdShopify, numericProductId)
        });
      }

      if (!parentDbProduct) {
        parentDbProduct = await db.query.agentProducts.findFirst({
          where: or(
            ilike(agentProducts.name, `%${productIdentifier}%`),
            eq(agentProducts.handleShopify, productIdentifier)
          )
        });
      }

      if (!parentDbProduct) {
        console.log(`[ProductService] STUB: Product with identifier ${productIdentifier} not found.`);
        return null;
      }

      const parentProductData = this.mapDbParentProduct(parentDbProduct);

      const dbVariants = await db.query.agentProductVariants.findMany({
        where: eq(agentProductVariants.agentProductId, parentDbProduct.id)
      });

      const variants = dbVariants.map(v => this.mapDbVariant(v, parentProductData.id));
      console.log(`[ProductService] STUB: Found product ${parentProductData.name} with ${variants.length} variants.`);
      return { parentProduct: parentProductData, variants };

    } catch (error) {
      console.error(`[ProductService] Error finding product with variants by identifier "${productIdentifier}":`, error);
      return null;
    }
  }
} 