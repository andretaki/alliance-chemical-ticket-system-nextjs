/**
 * ShipStation Customer Sync Job
 *
 * Derives customers from ShipStation shipments since ShipStation doesn't have a direct customer API.
 * Uses shipTo email when available, otherwise falls back to address hash.
 *
 * Identity strategy:
 * 1. If shipTo email is present, use it as primary identifier
 * 2. Otherwise, use shipTo address hash as fallback identifier
 * 3. Never auto-merge ambiguous matches
 */

import { db, shipstationShipments, ragSyncCursors } from '@/lib/db';
import { eq, sql, desc, and, isNotNull } from 'drizzle-orm';
import { integrations } from '@/lib/env';
import {
  identityService,
  identityUtils,
  createSyncMetrics,
  logSyncMetrics,
  type SyncMetrics,
  type AddressInput,
} from '@/services/crm/identityService';

const CURSOR_KEY = 'shipstation_customer' as const;
const BATCH_SIZE = 100;

interface ShipstationCursor {
  lastProcessedShipmentId: number | null;
  lastSuccessAt: string | null;
  pagesSynced: number;
}

async function getCursor(): Promise<ShipstationCursor> {
  const row = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, CURSOR_KEY),
  });

  if (row?.cursorValue && typeof row.cursorValue === 'object') {
    const cv = row.cursorValue as Record<string, unknown>;
    return {
      lastProcessedShipmentId: (cv.lastProcessedShipmentId as number) || null,
      lastSuccessAt: (cv.lastSuccessAt as string) || null,
      pagesSynced: (cv.pagesSynced as number) || 0,
    };
  }

  return { lastProcessedShipmentId: null, lastSuccessAt: null, pagesSynced: 0 };
}

async function updateCursor(cursor: ShipstationCursor, itemsSynced: number): Promise<void> {
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

interface ShipstationMetadata {
  shipTo?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  customerId?: number | string;
  customerEmail?: string;
}

function extractAddressFromMetadata(metadata: ShipstationMetadata): AddressInput | null {
  const shipTo = metadata.shipTo;
  if (!shipTo) return null;

  return {
    name: shipTo.name || null,
    address1: shipTo.street1 || null,
    address2: shipTo.street2 || null,
    city: shipTo.city || null,
    state: shipTo.state || null,
    postalCode: shipTo.postalCode || null,
    country: shipTo.country || null,
  };
}

function parseNameFromMetadata(metadata: ShipstationMetadata): { firstName: string | null; lastName: string | null; company: string | null } {
  const shipTo = metadata.shipTo;
  if (!shipTo?.name) return { firstName: null, lastName: null, company: shipTo?.company || null };

  const parts = shipTo.name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null, company: shipTo.company || null };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    company: shipTo.company || null,
  };
}

export async function syncShipstationCustomers(options: { fullSync?: boolean } = {}): Promise<SyncMetrics> {
  const metrics = createSyncMetrics();

  if (!integrations.shipstation) {
    console.log('[syncShipstationCustomers] ShipStation not configured, skipping');
    return metrics;
  }

  console.log('[syncShipstationCustomers] Starting ShipStation customer sync (from shipments)...');

  const cursor = await getCursor();
  let currentCursor = { ...cursor };
  let hasMore = true;
  let lastProcessedId = options.fullSync ? 0 : (cursor.lastProcessedShipmentId || 0);

  while (hasMore) {
    try {
      // Fetch shipments that haven't been processed for customer linking
      const shipments = await db.query.shipstationShipments.findMany({
        where: sql`${shipstationShipments.id} > ${lastProcessedId}`,
        orderBy: [shipstationShipments.id],
        limit: BATCH_SIZE,
      });

      metrics.fetched += shipments.length;

      if (shipments.length === 0) {
        hasMore = false;
        break;
      }

      for (const shipment of shipments) {
        try {
          const metadata = (shipment.metadata || {}) as ShipstationMetadata;
          const shipTo = metadata.shipTo;

          // Extract email from various sources
          const email = shipTo?.email || metadata.customerEmail || null;
          const phone = shipTo?.phone || null;
          const address = extractAddressFromMetadata(metadata);
          const { firstName, lastName, company } = parseNameFromMetadata(metadata);

          // Determine identity strategy
          let externalId: string | null = null;
          let identityType: 'shipstation_customer_id' | 'shipstation_address_hash' = 'shipstation_address_hash';

          // If ShipStation has a customer ID, use it
          if (metadata.customerId) {
            externalId = String(metadata.customerId);
            identityType = 'shipstation_customer_id';
          }

          // Compute address hash for fallback
          const addressHash = address ? identityUtils.computeAddressHash(address) : null;

          // If no customer ID and no email, use address hash
          if (!externalId && !email && addressHash) {
            externalId = `address_hash:${addressHash}`;
            identityType = 'shipstation_address_hash';
          }

          // If we have neither email nor valid address, skip
          if (!email && !addressHash && !externalId) {
            console.warn(`[syncShipstationCustomers] Shipment ${shipment.id} has no identifiable customer data, skipping`);
            metrics.unlinked++;
            lastProcessedId = shipment.id;
            continue;
          }

          const result = await identityService.upsertCustomerWithMetrics(
            {
              provider: 'shipstation',
              externalId,
              email,
              phone,
              firstName,
              lastName,
              company,
              identityType,
              metadata: {
                shipstationShipmentId: shipment.shipstationShipmentId?.toString(),
                orderNumber: shipment.orderNumber,
                source: 'shipment_derived',
                hasEmail: !!email,
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
              console.warn(`[syncShipstationCustomers] Ambiguous match for shipment ${shipment.id}`);
              lastProcessedId = shipment.id;
              continue; // Don't update shipment's customerId
          }

          // Link the shipment to the customer if not already linked
          if (result.customerId && shipment.customerId !== result.customerId) {
            await db.update(shipstationShipments)
              .set({ customerId: result.customerId, updatedAt: new Date() })
              .where(eq(shipstationShipments.id, shipment.id));
          }

          lastProcessedId = shipment.id;
        } catch (err) {
          metrics.errors++;
          console.error(`[syncShipstationCustomers] Error processing shipment ${shipment.id}:`, err);
          lastProcessedId = shipment.id;
        }
      }

      currentCursor.lastProcessedShipmentId = lastProcessedId;
      currentCursor.pagesSynced++;
      currentCursor.lastSuccessAt = new Date().toISOString();

      // If we got less than BATCH_SIZE, we're done
      if (shipments.length < BATCH_SIZE) {
        hasMore = false;
      }

      // Save cursor after each batch
      await updateCursor(currentCursor, shipments.length);

    } catch (err) {
      metrics.errors++;
      console.error('[syncShipstationCustomers] Error in sync loop:', err);
      hasMore = false;
    }
  }

  logSyncMetrics('syncShipstationCustomers', metrics);
  return metrics;
}

// CLI runner
if (process.argv[1]?.includes('syncShipstationCustomers')) {
  const fullSync = process.argv.includes('--full');
  syncShipstationCustomers({ fullSync })
    .then((metrics) => {
      console.log('[syncShipstationCustomers] Done:', metrics);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[syncShipstationCustomers] Failed:', err);
      process.exit(1);
    });
}
