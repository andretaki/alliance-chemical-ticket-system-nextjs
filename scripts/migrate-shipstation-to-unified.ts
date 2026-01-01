/**
 * Migration Script: ShipStation Shipments → Unified Shipments Table
 *
 * This script migrates existing data from shipstation_shipments to the new
 * unified shipments table. It also links shipments to orders where possible.
 *
 * Usage: npx tsx scripts/migrate-shipstation-to-unified.ts
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --batch=N    Process N records at a time (default: 100)
 */

import { db } from '../src/lib/db';
import { shipstationShipments, shipments, orders } from '../src/db/schema';
import { eq, isNull, sql } from 'drizzle-orm';

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  linkedToOrders: number;
}

async function migrateShipstationToUnified(options: {
  dryRun?: boolean;
  batchSize?: number;
} = {}): Promise<MigrationStats> {
  const { dryRun = false, batchSize = 100 } = options;

  console.log(`[migrate-shipstation] Starting migration${dryRun ? ' (DRY RUN)' : ''}...`);

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    linkedToOrders: 0,
  };

  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(shipstationShipments);
  stats.total = countResult?.count ?? 0;

  console.log(`[migrate-shipstation] Found ${stats.total} shipments to process`);

  if (stats.total === 0) {
    console.log('[migrate-shipstation] No shipments to migrate');
    return stats;
  }

  // Process in batches
  let offset = 0;

  while (offset < stats.total) {
    const batch = await db.select()
      .from(shipstationShipments)
      .limit(batchSize)
      .offset(offset);

    if (batch.length === 0) break;

    for (const shipment of batch) {
      try {
        // Check if already migrated (by checking if external_id exists in shipments)
        const existingInUnified = await db.query.shipments.findFirst({
          where: eq(shipments.externalId, String(shipment.shipstationShipmentId)),
          columns: { id: true },
        });

        if (existingInUnified) {
          stats.skipped += 1;
          continue;
        }

        // Try to link to order by orderNumber
        let orderId: number | null = null;
        if (shipment.orderNumber) {
          const linkedOrder = await db.query.orders.findFirst({
            where: eq(orders.orderNumber, shipment.orderNumber),
            columns: { id: true },
          });
          if (linkedOrder) {
            orderId = linkedOrder.id;
            stats.linkedToOrders += 1;
          }
        }

        if (!dryRun) {
          // Insert into unified shipments table
          await db.insert(shipments).values({
            customerId: shipment.customerId,
            orderId,
            provider: 'shipstation',
            externalId: String(shipment.shipstationShipmentId),
            orderNumber: shipment.orderNumber,
            trackingNumber: shipment.trackingNumber,
            carrierCode: shipment.carrierCode,
            serviceCode: shipment.serviceCode,
            shipDate: shipment.shipDate,
            estimatedDeliveryDate: shipment.deliveryDate, // ShipStation uses deliveryDate for estimated
            actualDeliveryDate: null,
            status: shipment.status,
            cost: shipment.cost,
            weight: shipment.weight,
            weightUnit: shipment.weightUnit,
            metadata: {
              shipstationShipmentId: Number(shipment.shipstationShipmentId),
              shipstationOrderId: shipment.shipstationOrderId ? Number(shipment.shipstationOrderId) : null,
              ...(shipment.metadata as Record<string, unknown> || {}),
            },
            createdAt: shipment.createdAt,
            updatedAt: shipment.updatedAt,
          }).onConflictDoNothing();

          // Update shipstation_shipments with order_id FK for reference
          if (orderId && !shipment.orderId) {
            await db.update(shipstationShipments)
              .set({ orderId })
              .where(eq(shipstationShipments.id, shipment.id));
          }
        }

        stats.migrated += 1;
      } catch (err) {
        console.error(`[migrate-shipstation] Failed to migrate shipment ${shipment.id} (${shipment.shipstationShipmentId}):`, err);
        stats.failed += 1;
      }
    }

    offset += batchSize;
    console.log(`[migrate-shipstation] Progress: ${Math.min(offset, stats.total)}/${stats.total}`);
  }

  console.log('\n[migrate-shipstation] Migration complete!');
  console.log(`  Total:           ${stats.total}`);
  console.log(`  Migrated:        ${stats.migrated}`);
  console.log(`  Skipped:         ${stats.skipped} (already in unified table)`);
  console.log(`  Failed:          ${stats.failed}`);
  console.log(`  Linked to order: ${stats.linkedToOrders}`);

  return stats;
}

async function verifyMigration(): Promise<void> {
  console.log('\n[migrate-shipstation] Verifying migration...');

  // Count in both tables
  const [ssCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(shipstationShipments);
  const [unifiedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(shipments)
    .where(eq(shipments.provider, 'shipstation'));

  console.log(`  ShipStation shipments table: ${ssCount?.count ?? 0}`);
  console.log(`  Unified shipments (provider=shipstation): ${unifiedCount?.count ?? 0}`);

  // Check for unlinked shipments
  const [unlinkedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(shipments)
    .where(isNull(shipments.orderId));

  console.log(`  Shipments not linked to orders: ${unlinkedCount?.count ?? 0}`);
}

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchArg = args.find(a => a.startsWith('--batch='));
const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 100;

// Run migration
migrateShipstationToUnified({ dryRun, batchSize })
  .then(async (stats) => {
    if (!dryRun && stats.migrated > 0) {
      await verifyMigration();
    }
    process.exit(stats.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('[migrate-shipstation] Fatal error:', err);
    process.exit(1);
  });
