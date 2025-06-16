import { db } from '@/lib/db';
import { agentProducts, agentProductVariants, sds } from '@/db/schema';
import { eq, or, ilike, sql, asc, desc, and } from 'drizzle-orm';
import type { ParentProductData, ProductVariantData } from '@/agents/quoteAssistant/quoteInterfaces';
import { Config } from '@/config/appConfig';

import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';

const BATCH_SIZE = 1000;

// Helper interface for search results
interface ProductVariantSearchResult {
  parentProduct: ParentProductData;
  variant: ProductVariantData;
}

interface SdsInfo {
  productTitle: string;
  sdsUrl: string;
}

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

  private mapDbVariant(dbVar: typeof agentProductVariants.$inferSelect, parentProductName: string): ProductVariantData {
    const variantIdShopifyGID = dbVar.variant_id_shopify
      ? `gid://shopify/ProductVariant/${dbVar.variant_id_shopify}`
      : '';

    return {
      id: String(dbVar.id),
      variantIdShopify: variantIdShopifyGID,
      numericVariantIdShopify: dbVar.variant_id_shopify ? String(dbVar.variant_id_shopify) : undefined,
      agentProductId: String(dbVar.agent_product_id),
      sku: dbVar.sku,
      variantTitle: dbVar.variant_title,
      displayName: dbVar.display_name || `${parentProductName} - ${dbVar.variant_title}`,
      price: parseFloat(String(dbVar.price)),
      currency: dbVar.currency || Config.defaultCurrency,
      inventoryQuantity: dbVar.inventory_quantity === null || dbVar.inventory_quantity === undefined ? undefined : Number(dbVar.inventory_quantity),
    };
  }

  // Enhanced search method
  public async searchProductsAndVariants(query: string, limit: number = 10): Promise<ProductVariantSearchResult[]> {
    console.log(`[ProductService searchProductsAndVariants] Querying DB with term:`, query);
    try {
      const searchTerm = `%${query}%`;
      const exactSkuTerm = query; // For exact SKU matching priority

      const results = await db
        .select({
          product: agentProducts,
          variant: agentProductVariants,
        })
        .from(agentProductVariants)
        .innerJoin(agentProducts, eq(agentProductVariants.agent_product_id, agentProducts.id))
        .where(
          and(
            eq(agentProducts.is_active, true),
            eq(agentProductVariants.is_active, true),
            or(
              ilike(agentProducts.name, searchTerm),
              ilike(agentProductVariants.variant_title, searchTerm),
              ilike(agentProductVariants.sku, searchTerm),
              sql`${/^[0-9]{3,}$/.test(query) ? eq(agentProductVariants.variant_id_shopify, BigInt(query)) : sql`FALSE`}`
            )
          )
        )
        .orderBy(
          desc(sql`CASE WHEN ${agentProductVariants.sku} = ${exactSkuTerm} THEN 1 ELSE 0 END`),
          asc(agentProducts.name),
          asc(agentProductVariants.variant_title)
        )
        .limit(limit);

      console.log('[ProductService searchProductsAndVariants] DB Results:', results);

      if (results.length === 0) {
        console.log(`[ProductService] No active products or variants found matching "${query}"`);
        return [];
      }

      const mappedAndFilteredResults = results
        .map(result => {
          const parentProduct = this.mapDbParentProduct(result.product);
          const variant = this.mapDbVariant(result.variant, parentProduct.name);

          if (!variant.numericVariantIdShopify) {
            console.warn(`[ProductService] Variant ${variant.sku} for product ${parentProduct.name} is missing 'numericVariantIdShopify'. Filtering out.`);
            return null;
          }
          return { parentProduct, variant };
        })
        .filter(Boolean) as ProductVariantSearchResult[];

      console.log('[ProductService searchProductsAndVariants] Mapped Results:', mappedAndFilteredResults);
      return mappedAndFilteredResults;

    } catch (error) {
      console.error(`[ProductService] Error in comprehensive search for "${query}":`, error);
      return [];
    }
  }

  public async findVariantBySku(skuOrNumericId: string): Promise<ProductVariantSearchResult | null> {
    const searchResults = await this.searchProductsAndVariants(skuOrNumericId, 1);
    if (searchResults.length > 0 && (searchResults[0].variant.sku === skuOrNumericId || searchResults[0].variant.numericVariantIdShopify === skuOrNumericId) ) {
        return searchResults[0];
    }
    return null;
  }

  public async findVariantByName(name: string): Promise<ProductVariantSearchResult[]> {
    return this.searchProductsAndVariants(name);
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

      const variants = dbVariants.map(v => this.mapDbVariant(v, parentProductData.name))
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

  public async getSdsInfoForProduct(productName: string, grade?: string): Promise<SdsInfo[]> {
    console.log(`[ProductService] Getting SDS info for product: ${productName}` + (grade ? ` with grade: ${grade}` : ''));
    try {
      const searchConditions = [ilike(sds.title, `%${productName}%`)];

      if (grade) {
        searchConditions.push(ilike(sds.title, `%${grade}%`));
      }

      const results = await db
        .select({
          productTitle: sds.title,
          sdsUrl: sds.sdsUrl,
        })
        .from(sds)
        .where(and(...searchConditions));

      console.log(`[ProductService] Found ${results.length} SDS matches from DB for "${productName}"` + (grade ? ` and grade "${grade}"` : ''));
      return results;
    } catch (error) {
      console.error(`[ProductService] Error fetching SDS info from DB for "${productName}":`, error);
      return [];
    }
  }
} 