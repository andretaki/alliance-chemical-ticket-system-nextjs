import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { ShopifyService } from '@/services/shopify/ShopifyService'; // Import ShopifyService
import { Config } from '@/config/appConfig'; // For default currency and store URL
import type { ProductVariantData, ParentProductData } from '@/agents/quoteAssistant/quoteInterfaces';

// Helper interface for the structure expected by the frontend
interface ProductVariantSearchResult {
  parentProduct: ParentProductData;
  variant: ProductVariantData;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    console.log('[API /api/products/search-variant] Session check:', !!session?.user, 'User:', session?.user?.email);
    
    if (!session?.user) {
      console.log('[API /api/products/search-variant] Unauthorized: No valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    console.log('[API /api/products/search-variant] Received query for Shopify direct search:', query);

    if (!query || query.length < 1) { // Allow single character for SKU/ID like searches
         console.log('[API /api/products/search-variant] Empty or too short query, returning empty results');
         return NextResponse.json({ results: [] });
    }
    if (query.length < 2 && !/^[a-zA-Z0-9#]$/.test(query)) { // If single char but not alphanumeric or #
        console.log('[API /api/products/search-variant] Single non-alphanumeric character, returning empty results');
        return NextResponse.json({ results: [] });
    }

    const shopifyService = new ShopifyService();
    const shopifyProducts = await shopifyService.searchProducts(query);

    // Transform the results to match the expected ProductVariantSearchResult format
    const results: ProductVariantSearchResult[] = shopifyProducts.flatMap(product => {
      // Null-safety checks for variants/edges
      if (!Array.isArray(product.variants?.edges)) {
        console.warn(`[API /api/products/search-variant] Product ${product.title} has no variants or invalid variants structure`);
        return [];
      }

      return product.variants.edges.map(variantEdge => {
        if (!variantEdge || !variantEdge.node) {
          console.warn(`[API /api/products/search-variant] Invalid variant edge structure for product ${product.title}`);
          return null;
        }

        const variant = variantEdge.node;
        // Ensure numericVariantIdShopify (legacyResourceId) is present
        if (!variant.legacyResourceId) {
            console.warn(`[API /api/products/search-variant] Variant for product ${product.title} missing legacyResourceId. SKU: ${variant.sku}, GID: ${variant.id}`);
            return null; 
        }
        return {
          parentProduct: {
            id: product.legacyResourceId, // Using legacy ID for consistency if needed as a simple ID
            productIdShopify: product.legacyResourceId,
            name: product.title,
            handleShopify: product.handle,
            pageUrl: product.onlineStoreUrl || `https://${Config.shopify.storeUrl}/products/${product.handle}`,
            primaryImageUrl: product.featuredImage?.url || undefined,
            description: product.descriptionHtml ? 
              product.descriptionHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : undefined,
          },
          variant: {
            id: variant.legacyResourceId, // Using legacy ID for consistency
            variantIdShopify: variant.id, // This is the GID, e.g., "gid://shopify/ProductVariant/123"
            numericVariantIdShopify: variant.legacyResourceId, // Shopify's numeric ID for ProductVariant
            agentProductId: product.legacyResourceId, // Parent product's numeric ID
            sku: variant.sku || '',
            variantTitle: variant.title,
            displayName: variant.displayName || `${product.title} - ${variant.title}`,
            price: parseFloat(variant.price),
            currency: Config.defaultCurrency, // Assuming default currency
            inventoryQuantity: variant.inventoryQuantity === null || variant.inventoryQuantity === undefined ? undefined : Number(variant.inventoryQuantity),
          }
        };
      }).filter(Boolean) as ProductVariantSearchResult[]; // Filter out any nulls from missing legacyResourceIds
    });

    console.log(`[API /api/products/search-variant] Found ${results.length} results from Shopify.`);
    return NextResponse.json({ results });

  } catch (error) {
    console.error('[API /api/products/search-variant] Error in Shopify product search:', error);
    return NextResponse.json(
      { error: 'Internal server error during product search', results: [] }, 
      { status: 500 }
    );
  }
} 