import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';
import type { AppDraftOrderInput, ShopifyDraftOrderGQLResponse, ShopifyMoney, DraftOrderLineItemInput, DraftOrderAddressInput } from '@/agents/quoteAssistant/quoteInterfaces';
import { mapCountryToCode, mapProvinceToCode } from '@/utils/addressUtils';

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

// Initialize Shopify API
if (!Config.shopify.storeUrl || !Config.shopify.adminAccessToken) {
  const errMsg = '[ShopifyService] Shopify store URL and Admin Access Token must be configured.';
  console.error(errMsg);
  throw new Error(errMsg);
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || "dummyAPIKeyIfNotUsedForAuth",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "dummySecretIfNotUsedForAuth",
  scopes: ['read_products', 'write_draft_orders', 'read_draft_orders', 'write_orders', 'read_orders', 'read_customers', 'write_customers'], // Added customer scopes
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
    
    console.log(`[ShopifyService] Initializing with store: ${Config.shopify.storeUrl}`);
    console.log(`[ShopifyService] Admin token exists: ${!!Config.shopify.adminAccessToken}`);
    console.log(`[ShopifyService] API version: ${Config.shopify.apiVersion}`);
    
    this.shopifyStoreDomain = Config.shopify.storeUrl.replace(/^https?:\/\//, '');
    this.adminAccessToken = Config.shopify.adminAccessToken;

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
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                displayName
                email
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

  public getDraftOrderAdminUrl(legacyResourceId: string): string {
    return `https://${this.shopifyStoreDomain}/admin/draft_orders/${legacyResourceId}`;
  }

  // New method to directly search Shopify products
  public async searchProducts(query: string): Promise<ShopifyProductNode[]> {
    const searchQuery = `
      query SearchProducts($query: String!, $first: Int!) {
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
              variants(first: 50) {
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
      console.error('[ShopifyService] Error during product search:', error.message);
      throw error;
    }
  }

  // --- New Draft Order Methods ---
  public async createDraftOrder(appInput: AppDraftOrderInput): Promise<ShopifyDraftOrderGQLResponse | null> {
    const { lineItems, customer, shopifyCustomerId, shippingAddress, billingAddress, note, email: emailForInvoice, tags, customAttributes } = appInput;

    const shopifyLineItems: ShopifyDraftOrderInput_LineItem[] = lineItems.map(item => ({
      variantId: `gid://shopify/ProductVariant/${item.numericVariantIdShopify}`,
      quantity: item.quantity,
      ...(item.title && { title: item.title }), // For custom items
      ...(item.price && { originalUnitPrice: item.price.toFixed(2) }), // For custom items or price overrides
    }));

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
      
      const response = await this.graphqlClient.request(mutation, { variables, retries: 2 });
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
      console.error('[ShopifyService] Error details:', {
        message: error.message,
        response: error.response ? JSON.stringify(error.response, null, 2) : 'No response',
        stack: error.stack
      });
      if (error.response && error.response.errors) { // Check for GraphQL error structure
        const messages = error.response.errors.map((e: any) => e.message).join(', ');
        console.error('GraphQL Errors:', messages);
        throw new Error(`Shopify API Error: ${messages}`);
      }
      throw error; // Re-throw other errors
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
      const response: any = await this.graphqlClient.request(mutation, { variables, retries: 1 });

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

  // Add new method for calculating shipping rates
  public async calculateShippingRates(
    lineItems: DraftOrderLineItemInput[],
    shippingAddress: DraftOrderAddressInput,
    note?: string
  ) {
    try {
      console.log('[ShopifyService] Calculating shipping rates for address:', JSON.stringify(shippingAddress, null, 2));
      
      // Convert line items to Shopify format
      const shopifyLineItems = lineItems.map(item => ({
        variantId: `gid://shopify/ProductVariant/${item.numericVariantIdShopify}`,
        quantity: item.quantity,
        ...(item.title && { title: item.title }),
        ...(item.price && { originalUnitPrice: item.price.toFixed(2) })
      }));

      // Get country and province codes
      const countryCode = mapCountryToCode(shippingAddress.country);
      if (!countryCode) {
        throw new Error(`Invalid country provided: ${shippingAddress.country}. Could not map to a valid code.`);
      }
      
      const provinceCode = mapProvinceToCode(shippingAddress.province, shippingAddress.country);

      const mutation = `
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
              subtotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalShippingPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalTaxSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const variables = {
        input: {
          lineItems: shopifyLineItems,
          shippingAddress: {
            address1: shippingAddress.address1,
            address2: shippingAddress.address2 || "",
            city: shippingAddress.city,
            company: shippingAddress.company || "",
            countryCode: countryCode,
            firstName: shippingAddress.firstName || "Temporary",
            lastName: shippingAddress.lastName || "Order",
            phone: shippingAddress.phone || "",
            provinceCode: provinceCode,
            zip: shippingAddress.zip
          },
          note: note || "Temporary calculation for shipping rates"
        }
      };

      // Calculate shipping rates using draftOrderCalculate
      const response: any = await this.graphqlClient.request(mutation, { variables, retries: 1 });

      // Check for GraphQL errors
      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      // Check for userErrors
      const userErrors = response.data?.draftOrderCalculate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error('[ShopifyService] User errors calculating shipping rates:', userErrors);
        throw new Error(userErrors.map((e: any) => e.message).join('; '));
      }

      const calculatedDraftOrder = response.data?.draftOrderCalculate?.calculatedDraftOrder;
      if (!calculatedDraftOrder) {
        throw new Error('No calculated draft order data returned');
      }

      console.log('[ShopifyService] Successfully calculated shipping rates');
      
      // Return the shipping rates and pricing info
      return {
        availableShippingRates: calculatedDraftOrder.availableShippingRates || [],
        subtotalPriceSet: calculatedDraftOrder.subtotalPriceSet,
        totalPriceSet: calculatedDraftOrder.totalPriceSet,
        totalShippingPriceSet: calculatedDraftOrder.totalShippingPriceSet,
        totalTaxSet: calculatedDraftOrder.totalTaxSet
      };

    } catch (error: any) {
      console.error('[ShopifyService] Error calculating shipping rates:', error);
      if (error.response && error.response.errors) {
        const messages = error.response.errors.map((e: any) => e.message).join(', ');
        throw new Error(`Shopify API Error (Shipping Calc): ${messages}`);
      }
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
      console.log(`[ShopifyService] Fetching draft order: ${id}`);
      const response: any = await this.graphqlClient.request(query, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      if (!response.data?.draftOrder) {
        console.error('[ShopifyService] Draft order not found, full response:', JSON.stringify(response, null, 2));
        throw new Error('Draft order not found');
      }

      const draftOrder = response.data.draftOrder;
      console.log('[ShopifyService] Draft order fetched successfully:', JSON.stringify(draftOrder, null, 2));
      return draftOrder;
    } catch (error: any) {
      console.error('[ShopifyService] Error fetching draft order:', error);
      if (error.response && error.response.errors) {
        const messages = error.response.errors.map((e: any) => e.message).join(', ');
        throw new Error(`Shopify API Error (Fetch Draft Order): ${messages}`);
      }
      throw error;
    }
  }

  /**
   * Search orders by order name or number
   */
  public async searchOrdersByNameOrNumber(query: string, limit: number = 5): Promise<any[]> {
    // Clean the query - remove # and whitespace
    const cleanQuery = query.replace(/[#\s]/g, '');
    const numericQuery = cleanQuery.replace(/\D/g, ''); // Extract only digits
    
    const orderQuery = `
      query SearchOrders($query: String!, $first: Int!) {
        orders(first: $first, query: $query) {
          edges {
            node {
              id
              legacyResourceId
              name
              email
              phone
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                email
                firstName
                lastName
                phone
                displayName
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
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
      console.log(`[ShopifyService] Searching orders for: "${query}" (cleaned: "${cleanQuery}", numeric: "${numericQuery}")`);
      
      // Try search patterns in order of specificity (most specific first)
      const searchQueries = [
        `name:#${cleanQuery}`,        // Exact match with #
        `name:${cleanQuery}`,         // Exact match without #
        `order_number:${numericQuery}` // Numeric order number match
      ];

      let allResults: any[] = [];
      
      for (const searchQuery of searchQueries) {
        try {
          console.log(`[ShopifyService] Trying search pattern: "${searchQuery}"`);
          const variables = { query: searchQuery, first: limit };
          const response: any = await this.graphqlClient.request(orderQuery, { variables, retries: 1 });

          if (response.errors) {
            console.warn(`[ShopifyService] GraphQL Errors for query "${searchQuery}":`, response.errors);
            continue;
          }

          const orders = response.data?.orders?.edges || [];
          console.log(`[ShopifyService] Found ${orders.length} orders with pattern "${searchQuery}"`);
          
          if (orders.length > 0) {
            const newResults = orders.map((edge: any) => edge.node);
            console.log(`[ShopifyService] Order names found:`, newResults.map((order: any) => order.name));
            
            // Add unique results only
            newResults.forEach((order: any) => {
              if (!allResults.find((existing: any) => existing.id === order.id)) {
                allResults.push(order);
              }
            });
            
            // If we found exact matches, don't try broader searches
            if (searchQuery.includes('name:#') || searchQuery.includes('name:') && !searchQuery.includes('*')) {
              console.log(`[ShopifyService] Found exact matches, stopping search here`);
              break;
            }
          }
        } catch (error) {
          console.warn(`[ShopifyService] Error with search query "${searchQuery}":`, error);
          continue;
        }
      }

      // Only try wildcard search if no exact matches were found
      if (allResults.length === 0) {
        console.log(`[ShopifyService] No exact matches found, trying wildcard search`);
        try {
          const wildcardQuery = `name:*${cleanQuery}*`;
          console.log(`[ShopifyService] Trying wildcard pattern: "${wildcardQuery}"`);
          
          const variables = { query: wildcardQuery, first: limit };
          const response: any = await this.graphqlClient.request(orderQuery, { variables, retries: 1 });

          if (!response.errors) {
            const orders = response.data?.orders?.edges || [];
            console.log(`[ShopifyService] Found ${orders.length} orders with wildcard pattern`);
            
            if (orders.length > 0) {
              const newResults = orders.map((edge: any) => edge.node);
              console.log(`[ShopifyService] Wildcard order names found:`, newResults.map((order: any) => order.name));
              
              newResults.forEach((order: any) => {
                if (!allResults.find((existing: any) => existing.id === order.id)) {
                  allResults.push(order);
                }
              });
            }
          }
        } catch (error) {
          console.warn(`[ShopifyService] Error with wildcard search:`, error);
        }
      }

      console.log(`[ShopifyService] Final results for query "${query}": ${allResults.length} orders found`);
      if (allResults.length > 0) {
        console.log(`[ShopifyService] Final order names:`, allResults.map(order => order.name));
      }
      
      return allResults.slice(0, limit); // Ensure we don't exceed the limit
    } catch (error: any) {
      console.error('[ShopifyService] Error searching orders by name/number:', error);
      throw error;
    }
  }

  /**
   * Search orders by customer email
   */
  public async searchOrdersByCustomerEmail(email: string, limit: number = 5): Promise<any[]> {
    const orderQuery = `
      query SearchOrdersByEmail($query: String!, $first: Int!) {
        orders(first: $first, query: $query) {
          edges {
            node {
              id
              legacyResourceId
              name
              email
              phone
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                email
                firstName
                lastName
                phone
                displayName
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
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
      console.log(`[ShopifyService] Searching orders by email: ${email}`);
      const variables = { query: `email:${email}`, first: limit };
      const response: any = await this.graphqlClient.request(orderQuery, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      const orders = response.data?.orders?.edges || [];
      console.log(`[ShopifyService] Found ${orders.length} orders for email: ${email}`);
      return orders.map((edge: any) => edge.node);
    } catch (error: any) {
      console.error('[ShopifyService] Error searching orders by email:', error);
      throw error;
    }
  }

  /**
   * Search orders by customer name
   */
  public async searchOrdersByCustomerName(name: string, limit: number = 5): Promise<any[]> {
    const orderQuery = `
      query SearchOrdersByCustomerName($query: String!, $first: Int!) {
        orders(first: $first, query: $query) {
          edges {
            node {
              id
              legacyResourceId
              name
              email
              phone
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                email
                firstName
                lastName
                phone
                displayName
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
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
      console.log(`[ShopifyService] Searching orders by customer name: ${name}`);
      
      // Try multiple search patterns for customer names
      const searchQueries = [
        `customer:"${name}"`,
        `customer:*${name}*`,
        `first_name:*${name}* OR last_name:*${name}*`
      ];

      let allResults: any[] = [];
      
      for (const searchQuery of searchQueries) {
        try {
          const variables = { query: searchQuery, first: limit };
          const response: any = await this.graphqlClient.request(orderQuery, { variables, retries: 1 });

          if (response.errors) {
            console.warn(`[ShopifyService] GraphQL Errors for query "${searchQuery}":`, response.errors);
            continue;
          }

          const orders = response.data?.orders?.edges || [];
          if (orders.length > 0) {
            const newResults = orders.map((edge: any) => edge.node);
            // Add unique results only
            newResults.forEach((order: any) => {
              if (!allResults.find(existing => existing.id === order.id)) {
                allResults.push(order);
              }
            });
          }
        } catch (error) {
          console.warn(`[ShopifyService] Error with search query "${searchQuery}":`, error);
          continue;
        }
      }

      console.log(`[ShopifyService] Found ${allResults.length} orders for customer name: ${name}`);
      return allResults.slice(0, limit); // Ensure we don't exceed the limit
    } catch (error: any) {
      console.error('[ShopifyService] Error searching orders by customer name:', error);
      throw error;
    }
  }

  /**
   * Helper method to construct Shopify Admin URL for an order
   */
  public getOrderAdminUrl(legacyResourceId: string): string {
    const storeUrl = Config.shopify.storeUrl;
    return `${storeUrl}/admin/orders/${legacyResourceId}`;
  }

  /**
   * Check if a customer exists in Shopify by email
   */
  public async checkCustomerExists(email: string): Promise<{ exists: boolean; customerId?: string; customer?: any }> {
    const query = `
      query checkCustomerExists($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              displayName
              defaultAddress {
                id
                firstName
                lastName
                address1
                address2
                city
                province
                provinceCode
                country
                countryCodeV2
                zip
                phone
                company
              }
            }
          }
        }
      }
    `;

    try {
      console.log(`[ShopifyService] Checking if customer exists: ${email}`);
      const variables = { query: `email:${email}` };
      const response: any = await this.graphqlClient.request(query, { variables, retries: 1 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors while checking customer:', response.errors);
        return { exists: false };
      }

      const customers = response.data?.customers?.edges || [];
      if (customers.length > 0) {
        const customer = customers[0].node;
        const customerId = customer.id.split('/').pop(); // Extract numeric ID from GID
        console.log(`[ShopifyService] Customer exists: ${email} (ID: ${customerId})`);
        return { 
          exists: true, 
          customerId, 
          customer 
        };
      }

      console.log(`[ShopifyService] Customer does not exist: ${email}`);
      return { exists: false };
    } catch (error: any) {
      console.error('[ShopifyService] Error checking customer existence:', error);
      return { exists: false };
    }
  }

  /**
   * Create a new customer in Shopify
   */
  public async createCustomer(customerData: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    tags?: string[];
    note?: string;
  }): Promise<{ success: boolean; customerId?: string; customer?: any; error?: string }> {
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
            displayName
            tags
            note
            defaultAddress {
              id
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              country
              countryCodeV2
              zip
              phone
              company
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Prepare input data
    const customerInput: any = {
      email: customerData.email,
    };

    if (customerData.firstName) customerInput.firstName = customerData.firstName;
    if (customerData.lastName) customerInput.lastName = customerData.lastName;
    if (customerData.phone) customerInput.phone = customerData.phone;
    if (customerData.tags && customerData.tags.length > 0) customerInput.tags = customerData.tags;
    if (customerData.note) customerInput.note = customerData.note;

    try {
      console.log(`[ShopifyService] Creating customer: ${customerData.email}`);
      const variables = { input: customerInput };
      const response: any = await this.graphqlClient.request(mutation, { variables, retries: 2 });

      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors while creating customer:', response.errors);
        return { success: false, error: 'GraphQL query failed' };
      }

      const userErrors = response.data?.customerCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => `${e.field?.join('.') || 'General'}: ${e.message}`).join('; ');
        console.error('[ShopifyService] User errors creating customer:', errorMessages);
        return { success: false, error: errorMessages };
      }

      if (!response.data?.customerCreate?.customer) {
        console.error('[ShopifyService] Customer creation failed, no customer returned');
        return { success: false, error: 'Customer creation failed' };
      }

      const customer = response.data.customerCreate.customer;
      const customerId = customer.id.split('/').pop(); // Extract numeric ID from GID
      
      console.log(`[ShopifyService] Customer created successfully: ${customerData.email} (ID: ${customerId})`);
      return { 
        success: true, 
        customerId, 
        customer 
      };

    } catch (error: any) {
      console.error('[ShopifyService] Error creating customer:', error);
      const errorMessage = error.response?.errors ? error.response.errors.map((e: any) => e.message).join(', ') : error.message;
      return { success: false, error: `Shopify API Error: ${errorMessage}` };
    }
  }

  /**
   * Create a customer if they don't already exist in Shopify
   * This is the main method to use for automatic customer creation
   */
  public async createCustomerIfNotExists(customerData: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    tags?: string[];
    note?: string;
  }): Promise<{ success: boolean; customerId?: string; customer?: any; alreadyExists?: boolean; error?: string }> {
    try {
      // First check if customer already exists
      const existingCustomer = await this.checkCustomerExists(customerData.email);
      
      if (existingCustomer.exists) {
        console.log(`[ShopifyService] Customer already exists: ${customerData.email}`);
        return {
          success: true,
          customerId: existingCustomer.customerId,
          customer: existingCustomer.customer,
          alreadyExists: true
        };
      }

      // Customer doesn't exist, create them
      const createResult = await this.createCustomer(customerData);
      
      if (createResult.success) {
        return {
          success: true,
          customerId: createResult.customerId,
          customer: createResult.customer,
          alreadyExists: false
        };
      } else {
        return {
          success: false,
          error: createResult.error
        };
      }

    } catch (error: any) {
      console.error(`[ShopifyService] Error in createCustomerIfNotExists for email ${customerData.email}:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
  }
}

// Create and export a singleton instance
export const shopifyService = new ShopifyService();