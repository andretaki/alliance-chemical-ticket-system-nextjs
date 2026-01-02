export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { customerRepository } from '@/repositories/CustomerRepository';
import { shopifyApi, ApiVersion, LATEST_API_VERSION, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Config } from '@/config/appConfig';
import { getOrderTrackingInfo } from '@/lib/shipstationService';
import { env } from '@/lib/env';
import {
  searchShipStationCustomerByEmail,
  searchShipStationCustomerByName,
  convertShipStationToShopifyFormat,
} from '@/lib/shipstationCustomerService';

// -----------------------------------------------------------------------------
// Request validation
// -----------------------------------------------------------------------------
const SearchQuerySchema = z.object({
  query: z.string().min(3, 'Query must be at least 3 characters'),
  type: z.enum(['auto', 'name', 'email', 'phone', 'order']).default('auto'),
  source: z.enum(['all', 'unified', 'external']).default('all'),
  limit: z.coerce.number().min(1).max(50).default(20),
});

// -----------------------------------------------------------------------------
// Response types
// -----------------------------------------------------------------------------
interface UnifiedCustomer {
  id: number;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  isVip: boolean;
  source: 'unified';
  linkedProviders: string[];
}

interface ExternalCustomer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string;
  source: 'shopify' | 'shipstation';
  existsInUnified: boolean;
  unifiedCustomerId?: number;
  defaultAddress?: {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    company: string | null;
    phone: string | null;
  };
}

interface SearchResponse {
  unified: UnifiedCustomer[];
  external: ExternalCustomer[];
  searchType: string;
  query: string;
  meta: {
    unifiedCount: number;
    externalCount: number;
    externalAlreadyLinked: number;
  };
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Auth check
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  // Parse and validate query params
  const url = new URL(req.url);
  const parsed = SearchQuerySchema.safeParse({
    query: url.searchParams.get('query'),
    type: url.searchParams.get('type') || 'auto',
    source: url.searchParams.get('source') || 'all',
    limit: url.searchParams.get('limit') || '20',
  });

  if (!parsed.success) {
    return apiError('invalid_request', 'Invalid search parameters', parsed.error.flatten(), { status: 400 });
  }

  const { query, type, source, limit } = parsed.data;
  console.log(`[customer-search] Query="${query}" type="${type}" source="${source}"`);

  try {
    const response: SearchResponse = {
      unified: [],
      external: [],
      searchType: type,
      query,
      meta: { unifiedCount: 0, externalCount: 0, externalAlreadyLinked: 0 },
    };

    // Step 1: Search unified customer database (unless source=external)
    if (source !== 'external') {
      const unifiedResult = await customerRepository.searchCustomers(query, {
        limit,
        type: type === 'order' ? 'auto' : type,
      });

      response.unified = unifiedResult.customers.map(c => ({
        id: c.id,
        primaryEmail: c.primaryEmail,
        primaryPhone: c.primaryPhone,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        isVip: c.isVip,
        source: 'unified' as const,
        linkedProviders: c.linkedProviders,
      }));
      response.searchType = unifiedResult.searchType;
      response.meta.unifiedCount = unifiedResult.totalCount;
    }

    // Step 2: Search external sources if:
    // - source=all or source=external
    // - AND (no unified results OR source=external)
    const shouldSearchExternal = source === 'external' || (source === 'all' && response.unified.length === 0);

    if (shouldSearchExternal) {
      const externalResults = await searchExternalSources(query, type);

      // Deduplicate: check which external customers already exist in our DB
      const emails = externalResults
        .map(c => c.email)
        .filter((e): e is string => !!e);
      const phones = externalResults
        .map(c => c.phone)
        .filter((p): p is string => !!p);

      const existingMap = await customerRepository.findExistingByEmailsOrPhones(emails, phones);

      response.external = externalResults.map(c => {
        const emailKey = c.email?.toLowerCase();
        const phoneKey = c.phone?.replace(/\D/g, '').slice(-10);
        const existingId = (emailKey && existingMap.get(emailKey)) ||
                          (phoneKey && existingMap.get(phoneKey)) ||
                          undefined;

        return {
          ...c,
          existsInUnified: !!existingId,
          unifiedCustomerId: existingId || undefined,
        };
      });

      response.meta.externalCount = response.external.length;
      response.meta.externalAlreadyLinked = response.external.filter(c => c.existsInUnified).length;
    }

    console.log(`[customer-search] Found unified=${response.meta.unifiedCount} external=${response.meta.externalCount} (${response.meta.externalAlreadyLinked} already linked)`);

    return apiSuccess(response);
  } catch (err) {
    console.error('[customer-search] Error:', err);
    return apiError('server_error', 'Failed to search customers', undefined, { status: 500 });
  }
}

// -----------------------------------------------------------------------------
// External source search (Shopify + ShipStation)
// -----------------------------------------------------------------------------
async function searchExternalSources(query: string, searchType: string): Promise<ExternalCustomer[]> {
  const results: ExternalCustomer[] = [];

  try {
    // Initialize Shopify client
    const shopify = shopifyApi({
      apiKey: env.SHOPIFY_API_KEY || 'dummyAPIKeyIfNotUsedForAuth',
      apiSecretKey: env.SHOPIFY_API_SECRET || 'dummySecretIfNotUsedForAuth',
      scopes: ['read_customers', 'read_orders'],
      hostName: Config.shopify.storeUrl.replace(/^https?:\/\//, ''),
      apiVersion: Config.shopify.apiVersion as ApiVersion || LATEST_API_VERSION,
      isEmbeddedApp: false,
      logger: { level: LogSeverity.Warning },
    });

    const shopifyStoreDomain = Config.shopify.storeUrl.replace(/^https?:\/\//, '');
    const shopifySession = shopify.session.customAppSession(shopifyStoreDomain);
    shopifySession.accessToken = Config.shopify.adminAccessToken;
    const graphqlClient = new shopify.clients.Graphql({ session: shopifySession });

    // Detect search type if auto
    const detectedType = searchType === 'auto' ? detectSearchType(query) : searchType;

    if (detectedType === 'order') {
      const orderResults = await searchByOrderNumber(query, graphqlClient);
      results.push(...orderResults);
    } else if (detectedType === 'phone') {
      const phoneResults = await searchByPhone(query, graphqlClient);
      results.push(...phoneResults);
    } else {
      // Email or name search
      const nameEmailResults = await searchByEmailOrName(query, graphqlClient);
      results.push(...nameEmailResults);
    }
  } catch (err) {
    console.error('[customer-search] External search error:', err);
  }

  return results;
}

// -----------------------------------------------------------------------------
// Search type detection
// -----------------------------------------------------------------------------
function detectSearchType(query: string): string {
  const cleanQuery = query.trim();

  // Order number patterns
  if (/^\d{4,}$/.test(cleanQuery) ||
      /^#?\d{4,}$/.test(cleanQuery) ||
      /^\d{3}-\d{7}-\d{7}$/.test(cleanQuery) ||
      /order\s*#?\s*\d+/i.test(cleanQuery)) {
    return 'order';
  }

  // Phone number patterns
  const digitCount = (cleanQuery.match(/\d/g) || []).length;
  if (digitCount >= 10 &&
      /[\d\s\-\(\)\.]{8,}/.test(cleanQuery) &&
      !/[a-zA-Z]/.test(cleanQuery)) {
    return 'phone';
  }
  if (/^\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(cleanQuery)) {
    return 'phone';
  }

  // Email pattern
  if (/@/.test(cleanQuery)) {
    return 'email';
  }

  return 'name';
}

// -----------------------------------------------------------------------------
// Shopify search functions
// -----------------------------------------------------------------------------
async function searchByOrderNumber(orderQuery: string, graphqlClient: any): Promise<ExternalCustomer[]> {
  const cleanOrderNumber = orderQuery.replace(/[#\s]/g, '');

  try {
    // First check ShipStation for the order
    const shipstationOrder = await getOrderTrackingInfo(cleanOrderNumber);

    if (shipstationOrder?.found) {
      // Try to find the customer via Shopify order
      const orderResponse = await graphqlClient.request(`
        query SearchOrderByNumber($query: String!) {
          orders(first: 5, query: $query) {
            edges {
              node {
                customer {
                  id
                  email
                  firstName
                  lastName
                  phone
                  defaultAddress {
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                  }
                }
              }
            }
          }
        }
      `, { variables: { query: `name:${cleanOrderNumber} OR name:#${cleanOrderNumber}` } });

      const edges = orderResponse?.data?.orders?.edges || [];
      for (const edge of edges) {
        if (edge.node?.customer) {
          return [processShopifyCustomer(edge.node.customer)];
        }
      }
    }
  } catch (err) {
    console.error('[customer-search] Order search error:', err);
  }

  return [];
}

async function searchByPhone(phoneQuery: string, graphqlClient: any): Promise<ExternalCustomer[]> {
  const cleanPhone = phoneQuery.replace(/\D/g, '');
  const phoneVariations = generatePhoneVariations(cleanPhone);

  for (const variation of phoneVariations) {
    try {
      const response = await graphqlClient.request(`
        query SearchCustomersByPhone($query: String!) {
          customers(first: 10, query: $query) {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                defaultAddress {
                  firstName
                  lastName
                  company
                  address1
                  address2
                  city
                  province
                  country
                  zip
                  phone
                }
              }
            }
          }
        }
      `, { variables: { query: `phone:*${variation}*` } });

      const edges = response?.data?.customers?.edges || [];
      if (edges.length > 0) {
        return edges.map((e: any) => processShopifyCustomer(e.node));
      }
    } catch (err) {
      console.error('[customer-search] Phone search error:', err);
    }
  }

  return [];
}

async function searchByEmailOrName(query: string, graphqlClient: any): Promise<ExternalCustomer[]> {
  // Try Shopify first
  const searchVariations = [
    query,
    `email:*${query}*`,
    `first_name:*${query}* OR last_name:*${query}*`,
  ];

  for (const searchVariation of searchVariations) {
    try {
      const response = await graphqlClient.request(`
        query SearchCustomers($query: String!) {
          customers(first: 10, query: $query) {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                defaultAddress {
                  firstName
                  lastName
                  company
                  address1
                  address2
                  city
                  province
                  country
                  zip
                  phone
                }
              }
            }
          }
        }
      `, { variables: { query: searchVariation } });

      const edges = response?.data?.customers?.edges || [];
      if (edges.length > 0) {
        return edges.map((e: any) => processShopifyCustomer(e.node));
      }
    } catch (err) {
      console.error('[customer-search] Email/name search error:', err);
    }
  }

  // Fallback to ShipStation
  try {
    const isEmail = query.includes('@');

    if (isEmail) {
      const ssCustomer = await searchShipStationCustomerByEmail(query);
      if (ssCustomer) {
        const converted = convertShipStationToShopifyFormat(ssCustomer);
        return [convertToExternalCustomer(converted, 'shipstation')];
      }
    } else {
      const ssCustomers = await searchShipStationCustomerByName(query);
      return ssCustomers.map(ss => {
        const converted = convertShipStationToShopifyFormat(ss);
        return convertToExternalCustomer(converted, 'shipstation');
      });
    }
  } catch (err) {
    console.error('[customer-search] ShipStation fallback error:', err);
  }

  return [];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function processShopifyCustomer(customer: any): ExternalCustomer {
  return convertToExternalCustomer({
    id: customer.id.split('/').pop(),
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    defaultAddress: customer.defaultAddress,
  }, 'shopify');
}

function convertToExternalCustomer(
  customer: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    defaultAddress?: {
      firstName?: string | null;
      lastName?: string | null;
      address1?: string | null;
      address2?: string | null;
      city?: string | null;
      province?: string | null;
      country?: string | null;
      zip?: string | null;
      company?: string | null;
      phone?: string | null;
    } | null;
  },
  source: 'shopify' | 'shipstation'
): ExternalCustomer {
  return {
    id: customer.id,
    email: customer.email ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    phone: customer.phone ?? null,
    company: customer.defaultAddress?.company || '',
    source,
    existsInUnified: false,
    defaultAddress: customer.defaultAddress ? {
      firstName: customer.defaultAddress.firstName ?? null,
      lastName: customer.defaultAddress.lastName ?? null,
      address1: customer.defaultAddress.address1 ?? null,
      address2: customer.defaultAddress.address2 ?? null,
      city: customer.defaultAddress.city ?? null,
      province: customer.defaultAddress.province ?? null,
      country: customer.defaultAddress.country ?? null,
      zip: customer.defaultAddress.zip ?? null,
      company: customer.defaultAddress.company ?? null,
      phone: customer.defaultAddress.phone ?? null,
    } : undefined,
  };
}

function generatePhoneVariations(cleanPhone: string): string[] {
  const variations = [cleanPhone];

  if (cleanPhone.length >= 10) {
    const last10 = cleanPhone.slice(-10);
    const areaCode = last10.slice(0, 3);
    const exchange = last10.slice(3, 6);
    const number = last10.slice(6, 10);

    variations.push(
      last10,
      `1${last10}`,
      `${areaCode}-${exchange}-${number}`,
      `(${areaCode}) ${exchange}-${number}`,
      `${areaCode}.${exchange}.${number}`,
    );
  }

  if (cleanPhone.length >= 7) {
    variations.push(cleanPhone.slice(-7));
  }

  return [...new Set(variations)];
}
