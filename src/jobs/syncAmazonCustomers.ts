/**
 * Amazon Customer Sync Job
 *
 * Derives customers from Amazon orders since Amazon SP-API doesn't provide direct customer access.
 * CRITICAL: Does NOT rely on BuyerEmail as primary join key (often restricted/absent).
 *
 * Identity strategy:
 * 1. If BuyerEmail is present and allowed, use it as primary identifier
 * 2. Otherwise, use ShippingAddress hash as fallback identifier
 * 3. Never auto-merge ambiguous matches
 */

import { db, orders, ragSyncCursors } from '@/lib/db';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { integrations } from '@/lib/env';
import {
  identityService,
  identityUtils,
  createSyncMetrics,
  logSyncMetrics,
  type SyncMetrics,
  type AddressInput,
} from '@/services/crm/identityService';

const CURSOR_KEY = 'amazon_customer' as const;
const BATCH_SIZE = 100;

interface AmazonCursor {
  lastProcessedOrderId: number | null;
  lastSuccessAt: string | null;
  pagesSynced: number;
}

async function getCursor(): Promise<AmazonCursor> {
  const row = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, CURSOR_KEY),
  });

  if (row?.cursorValue && typeof row.cursorValue === 'object') {
    const cv = row.cursorValue as Record<string, unknown>;
    return {
      lastProcessedOrderId: (cv.lastProcessedOrderId as number) || null,
      lastSuccessAt: (cv.lastSuccessAt as string) || null,
      pagesSynced: (cv.pagesSynced as number) || 0,
    };
  }

  return { lastProcessedOrderId: null, lastSuccessAt: null, pagesSynced: 0 };
}

async function updateCursor(cursor: AmazonCursor, itemsSynced: number): Promise<void> {
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

interface AmazonOrderMetadata {
  buyerEmail?: string | null;
  buyerName?: string | null;
  shippingAddress?: {
    Name?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
  amazonOrderId?: string;
}

function extractAddressFromMetadata(metadata: AmazonOrderMetadata): AddressInput | null {
  const addr = metadata.shippingAddress;
  if (!addr) return null;

  return {
    name: addr.Name || null,
    address1: addr.AddressLine1 || null,
    address2: addr.AddressLine2 || null,
    city: addr.City || null,
    state: addr.StateOrRegion || null,
    postalCode: addr.PostalCode || null,
    country: addr.CountryCode || null,
  };
}

function parseNameFromMetadata(metadata: AmazonOrderMetadata): { firstName: string | null; lastName: string | null } {
  const buyerName = metadata.buyerName || metadata.shippingAddress?.Name;
  if (!buyerName) return { firstName: null, lastName: null };

  const parts = buyerName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export async function syncAmazonCustomers(options: { fullSync?: boolean } = {}): Promise<SyncMetrics> {
  const metrics = createSyncMetrics();

  if (!integrations.amazonSpApi) {
    console.log('[syncAmazonCustomers] Amazon SP-API not configured, skipping');
    return metrics;
  }

  console.log('[syncAmazonCustomers] Starting Amazon customer sync (from orders)...');

  const cursor = await getCursor();
  let currentCursor = { ...cursor };
  let hasMore = true;
  let lastProcessedId = options.fullSync ? 0 : (cursor.lastProcessedOrderId || 0);

  while (hasMore) {
    try {
      // Fetch Amazon orders that don't have a customerId linked yet, or all for full sync
      const amazonOrders = await db.query.orders.findMany({
        where: options.fullSync
          ? and(
              eq(orders.provider, 'amazon'),
              sql`${orders.id} > ${lastProcessedId}`
            )
          : and(
              eq(orders.provider, 'amazon'),
              sql`${orders.id} > ${lastProcessedId}`
            ),
        orderBy: [orders.id],
        limit: BATCH_SIZE,
      });

      metrics.fetched += amazonOrders.length;

      if (amazonOrders.length === 0) {
        hasMore = false;
        break;
      }

      for (const order of amazonOrders) {
        try {
          const metadata = (order.metadata || {}) as AmazonOrderMetadata;
          const buyerEmail = metadata.buyerEmail;
          const address = extractAddressFromMetadata(metadata);
          const { firstName, lastName } = parseNameFromMetadata(metadata);
          const phone = metadata.shippingAddress?.Phone || null;

          // Determine identity strategy
          let externalId: string | null = null;
          let identityType: 'amazon_buyer_id' | 'amazon_order_address_hash' = 'amazon_order_address_hash';

          // If we have buyer email, use it as the external ID
          // But we still support address hash as fallback
          if (buyerEmail) {
            // Use email-based identity (email will be used for matching)
            identityType = 'amazon_buyer_id';
            // We don't set externalId here - let email matching work
          }

          // Compute address hash for fallback
          const addressHash = address ? identityUtils.computeAddressHash(address) : null;

          // If no email and we have an address hash, use it as the external ID
          if (!buyerEmail && addressHash) {
            externalId = `address_hash:${addressHash}`;
            identityType = 'amazon_order_address_hash';
          }

          // If we have neither email nor valid address, log and skip
          if (!buyerEmail && !addressHash) {
            console.warn(`[syncAmazonCustomers] Order ${order.id} (${order.externalId}) has no email or valid address, skipping`);
            metrics.unlinked++;
            lastProcessedId = order.id;
            continue;
          }

          const result = await identityService.upsertCustomerWithMetrics(
            {
              provider: 'amazon',
              externalId,
              email: buyerEmail,
              phone,
              firstName,
              lastName,
              identityType,
              metadata: {
                amazonOrderId: metadata.amazonOrderId || order.externalId,
                source: 'order_derived',
                hasEmail: !!buyerEmail,
                addressHash,
              },
            },
            address || undefined
          );

          switch (result.action) {
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
              console.warn(`[syncAmazonCustomers] Ambiguous match for order ${order.id} (${order.externalId})`);
              lastProcessedId = order.id;
              continue; // Don't update order's customerId
          }

          // Link the order to the customer if not already linked
          if (result.customerId && order.customerId !== result.customerId) {
            await db.update(orders)
              .set({ customerId: result.customerId, updatedAt: new Date() })
              .where(eq(orders.id, order.id));
          }

          lastProcessedId = order.id;
        } catch (err) {
          metrics.errors++;
          console.error(`[syncAmazonCustomers] Error processing order ${order.id}:`, err);
          lastProcessedId = order.id;
        }
      }

      currentCursor.lastProcessedOrderId = lastProcessedId;
      currentCursor.pagesSynced++;
      currentCursor.lastSuccessAt = new Date().toISOString();

      // If we got less than BATCH_SIZE, we're done
      if (amazonOrders.length < BATCH_SIZE) {
        hasMore = false;
      }

      // Save cursor after each batch
      await updateCursor(currentCursor, amazonOrders.length);

    } catch (err) {
      metrics.errors++;
      console.error('[syncAmazonCustomers] Error in sync loop:', err);
      hasMore = false;
    }
  }

  logSyncMetrics('syncAmazonCustomers', metrics);
  return metrics;
}

// CLI runner
if (process.argv[1]?.includes('syncAmazonCustomers')) {
  const fullSync = process.argv.includes('--full');
  syncAmazonCustomers({ fullSync })
    .then((metrics) => {
      console.log('[syncAmazonCustomers] Done:', metrics);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[syncAmazonCustomers] Failed:', err);
      process.exit(1);
    });
}
