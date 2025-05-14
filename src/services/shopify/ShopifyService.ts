import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';

// Define types for Shopify Product and Variant Nodes
interface ShopifyProductNode {
  id: string;
  legacyResourceId: string;
  title: string;
  descriptionHtml?: string;
  productType?: string;
  vendor?: string;
  handle: string;
  status: string;
  tags: string[];
  onlineStoreUrl?: string;
  featuredImage?: { url: string };
  variants: { edges: Array<{ node: ShopifyVariantNode; }> };
}

interface ShopifyVariantNode {
  id: string;
  legacyResourceId: string;
  sku?: string;
  title: string;
  displayName?: string;
  price: string;
  inventoryQuantity?: number;
  weight?: number;
  weightUnit?: string;
  taxable?: boolean;
  requiresShipping?: boolean;
}

// Initialize Shopify API
if (!Config.shopify.storeUrl || !Config.shopify.adminAccessToken) {
  const errMsg = '[ShopifyService] Shopify store URL and Admin Access Token must be configured.';
  console.error(errMsg);
  throw new Error(errMsg);
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || "dummyAPIKeyIfNotUsedForAuth",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "dummySecretIfNotUsedForAuth",
  scopes: ['read_products'],
  hostName: Config.shopify.storeUrl.replace(/^https?:\/\//, ''),
  apiVersion: Config.shopify.apiVersion as ApiVersion || LATEST_API_VERSION,
  isEmbeddedApp: false,
  logger: { level: LogSeverity.Info },
});

export class ShopifyService {
  private shopifyStoreDomain: string;
  private adminAccessToken: string;
  private graphqlClient: InstanceType<typeof shopify.clients.Graphql>;

  constructor() {
    if (!Config.shopify.storeUrl || !Config.shopify.adminAccessToken) {
      const errMsg = 'Shopify store URL and Admin Access Token are required for ShopifyService.';
      console.error(`[ShopifyService] ${errMsg}`);
      throw new Error(errMsg);
    }
    this.shopifyStoreDomain = Config.shopify.storeUrl.replace(/^https?:\/\//, '');
    this.adminAccessToken = Config.shopify.adminAccessToken;

    // Create a custom app session
    const session = shopify.session.customAppSession(this.shopifyStoreDomain);
    session.accessToken = this.adminAccessToken;
    
    this.graphqlClient = new shopify.clients.Graphql({ session });
    console.log("[ShopifyService] Initialized with GraphQL client.");
  }

  private getNumericId(gid: string): bigint {
    try {
      return BigInt(gid.substring(gid.lastIndexOf('/') + 1));
    } catch (e) {
      console.error(`[ShopifyService] Error converting GID ${gid} to BigInt:`, e);
      throw e;
    }
  }

  private stripHtml(html?: string): string | undefined {
    if (!html) return undefined;
    return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }

  private productsQuery = (cursor?: string) => `
    query GetProducts($first: Int!, $cursor: String) {
      products(first: $first, after: $cursor, query: "status:active") {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            legacyResourceId
            title
            descriptionHtml
            productType
            vendor
            handle
            status
            tags
            onlineStoreUrl
            featuredImage {
              url
            }
            variants(first: 30) {
              edges {
                node {
                  id
                  legacyResourceId
                  sku
                  title
                  displayName
                  price
                  inventoryQuantity
                  weight
                  weightUnit
                  taxable
                  requiresShipping
                }
              }
            }
          }
        }
      }
    }
  `;

  public async getAllProducts(): Promise<ShopifyProductNode[]> {
    const products: ShopifyProductNode[] = [];
    let hasNextPage = true;
    let cursor: string | undefined = undefined;

    while (hasNextPage) {
      try {
        console.log(`[ShopifyService] Fetching products page. Cursor: ${cursor || 'start'}`);
        const response: any = await this.graphqlClient.query({
          data: {
            query: this.productsQuery(cursor),
            variables: { first: 25, cursor: cursor },
          },
        });

        if (response.body.errors) {
          console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.body.errors, null, 2));
          throw new Error('GraphQL query failed');
        }

        const productEdges = response.body.data?.products?.edges || [];
        if (productEdges.length === 0 && !response.body.data?.products?.pageInfo?.hasNextPage) {
          hasNextPage = false;
          console.log('[ShopifyService] No more products on this page and no next page.');
          break;
        }

        products.push(...productEdges.map((edge: any) => edge.node));

        const pageInfo = response.body.data?.products?.pageInfo;
        hasNextPage = pageInfo?.hasNextPage || false;
        cursor = pageInfo?.endCursor;

        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting delay
        }
      } catch (error: any) {
        console.error('[ShopifyService] Error during product fetch:', error.message);
        throw error;
      }
    }

    return products;
  }
} 