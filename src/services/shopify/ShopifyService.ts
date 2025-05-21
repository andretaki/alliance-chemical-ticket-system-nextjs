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
        userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
    draftOrderInvoiceSend?: {
        draftOrder?: { id: string; invoiceUrl?: string; status: string; };
        userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
    draftOrderCalculate?: { // For shipping rate calculation
        calculatedDraftOrder: {
            id?: string; // May not be present if it's a dry run without saving
            availableShippingRates: Array<{
                handle: string;
                title: string;
                price: ShopifyMoney;
            }>;
            shippingLine?: { // The selected or default shipping line
                handle?: string;
                priceSet?: { shopMoney: ShopifyMoney };
                title?: string;
            };
            subtotalPriceSet?: { shopMoney: ShopifyMoney };
            totalPriceSet?: { shopMoney: ShopifyMoney };
            totalShippingPriceSet?: { shopMoney: ShopifyMoney };
            totalTaxSet?: { shopMoney: ShopifyMoney };
        };
        userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
    calculateShippingRates?: {
      calculatedShippingRates: Array<{
        title: string;
        handle: string;
        price: ShopifyMoney;
      }>;
      userErrors: Array<{ field: string[]; message: string; code?: string }>;
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
  scopes: ['read_products', 'write_draft_orders', 'read_draft_orders', 'write_orders', 'read_orders'], // Added draft order scopes
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
          console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
          throw new Error('GraphQL query failed');
        }

        const productEdges = response.data?.products?.edges || [];
        if (productEdges.length === 0 && !response.data?.products?.pageInfo?.hasNextPage) {
          hasNextPage = false;
          console.log('[ShopifyService] No more products on this page and no next page.');
          break;
        }

        products.push(...productEdges.map((edge: any) => edge.node));

        const pageInfo: any = response.data?.products?.pageInfo;
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
    const { lineItems, customer, shippingAddress, note, email, tags } = appInput;

    const shopifyLineItems: ShopifyDraftOrderInput_LineItem[] = lineItems.map(item => ({
      variantId: `gid://shopify/ProductVariant/${item.numericVariantIdShopify}`,
      quantity: item.quantity,
      ...(item.title && { title: item.title }), // For custom items
      ...(item.price && { originalUnitPrice: item.price.toFixed(2) }), // For custom items or price overrides
    }));

    let shopifyShippingAddress: ShopifyDraftOrderInput_Address | undefined = undefined;
    if (shippingAddress) {
      shopifyShippingAddress = {
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
       if (shippingAddress.country && !shopifyShippingAddress.countryCode) {
        throw new Error(`Invalid country provided: ${shippingAddress.country}. Could not map to a valid code.`);
      }
      if (shippingAddress.province && shippingAddress.country && !shopifyShippingAddress.provinceCode) {
        // Only error if province was provided but couldn't be mapped, and country code was valid
        if (shopifyShippingAddress.countryCode) {
          throw new Error(`Invalid province '${shippingAddress.province}' for country '${shippingAddress.country}'. Could not map to a valid code.`);
        }
      }
    }


    const shopifyCustomer: ShopifyDraftOrderInput_Customer | undefined = customer ? {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    } : undefined;

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
            customer { id email firstName lastName phone companyName { name } defaultAddress { id } }
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
              priceSet { shopMoney { amount currencyCode } }
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
            note
          }
          userErrors { field message code }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: shopifyLineItems,
        ...(shopifyCustomer && { customer: shopifyCustomer }),
        ...(shopifyShippingAddress && { shippingAddress: shopifyShippingAddress }),
        ...(note && { note }),
        ...(email && { email }), // Email to send Shopify invoice to if draft order is completed
        ...(tags && tags.length > 0 && { tags }),
      },
    };

    try {
      console.log('[ShopifyService] Creating draft order with variables:', JSON.stringify(variables, null, 2));
      const response = await this.graphqlClient.request(mutation, { variables, retries: 2 });

      // Check for GraphQL errors
      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      // Check for userErrors in the response
      const userErrors = response.data?.draftOrderCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error('[ShopifyService] UserErrors creating draft order:', userErrors);
        throw new Error(userErrors.map((e: any) => `${e.field?.join(', ') || 'General'}: ${e.message} (Code: ${e.code || 'N/A'})`).join('; '));
      }

      if (!response.data?.draftOrderCreate?.draftOrder) {
        console.error('[ShopifyService] Draft order not created, response:', response);
        throw new Error('Draft order creation failed, no draft order returned.');
      }

      const draftOrder = response.data.draftOrderCreate.draftOrder;
      console.log('[ShopifyService] Draft order created successfully:', draftOrder.id, draftOrder.name);
      return draftOrder;

    } catch (error: any) {
      console.error('[ShopifyService] Error creating draft order:', error);
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
                  userErrors {
                      field
                      message
                  }
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

  public async calculateDraftOrderShipping(draftOrderId: string, shippingAddress: ShopifyDraftOrderInput_Address): Promise<any> {
    const mutation = `
      mutation draftOrderCalculate($input: DraftOrderInput!) {
        draftOrderCalculate(input: $input) {
          calculatedDraftOrder {
            id
            availableShippingRates {
              handle
              title
              price {
                amount
                currencyCode
              }
            }
            shippingLine { # This will be populated if a default or previously selected rate exists
              handle
              priceSet { shopMoney { amount currencyCode } }
              title
            }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }

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
        id: draftOrderId, // GID of the existing draft order
        shippingAddress: {
            ...shippingAddress,
            countryCode: mapCountryToCode(shippingAddress.countryCode), // map full name to code
            provinceCode: mapProvinceToCode(shippingAddress.provinceCode, shippingAddress.countryCode),
        },
      },
    };

    try {
      console.log(`[ShopifyService] Calculating shipping for draft order ${draftOrderId} with address:`, JSON.stringify(variables.input.shippingAddress));
      const response: any = await this.graphqlClient.request(mutation, { variables, retries: 1 });

      // Check for GraphQL errors
      if (response.errors) {
        console.error('[ShopifyService] GraphQL Errors:', JSON.stringify(response.errors, null, 2));
        throw new Error('GraphQL query failed');
      }

      // Check for userErrors
      const userErrors = response.data?.draftOrderCalculate?.userErrors;
      if (userErrors && userErrors.length) {
        console.error('[ShopifyService] UserErrors calculating draft order shipping:', userErrors);
        throw new Error(userErrors.map((e: any) => e.message).join('; '));
      }

      if (!response.data?.draftOrderCalculate?.calculatedDraftOrder) {
        throw new Error('No calculated draft order data returned.');
      }
      
      console.log('[ShopifyService] Shipping calculation result:', response.data.draftOrderCalculate.calculatedDraftOrder);
      return response.data.draftOrderCalculate.calculatedDraftOrder;

    } catch (error: any) {
      console.error('[ShopifyService] Error calculating draft order shipping:', error);
      if (error.response && error.response.errors) {
        const messages = error.response.errors.map((e: any) => e.message).join(', ');
        throw new Error(`Shopify API Error (Shipping Calc): ${messages}`);
      }
      throw error;
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
} 