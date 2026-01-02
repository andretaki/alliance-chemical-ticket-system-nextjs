import type { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { apiSuccess, apiError } from '@/lib/apiResponse';

// API endpoint to search products directly from Shopify
export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    console.log('[API /api/products/direct-search] Received query:', query);

    if (!query || query.length < 2) {
      // Allow single character search if it's likely part of a SKU/ID
      if (!query || (query.length < 1 && !/^[a-zA-Z0-9]$/.test(query))) {
         return apiSuccess({ results: [] }); // Return empty for too short query
      }
    }

    // Use ShopifyService to search products directly from Shopify
    const shopifyService = new ShopifyService();
    const shopifyProducts = await shopifyService.searchProducts(query);

    // Transform the results to match the expected format in the frontend
    const results = shopifyProducts.flatMap(product => {
      if (!Array.isArray(product.variants?.edges)) {
        return [] as any[]; // Skip products without variants/edges
      }
      return product.variants.edges.map(variantEdge => {
        const variant = variantEdge.node;
        return {
          parentProduct: {
            id: product.legacyResourceId,
            productIdShopify: product.legacyResourceId,
            name: product.title,
            handleShopify: product.handle,
            pageUrl: product.onlineStoreUrl || `https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL}/products/${product.handle}`,
            primaryImageUrl: product.featuredImage?.url || null,
            description: product.descriptionHtml ?
              product.descriptionHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : null,
          },
          variant: {
            id: variant.legacyResourceId,
            variantIdShopify: `gid://shopify/ProductVariant/${variant.legacyResourceId}`,
            numericVariantIdShopify: variant.legacyResourceId,
            agentProductId: product.legacyResourceId,
            sku: variant.sku || '',
            variantTitle: variant.title,
            displayName: variant.displayName || `${product.title} - ${variant.title}`,
            price: parseFloat(variant.price),
            currency: 'USD', // Default currency, adjust if needed
            inventoryQuantity: variant.inventoryQuantity !== undefined ? Number(variant.inventoryQuantity) : undefined,
          }
        };
      });
    });

    console.log('[API /api/products/direct-search] Found results:', results.length);
    return apiSuccess({ results });

  } catch (error) {
    console.error('Error in direct Shopify product search API:', error);
    return apiError('internal_error', 'Internal server error', { results: [] }, { status: 500 });
  }
} 