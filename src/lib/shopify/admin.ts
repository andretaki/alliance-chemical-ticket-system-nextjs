import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';

// Initialize Shopify API
if (!Config.shopify.storeUrl || !Config.shopify.adminAccessToken) {
  const errMsg = '[ShopifyAdmin] Shopify store URL and Admin Access Token must be configured.';
  console.error(errMsg);
  throw new Error(errMsg);
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || "dummyAPIKeyIfNotUsedForAuth",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "dummySecretIfNotUsedForAuth",
  scopes: ['read_products', 'write_draft_orders', 'read_draft_orders', 'write_orders', 'read_orders', 'read_customers'],
  hostName: Config.shopify.storeUrl.replace(/^https?:\/\//, ''),
  apiVersion: Config.shopify.apiVersion as ApiVersion || LATEST_API_VERSION,
  isEmbeddedApp: false,
  logger: { level: LogSeverity.Info },
});

// Create a session
const shopifyStoreDomain = Config.shopify.storeUrl.replace(/^https?:\/\//, '');
const adminAccessToken = Config.shopify.adminAccessToken;
const session = shopify.session.customAppSession(shopifyStoreDomain);
session.accessToken = adminAccessToken;

// Create Shopify admin GraphQL client
let shopifyAdminGraphQLClient;

try {
  shopifyAdminGraphQLClient = new shopify.clients.Graphql({ session });
  console.log("[ShopifyAdmin] Successfully initialized GraphQL client.");
} catch (error) {
  console.error("[ShopifyAdmin] Failed to initialize GraphQL client:", error);
  throw error;
}

export { shopifyAdminGraphQLClient }; 