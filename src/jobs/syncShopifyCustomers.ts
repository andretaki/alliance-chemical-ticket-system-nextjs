/**
 * Shopify Customer Sync Job
 *
 * Fetches customers from Shopify and upserts them into the customers table.
 * Uses structured JSON cursor for incremental sync with GraphQL pagination.
 */

import { db, ragSyncCursors } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { ShopifyService } from '@/services/shopify/ShopifyService';
import { integrations } from '@/lib/env';
import {
  identityService,
  createSyncMetrics,
  logSyncMetrics,
  type SyncMetrics,
} from '@/services/crm/identityService';

const CURSOR_KEY = 'shopify_customer' as const;
const BATCH_SIZE = 50;

interface ShopifyCursor {
  lastUpdatedAt: string | null;
  endCursor: string | null;
  lastSuccessAt: string | null;
  pagesSynced: number;
}

interface ShopifyCustomerNode {
  id: string;
  legacyResourceId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  numberOfOrders: number;
  amountSpent: { amount: string; currencyCode: string } | null;
  defaultAddress: {
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
}

async function getCursor(): Promise<ShopifyCursor> {
  const row = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, CURSOR_KEY),
  });

  if (row?.cursorValue && typeof row.cursorValue === 'object') {
    const cv = row.cursorValue as Record<string, unknown>;
    return {
      lastUpdatedAt: (cv.lastUpdatedAt as string) || null,
      endCursor: (cv.endCursor as string) || null,
      lastSuccessAt: (cv.lastSuccessAt as string) || null,
      pagesSynced: (cv.pagesSynced as number) || 0,
    };
  }

  return { lastUpdatedAt: null, endCursor: null, lastSuccessAt: null, pagesSynced: 0 };
}

async function updateCursor(cursor: ShopifyCursor, itemsSynced: number): Promise<void> {
  await db.insert(ragSyncCursors)
    .values({
      sourceType: CURSOR_KEY,
      cursorValue: cursor,
      lastSuccessAt: new Date(),
      itemsSynced,
    })
    .onConflictDoUpdate({
      target: ragSyncCursors.sourceType,
      set: {
        cursorValue: cursor,
        lastSuccessAt: new Date(),
        itemsSynced: sql`${ragSyncCursors.itemsSynced} + ${itemsSynced}`,
      },
    });
}

async function fetchShopifyCustomers(
  shopifyService: ShopifyService,
  cursor: string | null,
  updatedAtMin: string | null
): Promise<{ customers: ShopifyCustomerNode[]; hasNextPage: boolean; endCursor: string | null }> {
  const query = `
    query fetchCustomers($first: Int!, $after: String, $query: String) {
      customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
        edges {
          node {
            id
            legacyResourceId
            email
            phone
            firstName
            lastName
            displayName
            createdAt
            updatedAt
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            defaultAddress {
              company
              address1
              address2
              city
              province
              zip
              country
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

  // Build query filter for incremental sync
  let queryFilter: string | null = null;
  if (updatedAtMin) {
    queryFilter = `updated_at:>'${updatedAtMin}'`;
  }

  const variables: Record<string, any> = {
    first: BATCH_SIZE,
    after: cursor,
  };

  if (queryFilter) {
    variables.query = queryFilter;
  }

  try {
    const response = await (shopifyService as any).requestWithTimeout(query, { variables });

    if (response.errors) {
      console.error('[syncShopifyCustomers] GraphQL errors:', response.errors);
      throw new Error('GraphQL query failed');
    }

    const customersData = response.data?.customers;
    if (!customersData) {
      return { customers: [], hasNextPage: false, endCursor: null };
    }

    const customers = customersData.edges.map((edge: any) => edge.node);
    const pageInfo = customersData.pageInfo;

    return {
      customers,
      hasNextPage: pageInfo.hasNextPage,
      endCursor: pageInfo.endCursor,
    };
  } catch (err) {
    console.error('[syncShopifyCustomers] Error fetching customers:', err);
    throw err;
  }
}

export async function syncShopifyCustomers(options: { fullSync?: boolean } = {}): Promise<SyncMetrics> {
  const metrics = createSyncMetrics();

  if (!integrations.shopify) {
    console.log('[syncShopifyCustomers] Shopify integration not configured, skipping');
    return metrics;
  }

  console.log('[syncShopifyCustomers] Starting Shopify customer sync...');

  const shopifyService = new ShopifyService();
  const cursor = await getCursor();
  let currentCursor: ShopifyCursor = {
    lastUpdatedAt: options.fullSync ? null : cursor.lastUpdatedAt,
    endCursor: options.fullSync ? null : cursor.endCursor,
    lastSuccessAt: cursor.lastSuccessAt,
    pagesSynced: options.fullSync ? 0 : cursor.pagesSynced,
  };

  let hasMore = true;
  let latestUpdatedAt = cursor.lastUpdatedAt;
  let totalProcessed = 0;

  while (hasMore) {
    try {
      const result = await fetchShopifyCustomers(
        shopifyService,
        currentCursor.endCursor,
        options.fullSync ? null : cursor.lastUpdatedAt
      );

      metrics.fetched += result.customers.length;

      if (result.customers.length === 0) {
        hasMore = false;
        break;
      }

      for (const shopifyCustomer of result.customers) {
        try {
          const shopifyCustomerId = shopifyCustomer.legacyResourceId || shopifyCustomer.id.replace('gid://shopify/Customer/', '');

          const upsertResult = await identityService.upsertCustomerWithMetrics({
            provider: 'shopify',
            externalId: shopifyCustomerId,
            email: shopifyCustomer.email,
            phone: shopifyCustomer.phone,
            firstName: shopifyCustomer.firstName,
            lastName: shopifyCustomer.lastName,
            company: shopifyCustomer.defaultAddress?.company,
            identityType: 'shopify_customer_id',
            metadata: {
              shopifyCustomerId,
              shopifyGid: shopifyCustomer.id,
              displayName: shopifyCustomer.displayName,
              numberOfOrders: shopifyCustomer.numberOfOrders,
              amountSpent: shopifyCustomer.amountSpent,
              defaultAddress: shopifyCustomer.defaultAddress,
            },
          });

          switch (upsertResult.action) {
            case 'created':
              metrics.created++;
              break;
            case 'updated':
              metrics.updated++;
              break;
            case 'linked':
              metrics.linked++;
              break;
            case 'ambiguous':
              metrics.ambiguous++;
              console.warn(`[syncShopifyCustomers] Ambiguous match for Shopify customer ${shopifyCustomerId}`);
              break;
          }

          // Track latest updated time
          if (shopifyCustomer.updatedAt) {
            if (!latestUpdatedAt || shopifyCustomer.updatedAt > latestUpdatedAt) {
              latestUpdatedAt = shopifyCustomer.updatedAt;
            }
          }

          totalProcessed++;
        } catch (err) {
          metrics.errors++;
          console.error(`[syncShopifyCustomers] Error processing Shopify customer ${shopifyCustomer.id}:`, err);
        }
      }

      currentCursor.endCursor = result.endCursor;
      currentCursor.pagesSynced++;
      currentCursor.lastUpdatedAt = latestUpdatedAt;
      currentCursor.lastSuccessAt = new Date().toISOString();

      hasMore = result.hasNextPage;

      // Save cursor after each batch
      await updateCursor(currentCursor, result.customers.length);

    } catch (err) {
      metrics.errors++;
      console.error('[syncShopifyCustomers] Error in sync loop:', err);
      hasMore = false;
    }
  }

  logSyncMetrics('syncShopifyCustomers', metrics);
  return metrics;
}

// CLI runner
if (process.argv[1]?.includes('syncShopifyCustomers')) {
  const fullSync = process.argv.includes('--full');
  syncShopifyCustomers({ fullSync })
    .then((metrics) => {
      console.log('[syncShopifyCustomers] Done:', metrics);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[syncShopifyCustomers] Failed:', err);
      process.exit(1);
    });
}
