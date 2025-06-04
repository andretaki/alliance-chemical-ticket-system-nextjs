export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';
import { getOrderTrackingInfo } from '@/lib/shipstationService';
import { 
  searchShipStationCustomerByEmail, 
  searchShipStationCustomerByName, 
  convertShipStationToShopifyFormat 
} from '@/lib/shipstationCustomerService';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const queryParam = url.searchParams.get('query');
    const searchType = url.searchParams.get('type') || 'auto'; // auto, name, email, phone, order

    if (!queryParam || queryParam.trim().length < 3) {
      return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    const query = queryParam.trim();
    console.log(`Customer Search: Searching for "${query}" with type "${searchType}"`);

    // Initialize Shopify client
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
    const shopifySession = shopify.session.customAppSession(shopifyStoreDomain);
    shopifySession.accessToken = adminAccessToken;

    // Create GraphQL client
    const graphqlClient = new shopify.clients.Graphql({ session: shopifySession });

    let customers: any[] = [];
    let searchMethod = '';

    // Detect search type automatically if set to 'auto'
    const detectedSearchType = detectSearchType(query);
    const finalSearchType = searchType === 'auto' ? detectedSearchType : searchType;

    console.log(`Customer Search: Using search type "${finalSearchType}" for query "${query}"`);

    if (finalSearchType === 'order') {
      // Search by order number - first try ShipStation, then Shopify orders
      const result = await searchByOrderNumber(query, graphqlClient);
      customers = result.customers;
      searchMethod = result.method;
    } else if (finalSearchType === 'phone') {
      // Search by phone number
      const result = await searchByPhone(query, graphqlClient);
      customers = result.customers;
      searchMethod = result.method;
    } else {
      // Default search by email/name - now with ShipStation fallback
      const result = await searchByEmailOrName(query, graphqlClient);
      customers = result.customers;
      searchMethod = result.method;
    }

    console.log(`Customer Search: Found ${customers.length} customers using method: ${searchMethod}`);

    return NextResponse.json({ 
      customers, 
      searchMethod,
      searchType: finalSearchType,
      query: query
    });
  } catch (error: any) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search customers' },
      { status: 500 }
    );
  }
}

// Helper function to detect what type of search this might be
function detectSearchType(query: string): string {
  // Clean the query
  const cleanQuery = query.trim();
  
  // Order number patterns
  if (/^\d{4,}$/.test(cleanQuery) || // Pure numeric (4+ digits)
      /^#?\d{4,}$/.test(cleanQuery) || // With optional #
      /^\d{3}-\d{7}-\d{7}$/.test(cleanQuery) || // Amazon pattern
      /order\s*#?\s*\d+/i.test(cleanQuery)) { // Contains "order"
    return 'order';
  }
  
  // Phone number patterns - make this much more natural
  // Count total digits in the string
  const digitCount = (cleanQuery.match(/\d/g) || []).length;
  
  // If it has 10+ digits and looks like a phone number, treat as phone
  if (digitCount >= 10 && 
      /[\d\s\-\(\)\.]{8,}/.test(cleanQuery) && // Has phone-like characters (removed + requirement)
      !/[a-zA-Z]/.test(cleanQuery)) { // No letters (distinguishes from email/name)
    return 'phone';
  }
  
  // Also detect shorter phone patterns that are clearly phones
  if (/^\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(cleanQuery)) { // US phone format
    return 'phone';
  }
  
  // Email pattern
  if (/@/.test(cleanQuery)) {
    return 'email';
  }
  
  // Default to name search
  return 'name';
}

// Enhanced search by order number
async function searchByOrderNumber(orderQuery: string, graphqlClient: any) {
  let customers: any[] = [];
  let method = 'order_number_not_found';

  // Clean the order number
  const cleanOrderNumber = orderQuery.replace(/[#\s]/g, '');
  
  try {
    // First, try ShipStation to get customer email from order
    console.log(`Customer Search: Checking ShipStation for order ${cleanOrderNumber}`);
    const shipstationOrder = await getOrderTrackingInfo(cleanOrderNumber);
    
    if (shipstationOrder?.found) {
      // Try to find Shopify order by order number to get customer info
      const shopifyOrderQuery = `
        query SearchOrderByNumber($query: String!) {
          orders(first: 10, query: $query) {
            edges {
              node {
                id
                name
                email
                phone
                customer {
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
                    company
                    address1
                    address2
                    city
                    province
                    provinceCode
                    country
                    countryCodeV2
                    zip
                    phone
                  }
                }
              }
            }
          }
        }
      `;

      const orderResponse = await graphqlClient.request(shopifyOrderQuery, {
        variables: { query: `name:${cleanOrderNumber} OR name:#${cleanOrderNumber}` }
      });

      if (orderResponse?.data?.orders?.edges?.length > 0) {
        const order = orderResponse.data.orders.edges[0].node;
        if (order.customer) {
          customers = [processShopifyCustomer(order.customer)];
          method = 'shopify_order_lookup';
          console.log(`Customer Search: Found customer via Shopify order lookup`);
        }
      }
    }

    // If no customer found via ShipStation/Shopify order lookup, try searching order notes/tags
    if (customers.length === 0) {
      const customerSearchQuery = `
        query SearchCustomersByTag($query: String!) {
          customers(first: 20, query: $query) {
            edges {
              node {
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
                  company
                  address1
                  address2
                  city
                  province
                  provinceCode
                  country
                  countryCodeV2
                  zip
                  phone
                }
              }
            }
          }
        }
      `;

      // Search for customers that might have this order number in tags or notes
      const tagResponse = await graphqlClient.request(customerSearchQuery, {
        variables: { query: `tag:*${cleanOrderNumber}* OR note:*${cleanOrderNumber}*` }
      });

      if (tagResponse?.data?.customers?.edges?.length > 0) {
        customers = tagResponse.data.customers.edges.map((edge: any) => processShopifyCustomer(edge.node));
        method = 'customer_tags_notes';
        console.log(`Customer Search: Found ${customers.length} customers via tags/notes search`);
      }
    }

  } catch (error) {
    console.error('Error in order number search:', error);
  }

  return { customers, method };
}

// Enhanced search by phone number
async function searchByPhone(phoneQuery: string, graphqlClient: any) {
  let customers: any[] = [];
  let method = 'phone_not_found';

  // Clean the phone number - remove all non-digit characters
  const cleanPhone = phoneQuery.replace(/\D/g, '');
  
  // Try different phone number formats
  const phoneVariations = generatePhoneVariations(cleanPhone);
  
  try {
    for (const phoneVariation of phoneVariations) {
      const phoneSearchQuery = `
        query SearchCustomersByPhone($query: String!) {
          customers(first: 10, query: $query) {
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
                  company
                  address1
                  address2
                  city
                  province
                  provinceCode
                  country
                  countryCodeV2
                  zip
                  phone
                }
              }
            }
          }
        }
      `;

      const response = await graphqlClient.request(phoneSearchQuery, {
        variables: { query: `phone:*${phoneVariation}*` }
      });

      if (response?.data?.customers?.edges?.length > 0) {
        customers = response.data.customers.edges.map((edge: any) => processShopifyCustomer(edge.node));
        method = `phone_found_${phoneVariation}`;
        console.log(`Customer Search: Found ${customers.length} customers via phone search (${phoneVariation})`);
        break; // Stop at first successful match
      }
    }
  } catch (error) {
    console.error('Error in phone search:', error);
  }

  return { customers, method };
}

// Enhanced email/name search with ShipStation fallback
async function searchByEmailOrName(query: string, graphqlClient: any) {
  let customers: any[] = [];
  let method = 'email_name_not_found';

  try {
    // First try Shopify search
    const shopifyResult = await searchShopifyByEmailOrName(query, graphqlClient);
    customers = shopifyResult.customers;
    method = shopifyResult.method;

    // If no customers found in Shopify, try ShipStation as fallback
    if (customers.length === 0) {
      console.log(`Customer Search: No results in Shopify, trying ShipStation for query: ${query}`);
      
      const isEmail = query.includes('@');
      
      if (isEmail) {
        // Search ShipStation by email
        console.log(`Customer Search: Searching ShipStation by email: ${query}`);
        const shipStationCustomer = await searchShipStationCustomerByEmail(query);
        
        if (shipStationCustomer) {
          const convertedCustomer = convertShipStationToShopifyFormat(shipStationCustomer);
          customers = [convertedCustomer];
          method = 'shipstation_email_found';
          console.log(`Customer Search: Found customer in ShipStation by email`);
        }
      } else {
        // Search ShipStation by name
        console.log(`Customer Search: Searching ShipStation by name: ${query}`);
        const shipStationCustomers = await searchShipStationCustomerByName(query);
        
        if (shipStationCustomers.length > 0) {
          customers = shipStationCustomers.map(convertShipStationToShopifyFormat);
          method = 'shipstation_name_found';
          console.log(`Customer Search: Found ${customers.length} customers in ShipStation by name`);
        }
      }
    }

  } catch (error) {
    console.error('Error in email/name search:', error);
  }

  return { customers, method };
}

// Original Shopify-only email/name search with enhancements
async function searchShopifyByEmailOrName(query: string, graphqlClient: any) {
  let customers: any[] = [];
  let method = 'email_name_not_found';

  try {
    // Enhanced search query to include partial matches and company search
    const searchQuery = `
      query SearchCustomers($query: String!) {
        customers(first: 10, query: $query) {
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
                company
                address1
                address2
                city
                province
                provinceCode
                country
                countryCodeV2
                zip
                phone
              }
            }
          }
        }
      }
    `;

    // Try multiple search variations
    const searchVariations = [
      query, // Original query
      `email:*${query}*`, // Email contains
      `first_name:*${query}* OR last_name:*${query}*`, // Name contains
      `${query.toLowerCase()}`, // Lowercase
      `${query.toUpperCase()}`, // Uppercase
    ];

    for (const searchVariation of searchVariations) {
      const response = await graphqlClient.request(searchQuery, {
        variables: { query: searchVariation }
      });

      if (response?.data?.customers?.edges?.length > 0) {
        customers = response.data.customers.edges.map((edge: any) => processShopifyCustomer(edge.node));
        method = `shopify_email_name_found_${searchVariation === query ? 'exact' : 'variation'}`;
        console.log(`Customer Search: Found ${customers.length} customers via Shopify email/name search`);
        break; // Stop at first successful match
      }
    }
  } catch (error) {
    console.error('Error in Shopify email/name search:', error);
  }

  return { customers, method };
}

// Helper function to generate phone number variations
function generatePhoneVariations(cleanPhone: string): string[] {
  const variations = [cleanPhone];
  
  if (cleanPhone.length >= 10) {
    // Add US format variations - NO + signs required!
    const last10 = cleanPhone.slice(-10);
    const areaCode = last10.slice(0, 3);
    const exchange = last10.slice(3, 6);
    const number = last10.slice(6, 10);
    
    variations.push(
      last10, // Just 10 digits
      `1${last10}`, // With country code (no +)
      `${areaCode}-${exchange}-${number}`, // Dashed format
      `(${areaCode}) ${exchange}-${number}`, // Formatted
      `${areaCode}.${exchange}.${number}`, // Dotted
      `${areaCode} ${exchange} ${number}`, // Spaced
      `${areaCode}${exchange}${number}`, // All together
      `${areaCode}-${exchange}${number}`, // Partial dash
      `${areaCode} ${exchange}-${number}`, // Mixed format
    );
  }
  
  // Also try partial matches for shorter numbers
  if (cleanPhone.length >= 7) {
    const last7 = cleanPhone.slice(-7);
    variations.push(last7);
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

// Helper function to process Shopify customer data
function processShopifyCustomer(customer: any) {
  return {
    id: customer.id.split('/').pop(), // Extract ID from GraphQL ID
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    company: '',  // Shopify customer object doesn't have a company field at the top level
    source: 'shopify', // Add source indicator
    defaultAddress: customer.defaultAddress ? {
      firstName: customer.defaultAddress.firstName,
      lastName: customer.defaultAddress.lastName,
      address1: customer.defaultAddress.address1,
      address2: customer.defaultAddress.address2,
      city: customer.defaultAddress.city,
      province: customer.defaultAddress.province || customer.defaultAddress.provinceCode,
      country: customer.defaultAddress.country || customer.defaultAddress.countryCodeV2,
      zip: customer.defaultAddress.zip,
      company: customer.defaultAddress.company,
      phone: customer.defaultAddress.phone
    } : undefined
  };
} 