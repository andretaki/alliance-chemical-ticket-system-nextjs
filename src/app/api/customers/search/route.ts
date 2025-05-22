import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Shopify, ApiVersion, LATEST_API_VERSION, shopifyApi, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameter
    const url = new URL(req.url);
    const queryParam = url.searchParams.get('query');

    if (!queryParam || queryParam.trim().length < 3) {
      return NextResponse.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

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

    // Create GraphQL query to search for customers
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

    // Execute the GraphQL query
    const response: any = await graphqlClient.request(
      searchQuery,
      {
        variables: { 
          query: queryParam
        },
        retries: 2
      }
    );

    // Process response data
    if (!response?.data?.customers?.edges) {
      return NextResponse.json({ customers: [] });
    }

    const customers = response.data.customers.edges.map((edge: any) => {
      const customer = edge.node;
      
      return {
        id: customer.id.split('/').pop(), // Extract ID from GraphQL ID
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        company: '',  // Shopify customer object doesn't have a company field at the top level
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
    });

    return NextResponse.json({ customers });
  } catch (error: any) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search customers' },
      { status: 500 }
    );
  }
} 