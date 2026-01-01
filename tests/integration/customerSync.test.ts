/**
 * Integration tests for Customer Sync
 *
 * Tests:
 * - syncCustomers twice produces stable counts (idempotent)
 * - Orders/shipments get linked to correct customerId
 * - No cross-customer data leakage
 *
 * NOTE: These tests require a database connection.
 * Run with: npx jest tests/integration/customerSync.test.ts --runInBand
 */

import { db, customers, customerIdentities, orders, shipstationShipments } from '@/lib/db';
import { eq, sql, count, and, isNotNull } from 'drizzle-orm';
import { syncCustomers } from '@/jobs/syncCustomers';

// Skip if no DB connection available
const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe('Customer Sync Integration', () => {
  beforeAll(() => {
    if (!DB_AVAILABLE) {
      console.log('Skipping integration tests: DATABASE_URL not set');
    }
  });

  describe('Idempotency', () => {
    it('should produce stable counts on consecutive runs', async () => {
      if (!DB_AVAILABLE) return;

      // First run
      const result1 = await syncCustomers();
      console.log('First run totals:', result1.totals);

      // Get counts after first run
      const [customerCount1] = await db.select({ count: count() }).from(customers);
      const [identityCount1] = await db.select({ count: count() }).from(customerIdentities);

      // Second run (should be mostly updates, no new creates)
      const result2 = await syncCustomers();
      console.log('Second run totals:', result2.totals);

      // Get counts after second run
      const [customerCount2] = await db.select({ count: count() }).from(customers);
      const [identityCount2] = await db.select({ count: count() }).from(customerIdentities);

      // Customer count should be stable (no duplicates created)
      expect(customerCount2.count).toBe(customerCount1.count);
      expect(identityCount2.count).toBe(identityCount1.count);

      // Second run should have 0 creates (all should be updates)
      expect(result2.totals.created).toBe(0);
    }, 120000); // 2 minute timeout for sync
  });

  describe('Customer Linking', () => {
    it('should link >95% of orders to customers', async () => {
      if (!DB_AVAILABLE) return;

      // Run sync first
      await syncCustomers();

      // Count orders with and without customerId
      const [totalOrders] = await db.select({ count: count() }).from(orders);
      const [linkedOrders] = await db.select({ count: count() })
        .from(orders)
        .where(isNotNull(orders.customerId));

      const linkRate = totalOrders.count > 0
        ? (linkedOrders.count / totalOrders.count) * 100
        : 100;

      console.log(`Order link rate: ${linkRate.toFixed(2)}% (${linkedOrders.count}/${totalOrders.count})`);

      expect(linkRate).toBeGreaterThanOrEqual(95);
    }, 120000);

    it('should link >95% of shipments to customers', async () => {
      if (!DB_AVAILABLE) return;

      // Run sync first
      await syncCustomers();

      // Count shipments with and without customerId
      const [totalShipments] = await db.select({ count: count() }).from(shipstationShipments);
      const [linkedShipments] = await db.select({ count: count() })
        .from(shipstationShipments)
        .where(isNotNull(shipstationShipments.customerId));

      const linkRate = totalShipments.count > 0
        ? (linkedShipments.count / totalShipments.count) * 100
        : 100;

      console.log(`Shipment link rate: ${linkRate.toFixed(2)}% (${linkedShipments.count}/${totalShipments.count})`);

      expect(linkRate).toBeGreaterThanOrEqual(95);
    }, 120000);
  });

  describe('Identity Verification', () => {
    it('should have proper identity types in metadata', async () => {
      if (!DB_AVAILABLE) return;

      // Check that identities have the expected structure
      const identities = await db.query.customerIdentities.findMany({
        limit: 100,
      });

      for (const identity of identities) {
        expect(identity.provider).toBeDefined();

        // If it's an address hash identity, it should have the prefix
        if (identity.externalId?.startsWith('address_hash:')) {
          expect(identity.externalId.length).toBeGreaterThan('address_hash:'.length);
        }
      }
    });

    it('should not have duplicate externalIds per provider', async () => {
      if (!DB_AVAILABLE) return;

      // Check for duplicates
      const duplicates = await db.execute(sql`
        SELECT provider, external_id, COUNT(*) as cnt
        FROM ticketing_prod.customer_identities
        WHERE external_id IS NOT NULL
        GROUP BY provider, external_id
        HAVING COUNT(*) > 1
        LIMIT 10
      `);

      if ((duplicates.rows as any[]).length > 0) {
        console.warn('Duplicate identities found:', duplicates.rows);
      }

      expect((duplicates.rows as any[]).length).toBe(0);
    });
  });

  describe('Customer Scoping Security', () => {
    it('should ensure all orders have valid customerId references', async () => {
      if (!DB_AVAILABLE) return;

      // Find any orders with customerId that doesn't exist in customers table
      const orphanedOrders = await db.execute(sql`
        SELECT o.id, o.customer_id
        FROM ticketing_prod.orders o
        LEFT JOIN ticketing_prod.customers c ON o.customer_id = c.id
        WHERE o.customer_id IS NOT NULL AND c.id IS NULL
        LIMIT 10
      `);

      expect((orphanedOrders.rows as any[]).length).toBe(0);
    });

    it('should ensure all identities have valid customerId references', async () => {
      if (!DB_AVAILABLE) return;

      // Find any identities with customerId that doesn't exist in customers table
      const orphanedIdentities = await db.execute(sql`
        SELECT ci.id, ci.customer_id
        FROM ticketing_prod.customer_identities ci
        LEFT JOIN ticketing_prod.customers c ON ci.customer_id = c.id
        WHERE c.id IS NULL
        LIMIT 10
      `);

      expect((orphanedIdentities.rows as any[]).length).toBe(0);
    });
  });
});

describe('Cursor Inspection', () => {
  it('should display current cursor values', async () => {
    if (!DB_AVAILABLE) return;

    const cursors = await db.execute(sql`
      SELECT source_type, cursor_value, last_success_at, items_synced
      FROM ticketing_prod.rag_sync_cursors
      WHERE source_type IN ('qbo_customer', 'shopify_customer', 'amazon_customer', 'shipstation_customer')
      ORDER BY source_type
    `);

    console.log('Current cursors:');
    for (const row of cursors.rows as any[]) {
      console.log(`  ${row.source_type}:`, {
        cursor: row.cursor_value,
        lastSuccess: row.last_success_at,
        itemsSynced: row.items_synced,
      });
    }

    expect(cursors.rows).toBeDefined();
  });
});
