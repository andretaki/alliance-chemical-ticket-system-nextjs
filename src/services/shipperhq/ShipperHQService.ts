/**
 * ShipperHQ API Service
 *
 * Calculates real-time shipping rates using the ShipperHQ GraphQL API.
 * Supports both:
 * - Single address calculation (for customer quotes/draft orders)
 * - Multi-region average calculation (for catalog pricing)
 */

import { env } from '@/lib/env';

// ============================================================================
// Types
// ============================================================================

export interface ShippingDimensions {
  width: number;
  height: number;
  length: number;
  weight: number;
}

export interface ShipperHQItem {
  itemId: string;
  sku: string;
  quantity: number;
  weight: number;
  price?: number;
  dimensions?: {
    width: number;
    height: number;
    length: number;
  };
  shippingGroups?: string[];
  dimensionalGroup?: string;
}

export interface ShippingAddress {
  city: string;
  state: string; // Province/state code like "TX", "CA"
  zip: string;
  country?: string; // Default: "US"
}

export interface ShippingRate {
  carrierCode: string;
  carrierTitle: string;
  methodCode: string;
  methodTitle: string;
  price: number;
  deliveryDate?: string;
  isFreight?: boolean;
}

export interface ShippingRateResult {
  rates: ShippingRate[];
  selectedRate: ShippingRate | null;
  error?: string;
}

// Multi-region calculation result (for catalog pricing)
export interface AverageRateResult {
  averageRate: number | null;
  ratesByRegion: Record<string, number>;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SHIPPERHQ_API_URL = 'https://api.shipperhq.com/v2/graphql';

// Destination regions for average rate calculations (catalog pricing)
const DESTINATIONS = {
  West: [
    { city: 'Los Angeles', state: 'CA', zip: '90001' },
    { city: 'Seattle', state: 'WA', zip: '98101' },
    { city: 'Phoenix', state: 'AZ', zip: '85001' },
    { city: 'Denver', state: 'CO', zip: '80201' },
  ],
  East: [
    { city: 'New York', state: 'NY', zip: '10001' },
    { city: 'Boston', state: 'MA', zip: '02101' },
    { city: 'Washington', state: 'DC', zip: '20001' },
    { city: 'Miami', state: 'FL', zip: '33101' },
  ],
  South: [
    { city: 'Houston', state: 'TX', zip: '77001' },
    { city: 'Atlanta', state: 'GA', zip: '30301' },
    { city: 'New Orleans', state: 'LA', zip: '70112' },
    { city: 'Charlotte', state: 'NC', zip: '28201' },
  ],
  North: [
    { city: 'Chicago', state: 'IL', zip: '60601' },
    { city: 'Minneapolis', state: 'MN', zip: '55401' },
    { city: 'Detroit', state: 'MI', zip: '48201' },
    { city: 'Cleveland', state: 'OH', zip: '44101' },
  ],
};

// ============================================================================
// GraphQL Query
// ============================================================================

const GRAPHQL_QUERY = `
query RateQuery($ratingInfo: RatingInfoInput!) {
  retrieveFullShippingQuote(ratingInfo: $ratingInfo) {
    ...RateResponseFragment
    __typename
  }
}

fragment RateResponseFragment on FullShippingQuote {
  validationStatus
  transactionId
  errors {
    errorCode
    externalErrorMessage
    internalErrorMessage
    __typename
  }
  shipments {
    shipmentDetail {
      name
      shipmentId
      __typename
    }
    groupedItems {
      itemId
      __typename
    }
    carriers {
      carrierDetail {
        carrierCode
        carrierTitle
        carrierType
        carrierEstimatedDeliveryDate
        __typename
      }
      methods {
        methodDetails {
          methodCode
          methodTitle
          totalCharges
          __typename
        }
        advancedFees {
          shippingPrice
          handlingFee
          totalCharges
          flatRulesApplied
          changeRulesApplied
          cost
          __typename
        }
        timeInTransitOptions {
          deliveryDate
          dispatchDate
          __typename
        }
        rateBreakdownList {
          shipmentDetail {
            shipmentId
            name
            __typename
          }
          carrierDetail {
            carrierCode
            carrierTitle
            carrierType
            __typename
          }
          advancedFees {
            handlingFee
            totalCharges
            flatRulesApplied
            changeRulesApplied
            cost
            __typename
          }
          methodDetails {
            methodTitle
            deliveryMessage
            __typename
          }
          timeInTransitOptions {
            deliveryDate
            dispatchDate
            __typename
          }
          packages {
            packageDetail {
              packageName
              width
              length
              height
              weight
              declaredValue
              surchargePrice
              packingWeight
              freightClass
              __typename
            }
            items {
              sku
              qtyPacked
              weightPacked
              __typename
            }
            __typename
          }
          methodCode
          isWinningRate
          __typename
        }
        __typename
      }
      packages {
        packageDetail {
          packageName
          width
          length
          height
          weight
          declaredValue
          surchargePrice
          packingWeight
          freightClass
          __typename
        }
        items {
          sku
          qtyPacked
          weightPacked
          __typename
        }
        __typename
      }
      preventRulesApplied
      error {
        errorCode
        externalErrorMessage
        internalErrorMessage
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}
`;

// ============================================================================
// ShipperHQ Service Class
// ============================================================================

export class ShipperHQService {
  private accessToken: string;

  constructor(accessToken?: string) {
    const token = accessToken || env.SHIPPERHQ_ACCESS_TOKEN;
    if (!token) {
      throw new Error('SHIPPERHQ_ACCESS_TOKEN is required');
    }
    this.accessToken = token;
  }

  /**
   * Build the request payload for ShipperHQ API
   */
  private buildPayload(items: ShipperHQItem[], destination: ShippingAddress) {
    const cartItems = items.map((item) => {
      const attributes: Array<{ name: string; value: string }> = [
        { name: 'shipperhq_warehouse', value: 'Alliance Chemical' },
      ];

      if (item.shippingGroups && item.shippingGroups.length > 0) {
        attributes.push({ name: 'shipperhq_shipping_group', value: item.shippingGroups.join(',') });
      }

      if (item.dimensionalGroup) {
        attributes.push({ name: 'shipperhq_dim_group', value: item.dimensionalGroup });
      }

      if (item.dimensions) {
        attributes.push({ name: 'ship_width', value: String(item.dimensions.width) });
        attributes.push({ name: 'ship_height', value: String(item.dimensions.height) });
        attributes.push({ name: 'ship_length', value: String(item.dimensions.length) });
      }

      return {
        itemId: item.itemId,
        sku: item.sku,
        storePrice: String(item.price || 1),
        taxInclStorePrice: String(item.price || 1),
        weight: item.weight,
        qty: item.quantity,
        type: 'SIMPLE',
        attributes,
      };
    });

    return {
      operationName: 'RateQuery',
      variables: {
        ratingInfo: {
          cart: { items: cartItems },
          customer: {},
          destination: {
            country: destination.country || 'US',
            region: destination.state,
            city: destination.city,
            zipcode: destination.zip,
          },
        },
      },
      query: GRAPHQL_QUERY,
    };
  }

  /**
   * Make a request to ShipperHQ API
   */
  private async fetchRates(payload: any): Promise<any> {
    const headers = {
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'content-type': 'application/json',
      'origin': 'https://shipperhq.com',
      'referer': 'https://shipperhq.com/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'x-shipperhq-access-token': this.accessToken,
      'x-shipperhq-scope': 'LIVE',
      'x-shipperhq-session': 'RATESMGR',
    };

    const response = await fetch(SHIPPERHQ_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ShipperHQ API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Parse shipping rates from ShipperHQ response
   */
  private parseRates(data: any): ShippingRate[] {
    const rates: ShippingRate[] = [];
    const shipments = data?.data?.retrieveFullShippingQuote?.shipments;

    if (!shipments) {
      return rates;
    }

    for (const shipment of shipments) {
      for (const carrier of shipment.carriers || []) {
        const carrierDetail = carrier.carrierDetail || {};

        for (const method of carrier.methods || []) {
          const methodDetails = method.methodDetails || {};
          const timeInTransit = method.timeInTransitOptions?.[0];
          const price = parseFloat(methodDetails.totalCharges);

          if (!isNaN(price) && price > 0) {
            const methodCode = (methodDetails.methodCode || '').toLowerCase();
            const isFreight =
              methodCode.includes('ltl') ||
              methodCode.includes('freight') ||
              methodCode === 'ltlnoliftgate_copy';

            rates.push({
              carrierCode: carrierDetail.carrierCode || '',
              carrierTitle: carrierDetail.carrierTitle || '',
              methodCode: methodDetails.methodCode || '',
              methodTitle: methodDetails.methodTitle || '',
              price,
              deliveryDate: timeInTransit?.deliveryDate,
              isFreight,
            });
          }
        }
      }
    }

    // Sort by price
    return rates.sort((a, b) => a.price - b.price);
  }

  /**
   * Calculate shipping rates for a specific customer address
   * This is the primary method for draft orders/quotes
   */
  async calculateRatesForAddress(
    items: ShipperHQItem[],
    shippingAddress: ShippingAddress
  ): Promise<ShippingRateResult> {
    try {
      console.log('[ShipperHQ] Calculating rates for address:', shippingAddress);
      console.log('[ShipperHQ] Items:', JSON.stringify(items, null, 2));

      const payload = this.buildPayload(items, shippingAddress);
      const data = await this.fetchRates(payload);

      // Check for API errors
      const errors = data?.data?.retrieveFullShippingQuote?.errors;
      if (errors && errors.length > 0) {
        const errorMsg = errors.map((e: any) => e.externalErrorMessage || e.internalErrorMessage).join('; ');
        console.error('[ShipperHQ] API returned errors:', errorMsg);
        return { rates: [], selectedRate: null, error: errorMsg };
      }

      const rates = this.parseRates(data);
      console.log('[ShipperHQ] Parsed rates:', rates);

      if (rates.length === 0) {
        return { rates: [], selectedRate: null, error: 'No shipping rates available for this address' };
      }

      // Auto-select the best rate (prefer freight for heavy items, otherwise cheapest)
      const freightRate = rates.find((r) => r.isFreight);
      const selectedRate = freightRate || rates[0];

      return { rates, selectedRate };
    } catch (error: any) {
      console.error('[ShipperHQ] Error calculating rates:', error);
      return { rates: [], selectedRate: null, error: error.message };
    }
  }

  /**
   * Get a single rate for a destination (used for averaging)
   */
  private async fetchSingleRate(
    items: ShipperHQItem[],
    destination: { city: string; state: string; zip: string }
  ): Promise<number | null> {
    try {
      const payload = this.buildPayload(items, destination);
      const data = await this.fetchRates(payload);
      const rates = this.parseRates(data);

      // Prefer freight rate
      const freightRate = rates.find((r) => r.isFreight);
      if (freightRate) {
        return freightRate.price;
      }

      // Fallback to any rate
      return rates.length > 0 ? rates[0].price : null;
    } catch (error: any) {
      console.error(`[ShipperHQ] Error fetching rate for ${destination.city}, ${destination.state}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate average shipping rate across all US regions
   * Used for catalog pricing, not customer quotes
   */
  async calculateAverageRate(items: ShipperHQItem[], verbose = false): Promise<AverageRateResult> {
    const ratesByRegion: Record<string, number> = {};

    for (const [region, destinations] of Object.entries(DESTINATIONS)) {
      const regionRates: number[] = [];

      for (const dest of destinations) {
        const rate = await this.fetchSingleRate(items, dest);
        if (rate !== null) {
          regionRates.push(rate);
          if (verbose) {
            console.log(`  ${dest.city}, ${dest.state}: $${rate.toFixed(2)}`);
          }
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 100));
      }

      if (regionRates.length > 0) {
        const avgRate = regionRates.reduce((a, b) => a + b, 0) / regionRates.length;
        ratesByRegion[region] = avgRate;
        if (verbose) {
          console.log(`  ${region} Region Average: $${avgRate.toFixed(2)}`);
        }
      }
    }

    if (Object.keys(ratesByRegion).length === 0) {
      return {
        averageRate: null,
        ratesByRegion,
        error: 'No shipping rates returned from ShipperHQ',
      };
    }

    const overallAvg =
      Object.values(ratesByRegion).reduce((a, b) => a + b, 0) / Object.keys(ratesByRegion).length;

    return {
      averageRate: Math.round(overallAvg * 100) / 100,
      ratesByRegion,
    };
  }

  /**
   * Quick 2-destination shipping estimate (faster, less accurate)
   */
  async calculateQuickRate(items: ShipperHQItem[]): Promise<number | null> {
    const sampleDests = [
      { city: 'Los Angeles', state: 'CA', zip: '90001' },
      { city: 'New York', state: 'NY', zip: '10001' },
    ];

    const rates: number[] = [];

    for (const dest of sampleDests) {
      const rate = await this.fetchSingleRate(items, dest);
      if (rate !== null) {
        rates.push(rate);
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (rates.length === 0) {
      return null;
    }

    return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let _instance: ShipperHQService | null = null;

/**
 * Get ShipperHQ service instance (singleton)
 */
export function getShipperHQService(): ShipperHQService | null {
  if (_instance) {
    return _instance;
  }

  const accessToken = env.SHIPPERHQ_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('[ShipperHQ] SHIPPERHQ_ACCESS_TOKEN not set - shipping calculation unavailable');
    return null;
  }

  _instance = new ShipperHQService(accessToken);
  return _instance;
}

/**
 * Create a new ShipperHQ service instance (non-singleton, for testing)
 */
export function createShipperHQService(accessToken: string): ShipperHQService {
  return new ShipperHQService(accessToken);
}
