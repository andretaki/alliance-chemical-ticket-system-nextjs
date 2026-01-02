import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';
import type { AppDraftOrderInput, ShopifyDraftOrderGQLResponse, ShopifyMoney, DraftOrderLineItemInput, DraftOrderAddressInput } from '@/agents/quoteAssistant/quoteInterfaces';
import { mapCountryToCode, mapProvinceToCode } from '@/utils/addressUtils';
import { withResilience } from '@/lib/resilience';
import { env } from '@/lib/env';

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
  image?: { url: string };
}

// Type for a single Shopify Order node from GraphQL
export interface ShopifyOrderNode {
  id: string; // The GID, e.g., "gid://shopify/Order/12345"
  legacyResourceId: string; // The numeric ID, e.g., "12345"
  name: string; // The order name, e.g., "#1001"
  createdAt: string; // ISO 8601 date string
  processedAt?: string | null;
  closedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus: 'FULFILLED' | 'UNFULFILLED' | 'PARTIALLY_FULFILLED' | 'SCHEDULED' | 'ON_HOLD';
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer: {
    id: string;
    legacyResourceId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        quantity: number;
        name: string;
        sku?: string;
        variant?: {
          id: string;
          legacyResourceId?: string;
          title: string;
        };
        originalUnitPriceSet?: { shopMoney: { amount: string; currencyCode: string } };
      };
    }>;
  };
  cursor?: string;
  // Add other fields as needed
}

// Define the GraphQL response type to match the Shopify client's actual return type
type ResponseErrors = any;

interface GraphQLResponse {
  data?: {
    products?: {
      edges: Array<{ node: ShopifyProductNode }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string;
      };
    };
    draftOrderCreate?: {
        draftOrder: ShopifyDraftOrderGQLResponse;
        userErrors: Array<{ field: string[]; message: string }>;
    };
    draftOrderInvoiceSend?: {
        draftOrder?: { id: string; invoiceUrl?: string; status: string; };
        userErrors: Array<{ field: string[]; message: string }>;
    };
    draftOrderCalculate?: { // For shipping rate calculation
        calculatedDraftOrder: {
            id?: string; // May not be present if it's a dry run without saving
            availableShippingRates: Array<{
                handle: string;
                title: string;
                price: string; // Scalar Money type
            }>;
            shippingLine?: { // The selected or default shipping line
                handle?: string;
                price: string; // Scalar Money type
                title?: string;
            };
            subtotalPriceSet?: { shopMoney: ShopifyMoney };
            totalPriceSet?: { shopMoney: ShopifyMoney };
            totalShippingPriceSet?: { shopMoney: ShopifyMoney };
            totalTaxSet?: { shopMoney: ShopifyMoney };
        };
        userErrors: Array<{ field: string[]; message: string }>;
    };
    calculateShippingRates?: {
      calculatedShippingRates: Array<{
        title: string;
        handle: string;
        price: string; // Scalar Money type
      }>;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };
  errors?: ResponseErrors | any[];
}

// Shopify GraphQL input types
interface ShopifyDraftOrderInput_LineItem {
  variantId: string; // GID of the variant
  quantity: number;
  title?: string;
  originalUnitPrice?: string; // If overriding price
  // customAttributes?: Array<{ key: string; value: string }>;
}

interface ShopifyDraftOrderInput_Address {
  address1: string;
  address2?: string;
  city: string;
  company?: string;
  countryCode?: string; // e.g., "US"
  firstName: string;
  lastName: string;
  phone?: string;
  provinceCode?: string; // e.g., "TX"
  zip: string;
}

interface ShopifyDraftOrderInput_Customer {
  id?: string; // GID of existing customer
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  // ... other customer fields if creating a new one
}

// Lazy initialization of Shopify API to avoid build errors when env vars are missing
let _shopify: ReturnType<typeof shopifyApi> | null = null;

function getShopifyApi() {
  if (_shopify) return _shopify;

  if (!Config.shopify.storeUrl || !Config.shopify.adminAccessToken) {
    const errMsg = '[ShopifyService] Shopify store URL and Admin Access Token must be configured.';
    console.error(errMsg);
    throw new Error(errMsg);
  }

  _shopify = shopifyApi({
    apiKey: env.SHOPIFY_API_KEY || "dummyAPIKeyIfNotUsedForAuth",
    apiSecretKey: env.SHOPIFY_API_SECRET || "dummySecretIfNotUsedForAuth",
    scopes: ['read_products', 'write_draft_orders', 'read_draft_orders', 'write_orders', 'read_orders', 'read_customers', 'write_customers'],
    hostName: Config.shopify.storeUrl.replace(/^https?:\/\//, ''),
    apiVersion: Config.shopify.apiVersion as ApiVersion || LATEST_API_VERSION,
    isEmbeddedApp: false,
    logger: { level: LogSeverity.Info },
  });

  return _shopify;
}

export class ShopifyService {
  private shopifyStoreDomain: string;
  private adminAccessToken: string;
  private apiVersion: string;
  private graphqlClient: any;
  private readonly REQUEST_TIMEOUT_MS = 30000; // 30 seconds

  constructor() {
    const shopify = getShopifyApi();

    console.log(`[ShopifyService] Initializing with store: ${Config.shopify.storeUrl}`);
    console.log(`[ShopifyService] Admin token exists: ${!!Config.shopify.adminAccessToken}`);
    console.log(`[ShopifyService] API version: ${Config.shopify.apiVersion}`);

    this.shopifyStoreDomain = Config.shopify.storeUrl!.replace(/^https?:\/\//, '');
    this.adminAccessToken = Config.shopify.adminAccessToken!;
    this.apiVersion = Config.shopify.apiVersion || '2024-04';

    // Create a custom app session
    const session = shopify.session.customAppSession(this.shopifyStoreDomain);
    session.accessToken = this.adminAccessToken;

    try {
      this.graphqlClient = new shopify.clients.Graphql({ session });
      console.log("[ShopifyService] Successfully initialized GraphQL client.");
    } catch (error) {
      console.error("[ShopifyService] Failed to initialize GraphQL client:", error);
      throw error;
    }
  }

  /**
   * Wrapper for GraphQL requests with timeout and circuit breaker protection
   */
  private async requestWithTimeout(
    query: string,
    options?: { variables?: any; retries?: number }
  ): Promise<any> {
    return withResilience(
      () => this.graphqlClient.request(query, options),
      {
        timeout: this.REQUEST_TIMEOUT_MS,
        name: 'Shopify-GraphQL',
        // No fallback - let callers handle failures
      }
    );
  }

  private getNumericId(gid: string): bigint {
    try {
      return BigInt(gid.substring(gid.lastIndexOf('/') + 1));
    } catch (e) {
      console.error(`[ShopifyService] Error converting GID ${gid} to BigInt:`, e);
      throw e;
    }
  }
  
  private convertGidToNumericId(gid?: string): string | undefined {
    if (!gid) return undefined;
    const parts = gid.split('/');
    return parts[parts.length -1];
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
                  image {
                    url
                  }
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
        const response: any = await this.graphqlClient.request(
          this.productsQuery(cursor),
          {
            variables: { first: 25, cursor: cursor },
            retries: 2
          }
        );

        if (response.errors) {
          console.error('[ShopifyService] GraphQL errors when fetching products:', response.errors);
          throw new Error('Failed to fetch products from Shopify.');
        }

        const productEdges = response.data?.products?.edges || [];
        products.push(...productEdges.map((edge: any) => edge.node));
        
        hasNextPage = response.data?.products?.pageInfo?.hasNextPage || false;
        cursor = response.data?.products?.pageInfo?.endCursor;

      } catch (error) {
        console.error(`[ShopifyService] Error fetching products:`, error);
        throw error;
      }
    }
    return products;
  }

  /**
   * Fetches draft orders by a given query string, with full details.
   * @param query - The Shopify search query string (e.g., "tag:'TicketID-123'").
   * @param limit - The maximum number of results to return.
   * @returns An array of draft order GQL response objects.
   */
  public async getDraftOrdersByQuery(query: string, limit: number = 1): Promise<ShopifyDraftOrderGQLResponse[]> {
    const gqlQuery = `
      query GetDraftOrders($query: String!, $first: Int!) {
        draftOrders(query: $query, first: $first, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              legacyResourceId
              name
              status
              invoiceUrl
              createdAt
              updatedAt
              totalPriceSet { shopMoney { amount currencyCode } }
              subtotalPriceSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
              totalShippingPriceSet { shopMoney { amount currencyCode } }
              customer {
                id
                displayName
                email
                firstName
                lastName
                phone
                company
              }
              shippingAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                zip
                country
                company
                phone
              }
              billingAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                zip
                country
                company
                phone
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    title
                    originalUnitPriceSet { shopMoney { amount currencyCode } }
                    product {
                      id
                      title
                    }
                    variant {
                      id
                      title
                      sku
                    }
                  }
                }
              }
              tags
            }
          }
        }
      }
    `;

    try {
      console.log(`[ShopifyService] Searching for draft orders with query: ${query}`);
      const response: any = await this.graphqlClient.request(
        gqlQuery,
        {
          variables: { query: query, first: limit },
          retries: 2
        }
      );

      if (response.errors) {
        console.error('[ShopifyService] GraphQL errors when searching draft orders:', response.errors);
        throw new Error('Failed to search draft orders in Shopify.');
      }

      const draftOrders = response.data?.draftOrders?.edges?.map((edge: any) => edge.node) || [];
      console.log(`[ShopifyService] Found ${draftOrders.length} draft orders.`);
      return draftOrders;
    } catch (error) {
      console.error(`[ShopifyService] Error searching draft orders by query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Search for draft orders by tag (for idempotency checks)
   */
  public async searchDraftOrdersByTag(tag: string): Promise<ShopifyDraftOrderGQLResponse[]> {
    // Shopify query syntax for tags: tag:value
    const query = `tag:${tag}`;
    return this.getDraftOrdersByQuery(query, 5); // Return up to 5 matches
  }

  public getDraftOrderAdminUrl(legacyResourceId: string): string {
    return `https://${this.shopifyStoreDomain}/admin/draft_orders/${legacyResourceId}`;
  }

  public getOrderAdminUrl(legacyResourceId: string): string {
    return `https://${this.shopifyStoreDomain}/admin/orders/${legacyResourceId}`;
  }

  public async searchProducts(query: string): Promise<ShopifyProductNode[]> {
    const searchQuery = `
      query SearchProducts($first: Int!, $query: String!) {
        products(first: $first, query: $query) {
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
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      console.log(`[ShopifyService] Directly searching products with query: "${query}"`);
      const response: any = await this.graphqlClient.request(
        searchQuery,
        {
          variables: { 
            query: query,
            first: 25 
          },
          retries: 1
        }
      );

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors during product search:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL search query failed');
      }

      const productEdges = response.data?.products?.edges || [];
      const products = productEdges.map((edge: any) => edge.node);
      
      console.log(`[ShopifyService] Found ${products.length} products matching query: "${query}"`);
      return products;
    } catch (error: any) {
      console.error('[ShopifyService] Error in searchProducts:', error);
      throw error;
    }
  }

  // --- New Draft Order Methods ---
  public async createDraftOrder(appInput: AppDraftOrderInput): Promise<ShopifyDraftOrderGQLResponse | null> {
    const { lineItems, customer, shopifyCustomerId, shippingAddress, billingAddress, note, email: emailForInvoice, tags, customAttributes } = appInput;

    const shopifyLineItems: ShopifyDraftOrderInput_LineItem[] = lineItems.map(item => {
      const variantId = item.numericVariantIdShopify.startsWith('gid://')
        ? item.numericVariantIdShopify
        : `gid://shopify/ProductVariant/${item.numericVariantIdShopify}`;
      
      return {
        variantId: variantId,
        quantity: item.quantity,
        ...(item.title && { title: item.title }), // For custom items
        ...(item.price && { originalUnitPrice: item.price.toFixed(2) }), // For custom items or price overrides
      };
    });

    let shopifyShippingAddressInput: ShopifyDraftOrderInput_Address | undefined = undefined;
    if (shippingAddress) {
      shopifyShippingAddressInput = {
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.city,
        company: shippingAddress.company,
        countryCode: mapCountryToCode(shippingAddress.country),
        firstName: shippingAddress.firstName,
        lastName: shippingAddress.lastName,
        phone: shippingAddress.phone,
        provinceCode: mapProvinceToCode(shippingAddress.province, shippingAddress.country),
        zip: shippingAddress.zip,
      };
       // Validate country and province codes
       if (shippingAddress.country && !shopifyShippingAddressInput.countryCode) {
        throw new Error(`Invalid country provided: ${shippingAddress.country}. Could not map to a valid code.`);
      }
      if (shippingAddress.province && shippingAddress.country && !shopifyShippingAddressInput.provinceCode) {
        // Only error if province was provided but couldn't be mapped, and country code was valid
        if (shopifyShippingAddressInput.countryCode) {
          throw new Error(`Invalid province '${shippingAddress.province}' for country '${shippingAddress.country}'. Could not map to a valid code.`);
        }
      }
    }

    let shopifyBillingAddressInput: ShopifyDraftOrderInput_Address | undefined = undefined;
    if (billingAddress) {
      shopifyBillingAddressInput = {
        address1: billingAddress.address1,
        address2: billingAddress.address2,
        city: billingAddress.city,
        company: billingAddress.company,
        countryCode: mapCountryToCode(billingAddress.country),
        firstName: billingAddress.firstName,
        lastName: billingAddress.lastName,
        phone: billingAddress.phone,
        provinceCode: mapProvinceToCode(billingAddress.province, billingAddress.country),
        zip: billingAddress.zip,
      };
       // Validate country and province codes for billing address
       if (billingAddress.country && !shopifyBillingAddressInput.countryCode) {
        throw new Error(`Invalid billing country provided: ${billingAddress.country}. Could not map to a valid code.`);
      }
      if (billingAddress.province && billingAddress.country && !shopifyBillingAddressInput.provinceCode) {
        // Only error if province was provided but couldn't be mapped, and country code was valid
        if (shopifyBillingAddressInput.countryCode) {
          throw new Error(`Invalid billing province '${billingAddress.province}' for country '${billingAddress.country}'. Could not map to a valid code.`);
        }
      }
    }

    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            legacyResourceId
            name
            invoiceUrl
            status
            totalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            customer { id email firstName lastName phone defaultAddress { id } }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  discountedUnitPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountSet { shopMoney { amount currencyCode } }
                  taxLines { priceSet { shopMoney { amount currencyCode } } ratePercentage title }
                  variant { id legacyResourceId sku title image { url altText } }
                  product { id legacyResourceId title }
                }
              }
            }
            shippingLine {
              title
              price
              shippingRateHandle
            }
            shippingAddress {
              firstName lastName address1 address2 city company phone zip provinceCode countryCode
            }
            appliedDiscount {
              title
              description
              value
              valueType
              amountSet { shopMoney { amount currencyCode } }
            }
            createdAt
            updatedAt
            completedAt
            invoiceSentAt
            tags
            customAttributes { key value }
            email
            taxExempt
            currencyCode
            billingAddress {
              firstName lastName address1 address2 city company phone zip provinceCode countryCode
            }
          }
          userErrors { field message }
        }
      }
    `;

    // Construct the main input object for the mutation
    const draftOrderMutationInput: any = {
      lineItems: shopifyLineItems,
    };

    if (shopifyCustomerId) {
      draftOrderMutationInput.customerId = `gid://shopify/Customer/${shopifyCustomerId}`;
    }

    // The 'email' field on DraftOrderInput is for the customer's email and invoice.
    // It's also used to find an existing customer or create a new one if customerId is not provided.
    if (emailForInvoice) { // emailForInvoice is appInput.email, which should be customer's email
      draftOrderMutationInput.email = emailForInvoice;
    }
    
    // If no customerId, and customer object has phone, add it to input.
    // Shopify might use this to find/create customer.
    if (!shopifyCustomerId && customer?.phone) {
        draftOrderMutationInput.phone = customer.phone;
    }

    if (shopifyShippingAddressInput) {
      draftOrderMutationInput.shippingAddress = shopifyShippingAddressInput;
    }

    if (shopifyBillingAddressInput) {
      draftOrderMutationInput.billingAddress = shopifyBillingAddressInput;
    }

    if (note) {
      draftOrderMutationInput.note = note;
    }
    if (tags && tags.length > 0) {
      draftOrderMutationInput.tags = tags;
    }

    if (customAttributes && customAttributes.length > 0) {
      draftOrderMutationInput.customAttributes = customAttributes;
    }

    const variables = {
      input: draftOrderMutationInput,
    };

    try {
      console.log('[ShopifyService] Creating draft order with variables:', JSON.stringify(variables, null, 2));
      console.log('[ShopifyService] GraphQL mutation:', mutation);
      
      const response = await this.requestWithTimeout(mutation, { variables, retries: 2 });
      console.log('[ShopifyService] Raw GraphQL response:', JSON.stringify(response, null, 2));

      // Check for GraphQL errors
      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      // Check for userErrors in the response
      const userErrors = response.data?.draftOrderCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error('[ShopifyService] UserErrors creating draft order:', userErrors);
        throw new Error(userErrors.map((e: any) => `${e.field?.join(', ') || 'General'}: ${e.message}`).join('; '));
      }

      if (!response.data?.draftOrderCreate?.draftOrder) {
        console.error('[ShopifyService] Draft order not created, full response:', JSON.stringify(response, null, 2));
        throw new Error('Draft order creation failed, no draft order returned.');
      }

      const draftOrder = response.data.draftOrderCreate.draftOrder;
      console.log('[ShopifyService] Draft order created successfully:', JSON.stringify(draftOrder, null, 2));
      return draftOrder;

    } catch (error: any) {
      console.error('[ShopifyService] Error creating draft order:', error);
      // Attempt to parse and re-throw GraphQL errors for better client-side handling
      if (error.message.includes('GraphQL query failed')) {
        try {
            const gqlErrors = JSON.parse(error.message.substring(error.message.indexOf('{')));
            throw new Error(`Shopify API Error: ${gqlErrors.errors[0].message}`);
        } catch (e) {
            throw error; // fallback to original error
        }
      }
      throw error;
    }
  }

  public async sendDraftOrderInvoice(draftOrderId: string): Promise<{ success: boolean; invoiceUrl?: string; status?: string; error?: string }> {
    const mutation = `
        mutation draftOrderInvoiceSend($id: ID!) {
            draftOrderInvoiceSend(id: $id) {
                draftOrder {
                    id
                    invoiceUrl
                    status
                }
                userErrors { field message }
            }
        }
    `;
    try {
        console.log(`[ShopifyService] Sending invoice for draft order: ${draftOrderId}`);
        const response: any = await this.graphqlClient.request(mutation, {
            variables: { id: draftOrderId }, // draftOrderId should be the GID
            retries: 1
        });

        // Check for GraphQL errors
        if (response.errors) {
          console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
          return { success: false, error: 'GraphQL query failed' };
        }

        // Check for userErrors
        const userErrors = response.data?.draftOrderInvoiceSend?.userErrors;
        if (userErrors && userErrors.length > 0) {
            const errorMessages = userErrors.map((e: any) => e.message).join(', ');
            console.error(`[ShopifyService] UserErrors sending draft order invoice: ${errorMessages}`);
            return { success: false, error: errorMessages };
        }

        if (response.data?.draftOrderInvoiceSend?.draftOrder) {
            const { invoiceUrl, status } = response.data.draftOrderInvoiceSend.draftOrder;
            console.log(`[ShopifyService] Draft order invoice sent. URL: ${invoiceUrl}, Status: ${status}`);
            return { success: true, invoiceUrl, status };
        }
        
        console.error('[ShopifyService] Failed to send draft order invoice, no order data returned.');
        return { success: false, error: 'Failed to send draft order invoice, no order data returned.' };

    } catch (error: any) {
        console.error('[ShopifyService] Error sending draft order invoice:', error);
        const errorMessage = error.response?.errors ? error.response.errors.map((e: any) => e.message).join(', ') : error.message;
        return { success: false, error: `Shopify API Error: ${errorMessage}` };
    }
  }

  public async updateDraftOrderShippingLine(
    draftOrderId: string,
    shippingLineInput: { title: string; price: string } // price as string e.g., "10.00"
  ): Promise<ShopifyDraftOrderGQLResponse | null> {
    const mutation = `
      mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            legacyResourceId
            name
            invoiceUrl
            status
            totalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            shippingLine {
              title
              price
              shippingRateHandle
            }
          }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      id: draftOrderId,
      input: {
        shippingLine: shippingLineInput,
      },
    };

    try {
      console.log(`[ShopifyService] Updating shipping line for draft order ${draftOrderId} with:`, JSON.stringify(shippingLineInput));
      const response: any = await this.requestWithTimeout(mutation, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors on draftOrderUpdate:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed during draftOrderUpdate');
      }

      const userErrors = response.data?.draftOrderUpdate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error('[ShopifyService] UserErrors updating draft order shipping line:', userErrors);
        throw new Error(userErrors.map((e: any) => e.message).join('; '));
      }

      if (!response.data?.draftOrderUpdate?.draftOrder) {
        throw new Error('Draft order not returned after update.');
      }

      console.log('[ShopifyService] Draft order shipping line updated successfully.');
      return response.data.draftOrderUpdate.draftOrder;
    } catch (error: any) {
      console.error('[ShopifyService] Error updating draft order shipping line:', error);
      const errorMessage = error.response?.errors ? error.response.errors.map((e: any) => e.message).join(', ') : error.message;
      throw new Error(`Shopify API Error (Update Shipping Line): ${errorMessage}`);
    }
  }

  /**
   * Calculates shipping rates for a set of line items and a destination address
   * by creating a temporary draft order.
   */
  public async calculateShippingRates(
    lineItems: DraftOrderLineItemInput[],
    shippingAddress: DraftOrderAddressInput,
    note?: string
  ) {
    // This function creates a draft order without saving it to calculate shipping.
    const shopifyLineItems: ShopifyDraftOrderInput_LineItem[] = lineItems.map(item => ({
      variantId: `gid://shopify/ProductVariant/${item.numericVariantIdShopify}`,
      quantity: item.quantity,
    }));

    let shopifyShippingAddressInput: ShopifyDraftOrderInput_Address | undefined;
    try {
      const countryCode = mapCountryToCode(shippingAddress.country);
      const provinceCode = mapProvinceToCode(shippingAddress.country, shippingAddress.province || '');
      shopifyShippingAddressInput = {
        ...shippingAddress,
        countryCode,
        provinceCode,
      };
    } catch(e) {
        console.error("Could not map country or province:", e);
        throw e;
    }


    const calculationMutation = `
      mutation draftOrderCalculate($input: DraftOrderInput!) {
        draftOrderCalculate(input: $input) {
          calculatedDraftOrder {
            availableShippingRates {
              handle
              title
              price {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: shopifyLineItems,
        shippingAddress: shopifyShippingAddressInput,
        note: note,
      },
    };

    try {
      console.log('[ShopifyService] Calculating shipping rates with input:', JSON.stringify(variables, null, 2));
      const response: any = await this.requestWithTimeout(calculationMutation, { variables, retries: 2 });
      
      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors during shipping calculation:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed during shipping calculation');
      }

      const userErrors = response.data?.draftOrderCalculate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error('[ShopifyService] UserErrors calculating shipping rates:', userErrors);
        const errorMessage = userErrors.map((e: any) => `${e.field?.join(', ') || 'Input'}: ${e.message}`).join('; ');
        throw new Error(errorMessage);
      }
      
      const rates = response.data.draftOrderCalculate.calculatedDraftOrder.availableShippingRates || [];
      console.log('[ShopifyService] Shipping rates calculated:', JSON.stringify(rates, null, 2));
      
      // Return the raw rates array from Shopify
      return rates;
    } catch (error) {
      console.error('[ShopifyService] Error calculating shipping rates:', error);
      throw error;
    }
  }

  /**
   * Fetches a draft order by ID
   */
  public async getDraftOrderById(id: string): Promise<ShopifyDraftOrderGQLResponse | null> {
    const query = `
      query getDraftOrder($id: ID!) {
        draftOrder(id: $id) {
          id
          legacyResourceId
          name
          invoiceUrl
          status
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          customer { id email firstName lastName phone }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                variant { id legacyResourceId sku title image { url altText } }
                product { id legacyResourceId title }
              }
            }
          }
          shippingLine {
            title
            price
            shippingRateHandle
          }
          shippingAddress {
            firstName lastName address1 address2 city company phone zip provinceCode countryCode
          }
          appliedDiscount {
            title description value valueType
            amountSet { shopMoney { amount currencyCode } }
          }
          createdAt
          updatedAt
          completedAt
          invoiceSentAt
          tags
          customAttributes { key value }
          email
          taxExempt
          currencyCode
          billingAddress {
            firstName lastName address1 address2 city company phone zip provinceCode countryCode
          }
        }
      }
    `;

    const variables = {
      id: id.includes('/') ? id : `gid://shopify/DraftOrder/${id}`,
    };

    try {
      console.log(`[ShopifyService] Fetching draft order with ID: ${id}`);
      console.log(`[ShopifyService] GraphQL variables for getDraftOrderById: ${JSON.stringify(variables, null, 2)}`);
      
      const response: any = await this.requestWithTimeout(query, { variables, retries: 2 });
      
      console.log(`[ShopifyService] Full GraphQL response for getDraftOrderById ${id}:`, JSON.stringify(response, null, 2));

      if (response.errors) {
        console.error(`[ShopifyService] GraphQL Errors fetching draft order ${id}:`, JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      if (!response.data.draftOrder) {
        console.warn(`[ShopifyService] Draft order with ID ${id} not found.`);
        return null;
      }
      
      console.log(`[ShopifyService] Draft order ${id} fetched successfully.`);
      return response.data.draftOrder;
    } catch (error) {
      console.error(`[ShopifyService] Error fetching draft order ${id}:`, error);
      return null;
    }
  }

  
  // --- Order Management Methods ---

  /**
   * Flexible order search.
   * Example queries:
   * - "name:#1234" (specific order)
   * - "email:john.doe@example.com"
   * - "first_name:John AND last_name:Doe"
   * - "fulfillment_status:unshipped"
   */
  public async searchOrders(query: string, limit: number = 20): Promise<ShopifyOrderNode[]> {
    console.log(`[ShopifyService] Searching orders with query: "${query}"`);

    const gqlQuery = `
      query SearchOrders($query: String!, $first: Int!) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              legacyResourceId
              name
              createdAt
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                firstName
                lastName
                email
              }
              lineItems(first: 10) {
                edges {
                  node {
                    quantity
                    name
                    sku
                    variant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      const response: any = await this.graphqlClient.request(gqlQuery, {
        variables: { first: limit, query: query },
        retries: 2,
      });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors during order search:', JSON.stringify(response.errors, null, 2));
        throw new Error(`GraphQL query failed: ${JSON.stringify(response.errors)}`);
      }

      const orders = response.data?.orders?.edges?.map((edge: any) => edge.node) || [];
      console.log(`[ShopifyService] Found ${orders.length} orders from search.`);
      return orders;
    } catch (error) {
      console.error(`[ShopifyService] Error in searchOrders:`, error);
      throw error;
    }
  }


  /**
   * Search orders by order name or number
   */
  public async searchOrdersByNameOrNumber(query: string, limit: number = 5): Promise<ShopifyOrderNode[]> {
    // Clean the query - remove # and whitespace
    const cleanQuery = query.replace(/[#\\s]/g, '');
    const numericQuery = cleanQuery.replace(/\\D/g, ''); // Extract only digits
    const constructedQuery = `name:"${numericQuery}" OR name:"#${numericQuery}"`;
    return this.searchOrders(constructedQuery, limit);
  }

  /**
   * Search orders by customer email.
   */
  public async searchOrdersByCustomerEmail(email: string, limit: number = 5): Promise<ShopifyOrderNode[]> {
    const query = `email:'${email}'`;
    return this.searchOrders(query, limit);
  }

  /**
   * Search orders by customer's full name.
   * This is a bit tricky as Shopify's query language for customer name is not straightforward.
   * We will search for the name in the customer fields.
   */
  public async searchOrdersByCustomerName(name: string, limit: number = 5): Promise<ShopifyOrderNode[]> {
    const constructedQuery = `customer:${name}`;
    return this.searchOrders(constructedQuery, limit);
  }

  /**
   * Creates a customer with retry logic and race condition handling
   */
  private async createCustomerWithRetry(
    customerData: { email: string; firstName?: string; lastName?: string; phone?: string; tags?: string[]; note?: string; },
    maxRetries: number = 3
  ): Promise<{ success: boolean; customerId?: string; customer?: any; alreadyExists: boolean; error?: string; }> {
    const { email } = customerData;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check if customer exists first
        const existing = await this.findCustomerByEmail(email);
        if (existing) {
          return {
            success: true,
            alreadyExists: true,
            customerId: existing.id,
            customer: existing
          };
        }

        // Attempt to create
        const result = await this.createCustomerInternal(customerData);
        return result;
      } catch (error: any) {
        const isDuplicateError = error.message?.includes('taken') || error.message?.includes('already exists');

        if (isDuplicateError && attempt < maxRetries - 1) {
          // Race condition detected, wait with exponential backoff and retry
          const backoffMs = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
          console.log(`[ShopifyService] Race condition detected for ${email}, retrying after ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        if (attempt === maxRetries - 1) {
          console.error(`[ShopifyService] Failed to create customer after ${maxRetries} attempts:`, error);
          return { success: false, alreadyExists: false, error: error.message || 'Failed to create customer' };
        }
      }
    }

    return { success: false, alreadyExists: false, error: 'Max retries exceeded' };
  }

  /**
   * Helper to find customer by email
   */
  private async findCustomerByEmail(email: string): Promise<any | null> {
    const findCustomerQuery = `
        query($email: String!) {
            customers(query: $email, first: 1) {
                edges {
                    node {
                        id
                        firstName
                        lastName
                        email
                        phone
                    }
                }
            }
        }
    `;

    try {
      const response: any = await this.requestWithTimeout(findCustomerQuery, { variables: { email } });
      if (response.data?.customers?.edges?.length > 0) {
        return response.data.customers.edges[0].node;
      }
    } catch (error) {
      console.error(`[ShopifyService] Error finding customer by email:`, error);
    }
    return null;
  }

  /**
   * Internal method to create customer (without retry logic)
   */
  private async createCustomerInternal(customerData: { email: string; firstName?: string; lastName?: string; phone?: string; tags?: string[]; note?: string; }): Promise<{ success: boolean; customerId?: string; customer?: any; alreadyExists: boolean; error?: string; }> {
    const { email, firstName, lastName, phone, tags, note } = customerData;

    const createCustomerMutation = `
        mutation customerCreate($input: CustomerInput!) {
            customerCreate(input: $input) {
                customer {
                    id
                    firstName
                    lastName
                    email
                    phone
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const input: any = {
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      phone,
      tags,
      note,
    };

    const createResponse: any = await this.requestWithTimeout(createCustomerMutation, { variables: { input } });

    if (createResponse.data.customerCreate.userErrors.length > 0) {
      const errorMessages = createResponse.data.customerCreate.userErrors.map((e: any) => e.message).join(', ');
      throw new Error(errorMessages);
    }

    const newCustomer = createResponse.data.customerCreate.customer;
    console.log(`[ShopifyService] Customer created successfully with ID: ${newCustomer.id}`);
    return {
      success: true,
      alreadyExists: false,
      customerId: newCustomer.id,
      customer: newCustomer,
    };
  }

  public async createCustomer(customerData: { email: string; firstName?: string; lastName?: string; phone?: string; tags?: string[]; note?: string; }): Promise<{ success: boolean; customerId?: string; customer?: any; alreadyExists: boolean; error?: string; }> {
    return this.createCustomerWithRetry(customerData, 3);
  }

  /**
   * @deprecated Legacy method - kept for backward compatibility but uses new retry logic
   */
  public async createCustomerLegacy(customerData: { email: string; firstName?: string; lastName?: string; phone?: string; tags?: string[]; note?: string; }): Promise<{ success: boolean; customerId?: string; customer?: any; alreadyExists: boolean; error?: string; }> {
    const { email, firstName, lastName, phone, tags, note } = customerData;

    // 1. Check if customer exists by email
    const findCustomerQuery = `
        query($email: String!) {
            customers(query: $email, first: 1) {
                edges {
                    node {
                        id
                        firstName
                        lastName
                        email
                        phone
                    }
                }
            }
        }
    `;

    try {
        const findResponse: any = await this.requestWithTimeout(findCustomerQuery, { variables: { email: email } });
        if (findResponse.data.customers.edges.length > 0) {
            const existingCustomer = findResponse.data.customers.edges[0].node;
            console.log(`[ShopifyService] Customer with email ${email} already exists with ID: ${existingCustomer.id}`);
            return {
                success: true,
                alreadyExists: true,
                customerId: existingCustomer.id,
                customer: existingCustomer,
            };
        }
    } catch (error: any) {
        console.error(`[ShopifyService] Error checking for existing customer:`, error);
        return { success: false, alreadyExists: false, error: "Failed to check for existing customer." };
    }

    // 2. If not, create the customer
    const createCustomerMutation = `
        mutation customerCreate($input: CustomerInput!) {
            customerCreate(input: $input) {
                customer {
                    id
                    firstName
                    lastName
                    email
                    phone
                    tags
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const input = {
      email,
      firstName,
      lastName,
      phone,
      tags,
      note,
    };
    
    try {
        const createResponse: any = await this.requestWithTimeout(createCustomerMutation, { variables: { input } });

        if (createResponse.data.customerCreate.userErrors.length > 0) {
            const errorMessages = createResponse.data.customerCreate.userErrors.map((e: any) => e.message).join(', ');
            console.error(`[ShopifyService] Error creating customer: ${errorMessages}`);

            // Check if error is due to duplicate email (race condition)
            const isDuplicateError = errorMessages.toLowerCase().includes('email') &&
                                    (errorMessages.toLowerCase().includes('taken') ||
                                     errorMessages.toLowerCase().includes('already') ||
                                     errorMessages.toLowerCase().includes('exists'));

            if (isDuplicateError) {
                console.log(`[ShopifyService] Detected duplicate customer error (race condition). Re-fetching existing customer.`);
                // Re-fetch the customer that was created by the concurrent request
                try {
                    const refetchResponse: any = await this.requestWithTimeout(findCustomerQuery, { variables: { email: email } });
                    if (refetchResponse.data.customers.edges.length > 0) {
                        const existingCustomer = refetchResponse.data.customers.edges[0].node;
                        console.log(`[ShopifyService] Successfully recovered from race condition. Customer ID: ${existingCustomer.id}`);
                        return {
                            success: true,
                            alreadyExists: true,
                            customerId: existingCustomer.id,
                            customer: existingCustomer,
                        };
                    }
                } catch (refetchError) {
                    console.error(`[ShopifyService] Failed to re-fetch customer after race condition:`, refetchError);
                }
            }

            return { success: false, alreadyExists: false, error: errorMessages };
        }

        const newCustomer = createResponse.data.customerCreate.customer;
        console.log(`[ShopifyService] Successfully created new customer with ID: ${newCustomer.id}`);

        return {
            success: true,
            alreadyExists: false,
            customerId: newCustomer.id,
            customer: newCustomer,
        };

    } catch (error: any) {
        console.error(`[ShopifyService] An exception occurred while creating a customer:`, error);
        return { success: false, alreadyExists: false, error: 'An unexpected error occurred during customer creation.' };
    }
  }

  public async addCustomerAddress(
    customerId: string,
    addressData: {
      firstName: string;
      lastName: string;
      company?: string;
      address1: string;
      address2?: string;
      city: string;
      province?: string;
      country: string;
      zip: string;
      phone?: string;
    },
    setAsDefault: boolean = false
  ): Promise<{ success: boolean; addressId?: string; error?: string; }> {
    
    const mutation = `
      mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!) {
        customerAddressCreate(customerId: $customerId, address: $address) {
          customerAddress {
            id
            firstName
            lastName
            address1
            address2
            city
            province
            country
            zip
            phone
            company
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Ensure customerId is in GID format
    const gid = customerId.includes('gid://') ? customerId : `gid://shopify/Customer/${customerId}`;

    const variables = {
      customerId: gid,
      address: {
        firstName: addressData.firstName,
        lastName: addressData.lastName,
        company: addressData.company || '',
        address1: addressData.address1,
        address2: addressData.address2 || '',
        city: addressData.city,
        province: addressData.province || '',
        country: addressData.country,
        zip: addressData.zip,
        phone: addressData.phone || '',
      }
    };

    try {
      console.log(`[ShopifyService] Adding address to customer ${customerId}`);
      const response: any = await this.requestWithTimeout(mutation, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors adding customer address:', JSON.stringify(response.errors, null, 2));
        return { success: false, error: 'GraphQL query failed' };
      }

      const userErrors = response.data?.customerAddressCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        console.error(`[ShopifyService] UserErrors adding customer address: ${errorMessages}`);
        return { success: false, error: errorMessages };
      }

      const customerAddress = response.data?.customerAddressCreate?.customerAddress;
      if (!customerAddress) {
        return { success: false, error: 'No address data returned' };
      }

      console.log(`[ShopifyService] Customer address added successfully with ID: ${customerAddress.id}`);

      // If this should be the default address, set it as default
      if (setAsDefault) {
        await this.setCustomerDefaultAddress(gid, customerAddress.id);
      }

      return {
        success: true,
        addressId: customerAddress.id
      };

    } catch (error: any) {
      console.error('[ShopifyService] Error adding customer address:', error);
      return { success: false, error: error.message || 'An unexpected error occurred' };
    }
  }

  public async setCustomerDefaultAddress(
    customerId: string,
    addressId: string
  ): Promise<{ success: boolean; error?: string; }> {
    
    const mutation = `
      mutation customerDefaultAddressUpdate($customerId: ID!, $addressId: ID!) {
        customerDefaultAddressUpdate(customerId: $customerId, addressId: $addressId) {
          customer {
            id
            defaultAddress {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Ensure IDs are in GID format
    const customerGid = customerId.includes('gid://') ? customerId : `gid://shopify/Customer/${customerId}`;
    const addressGid = addressId.includes('gid://') ? addressId : `gid://shopify/MailingAddress/${addressId}`;

    const variables = {
      customerId: customerGid,
      addressId: addressGid
    };

    try {
      console.log(`[ShopifyService] Setting default address for customer ${customerId}`);
      const response: any = await this.requestWithTimeout(mutation, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors setting default address:', JSON.stringify(response.errors, null, 2));
        return { success: false, error: 'GraphQL query failed' };
      }

      const userErrors = response.data?.customerDefaultAddressUpdate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        console.error(`[ShopifyService] UserErrors setting default address: ${errorMessages}`);
        return { success: false, error: errorMessages };
      }

      console.log(`[ShopifyService] Default address set successfully for customer ${customerId}`);
      return { success: true };

    } catch (error: any) {
      console.error('[ShopifyService] Error setting default address:', error);
      return { success: false, error: error.message || 'An unexpected error occurred' };
    }
  }

  /**
   * Fetch a page of orders for synchronization purposes.
   */
  public async fetchOrdersPage(cursor?: string, pageSize: number = 50): Promise<{ orders: ShopifyOrderNode[]; nextCursor?: string; hasNextPage: boolean; }> {
    const query = `
      query FetchOrders($cursor: String, $first: Int!) {
        orders(first: $first, after: $cursor, sortKey: CREATED_AT, reverse: true) {
          edges {
            cursor
            node {
              id
              legacyResourceId
              name
              createdAt
              processedAt
              closedAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              customer {
                id
                legacyResourceId
                firstName
                lastName
                email
                phone
              }
              lineItems(first: 100) {
                edges {
                  node {
                    name
                    sku
                    quantity
                    originalUnitPriceSet { shopMoney { amount currencyCode } }
                    variant { id legacyResourceId title }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = { cursor: cursor || null, first: pageSize ?? 50 };

    // Use native fetch instead of deprecated SDK query method
    const response = await fetch(`https://${this.shopifyStoreDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.adminAccessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error('[ShopifyService] fetchOrdersPage errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const edges = result?.data?.orders?.edges || [];
    const pageInfo = result?.data?.orders?.pageInfo || {};

    const orders: ShopifyOrderNode[] = edges.map((edge: any) => ({
      ...edge.node,
      cursor: edge.cursor,
    }));

    return {
      orders,
      nextCursor: pageInfo.endCursor,
      hasNextPage: Boolean(pageInfo.hasNextPage),
    };
  }
}
