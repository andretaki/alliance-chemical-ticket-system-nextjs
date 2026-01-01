/**
 * Amazon Selling Partner API (SP-API) Service
 * Handles OAuth token refresh, order fetching, and fulfillment data retrieval.
 * Pattern follows shipstationService.ts with exponential backoff and circuit breaker.
 */

import axios, { AxiosError } from 'axios';
import { env, integrations } from '@/lib/env';
import { circuitBreakers } from '@/lib/circuitBreaker';
import { db } from '@/lib/db';
import { amazonSpTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';

const AMAZON_SP_BASE_URL = 'https://sellingpartnerapi-na.amazon.com';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// --- Types ---
export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: 'Pending' | 'Unshipped' | 'PartiallyShipped' | 'Shipped' | 'Canceled' | 'Unfulfillable' | 'InvoiceUnconfirmed' | 'PendingAvailability';
  FulfillmentChannel: 'MFN' | 'AFN';
  SalesChannel?: string;
  OrderTotal?: { Amount: string; CurrencyCode: string };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  BuyerEmail?: string;
  BuyerName?: string;
  ShipmentServiceLevelCategory?: string;
  ShippingAddress?: {
    Name?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
}

export interface AmazonOrderItem {
  ASIN: string;
  SellerSKU?: string;
  OrderItemId: string;
  Title: string;
  QuantityOrdered: number;
  QuantityShipped: number;
  ItemPrice?: { Amount: string; CurrencyCode: string };
  ItemTax?: { Amount: string; CurrencyCode: string };
}

export interface AmazonFulfillmentShipment {
  AmazonShipmentId: string;
  ShipmentItems?: {
    SellerSKU?: string;
    QuantityShipped?: number;
    ItemSerial?: string;
  }[];
  PackageNumber?: number;
  EstimatedArrivalDate?: string;
}

export interface AmazonFbaTracking {
  packageNumber?: number;
  trackingNumber?: string;
  carrierCode?: string;
}

interface TokenData {
  accessToken: string;
  expiresAt: Date;
}

// --- Token Management ---
let cachedToken: TokenData | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!integrations.amazonSpApi) {
    throw new Error('Amazon SP-API credentials are not configured');
  }

  console.log('[AmazonSpService] Refreshing access token...');

  const response = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: env.AMAZON_SP_REFRESH_TOKEN!,
    client_id: env.AMAZON_SP_CLIENT_ID!,
    client_secret: env.AMAZON_SP_CLIENT_SECRET!,
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });

  const { access_token, expires_in } = response.data;
  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000); // 60 sec buffer

  // Cache in memory
  cachedToken = { accessToken: access_token, expiresAt };

  // Persist to DB for multi-instance scenarios
  try {
    await db.insert(amazonSpTokens).values({
      marketplaceId: env.AMAZON_SP_MARKETPLACE_ID,
      refreshToken: env.AMAZON_SP_REFRESH_TOKEN!,
      accessToken: access_token,
      accessTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: amazonSpTokens.marketplaceId,
      set: {
        accessToken: access_token,
        accessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn('[AmazonSpService] Failed to persist token to DB:', err);
  }

  return access_token;
}

async function getAccessToken(): Promise<string> {
  // Check memory cache first
  if (cachedToken && cachedToken.expiresAt > new Date()) {
    return cachedToken.accessToken;
  }

  // Check DB cache
  try {
    const stored = await db.query.amazonSpTokens.findFirst({
      where: eq(amazonSpTokens.marketplaceId, env.AMAZON_SP_MARKETPLACE_ID),
    });

    if (stored?.accessToken && stored.accessTokenExpiresAt && stored.accessTokenExpiresAt > new Date()) {
      cachedToken = { accessToken: stored.accessToken, expiresAt: stored.accessTokenExpiresAt };
      return stored.accessToken;
    }
  } catch (err) {
    console.warn('[AmazonSpService] Failed to read token from DB:', err);
  }

  return refreshAccessToken();
}

// --- API Request Wrapper with Exponential Backoff ---
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function amazonSpRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  params: Record<string, string> = {},
  body?: unknown
): Promise<T> {
  if (!integrations.amazonSpApi) {
    throw new Error('Amazon SP-API credentials are not configured');
  }

  const accessToken = await getAccessToken();
  const url = `${AMAZON_SP_BASE_URL}${endpoint}`;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AmazonSpService] Attempt ${attempt}/${MAX_RETRIES} - ${method} ${endpoint}`);

      const response = await axios({
        method,
        url,
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
        },
        params,
        data: body,
        timeout: 20000,
      });

      return response.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        // Rate limited - use Retry-After header or exponential backoff
        if (status === 429) {
          const retryAfter = parseInt(error.response?.headers['retry-after'] || '0', 10);
          const delay = retryAfter > 0 ? retryAfter * 1000 : BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[AmazonSpService] Rate limited. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Server errors (5xx) - retry with backoff
        if (status && status >= 500) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[AmazonSpService] Server error ${status}. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Token expired - refresh and retry
        if (status === 401 || status === 403) {
          console.warn('[AmazonSpService] Token expired or forbidden, refreshing...');
          cachedToken = null;
          await refreshAccessToken();
          continue;
        }

        // Client errors (4xx except 429/401/403) - don't retry
        if (status && status >= 400 && status < 500) {
          console.error(`[AmazonSpService] Client error ${status} for ${endpoint}:`, error.message);
          throw error;
        }
      }

      // Network errors - retry with backoff
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[AmazonSpService] Network error. Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error(`[AmazonSpService] All ${MAX_RETRIES} attempts failed for ${endpoint}`);
  throw lastError || new Error(`Amazon SP-API request failed after ${MAX_RETRIES} attempts`);
}

// --- Order API ---

export interface FetchOrdersParams {
  createdAfter?: string;
  createdBefore?: string;
  lastUpdatedAfter?: string;
  lastUpdatedBefore?: string;
  orderStatuses?: string[];
  nextToken?: string;
  maxResultsPerPage?: number;
}

export interface FetchOrdersResponse {
  orders: AmazonOrder[];
  nextToken?: string;
}

export async function fetchAmazonOrdersPage(params: FetchOrdersParams): Promise<FetchOrdersResponse> {
  return circuitBreakers.amazonSpApi.execute(
    async () => {
      const queryParams: Record<string, string> = {
        MarketplaceIds: env.AMAZON_SP_MARKETPLACE_ID,
      };

      if (params.maxResultsPerPage) {
        queryParams.MaxResultsPerPage = String(params.maxResultsPerPage);
      }
      if (params.createdAfter) queryParams.CreatedAfter = params.createdAfter;
      if (params.createdBefore) queryParams.CreatedBefore = params.createdBefore;
      if (params.lastUpdatedAfter) queryParams.LastUpdatedAfter = params.lastUpdatedAfter;
      if (params.lastUpdatedBefore) queryParams.LastUpdatedBefore = params.lastUpdatedBefore;
      if (params.orderStatuses?.length) queryParams.OrderStatuses = params.orderStatuses.join(',');
      if (params.nextToken) queryParams.NextToken = params.nextToken;

      const response = await amazonSpRequest<{
        payload: { Orders: AmazonOrder[]; NextToken?: string };
      }>('GET', '/orders/v0/orders', queryParams);

      return {
        orders: response.payload.Orders || [],
        nextToken: response.payload.NextToken,
      };
    },
    () => ({ orders: [], nextToken: undefined })
  );
}

// --- Order Items API ---

export async function fetchAmazonOrderItems(amazonOrderId: string): Promise<AmazonOrderItem[]> {
  return circuitBreakers.amazonSpApi.execute(
    async () => {
      const response = await amazonSpRequest<{
        payload: { OrderItems: AmazonOrderItem[]; NextToken?: string };
      }>('GET', `/orders/v0/orders/${amazonOrderId}/orderItems`);

      return response.payload.OrderItems || [];
    },
    () => []
  );
}

// --- FBA Fulfillment API ---

export interface FbaFulfillmentOrder {
  SellerFulfillmentOrderId: string;
  DisplayableOrderId: string;
  FulfillmentOrderStatus: string;
  StatusUpdatedDate?: string;
  FulfillmentShipments?: AmazonFulfillmentShipment[];
}

export async function fetchFbaFulfillmentOrder(
  amazonOrderId: string
): Promise<FbaFulfillmentOrder | null> {
  return circuitBreakers.amazonSpApi.execute(
    async () => {
      try {
        const response = await amazonSpRequest<{
          payload: { FulfillmentOrder: FbaFulfillmentOrder };
        }>('GET', `/fba/outbound/2020-07-01/fulfillmentOrders/${amazonOrderId}`);

        return response.payload.FulfillmentOrder;
      } catch (err) {
        // FBA fulfillment order may not exist for MFN orders
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    () => null
  );
}

// --- Tracking Info for FBA ---

export async function fetchFbaTrackingInfo(
  packageNumber: number,
  amazonOrderId: string
): Promise<AmazonFbaTracking | null> {
  return circuitBreakers.amazonSpApi.execute(
    async () => {
      try {
        // FBA tracking is typically embedded in the fulfillment order response
        // This is a simplified version - actual implementation may need adjustment
        // based on Amazon's fulfillment outbound shipment endpoint
        const response = await amazonSpRequest<{
          payload: { TrackingNumber?: string; CarrierCode?: string };
        }>('GET', `/fba/outbound/2020-07-01/fulfillmentOrders/${amazonOrderId}/tracking`, {
          packageNumber: String(packageNumber),
        });

        return {
          packageNumber,
          trackingNumber: response.payload.TrackingNumber,
          carrierCode: response.payload.CarrierCode,
        };
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    () => null
  );
}

// --- Helper Functions ---

export function mapAmazonOrderStatus(status: AmazonOrder['OrderStatus']): string {
  switch (status) {
    case 'Shipped':
      return 'fulfilled';
    case 'PartiallyShipped':
      return 'partial';
    case 'Canceled':
    case 'Unfulfillable':
      return 'cancelled';
    case 'Pending':
    case 'PendingAvailability':
    case 'InvoiceUnconfirmed':
      return 'open';
    case 'Unshipped':
    default:
      return 'open';
  }
}

export function mapAmazonFinancialStatus(order: AmazonOrder): string {
  // Amazon orders are typically pre-paid at checkout
  if (order.OrderStatus === 'Canceled' || order.OrderStatus === 'Unfulfillable') {
    return 'void';
  }
  return 'paid';
}

export function isConfigured(): boolean {
  return integrations.amazonSpApi;
}
