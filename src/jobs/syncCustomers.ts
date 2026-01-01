/**
 * Customer Sync Orchestrator
 *
 * Runs all provider-specific customer sync jobs in the correct order:
 * 1. QBO (primary source of truth for existing customers)
 * 2. Shopify (ecommerce customers)
 * 3. Amazon (derived from orders, may have restricted PII)
 * 4. ShipStation (derived from shipments)
 *
 * This order ensures that customers from more authoritative sources (QBO, Shopify)
 * are created first, so that Amazon/ShipStation orders can link to them via email.
 */

import { syncQboCustomers } from './syncQboCustomers';
import { syncShopifyCustomers } from './syncShopifyCustomers';
import { syncAmazonCustomers } from './syncAmazonCustomers';
import { syncShipstationCustomers } from './syncShipstationCustomers';
import { type SyncMetrics, createSyncMetrics } from '@/services/crm/identityService';

export interface CustomerSyncResult {
  qbo: SyncMetrics;
  shopify: SyncMetrics;
  amazon: SyncMetrics;
  shipstation: SyncMetrics;
  totals: SyncMetrics;
  durationMs: number;
}

function aggregateMetrics(results: SyncMetrics[]): SyncMetrics {
  return results.reduce(
    (acc, m) => ({
      fetched: acc.fetched + m.fetched,
      created: acc.created + m.created,
      updated: acc.updated + m.updated,
      linked: acc.linked + m.linked,
      unlinked: acc.unlinked + m.unlinked,
      ambiguous: acc.ambiguous + m.ambiguous,
      errors: acc.errors + m.errors,
    }),
    createSyncMetrics()
  );
}

export async function syncCustomers(options: { fullSync?: boolean } = {}): Promise<CustomerSyncResult> {
  const startTime = Date.now();
  console.log('[syncCustomers] Starting customer sync orchestration...');
  console.log(`[syncCustomers] Mode: ${options.fullSync ? 'FULL SYNC' : 'INCREMENTAL'}`);

  // 1. QBO - Primary source of truth
  console.log('\n[syncCustomers] === Phase 1: QBO Customers ===');
  const qboResult = await syncQboCustomers({ fullSync: options.fullSync });

  // 2. Shopify - Ecommerce customers
  console.log('\n[syncCustomers] === Phase 2: Shopify Customers ===');
  const shopifyResult = await syncShopifyCustomers({ fullSync: options.fullSync });

  // 3. Amazon - Derived from orders (may have restricted PII)
  console.log('\n[syncCustomers] === Phase 3: Amazon Customers (from orders) ===');
  const amazonResult = await syncAmazonCustomers({ fullSync: options.fullSync });

  // 4. ShipStation - Derived from shipments
  console.log('\n[syncCustomers] === Phase 4: ShipStation Customers (from shipments) ===');
  const shipstationResult = await syncShipstationCustomers({ fullSync: options.fullSync });

  const durationMs = Date.now() - startTime;
  const totals = aggregateMetrics([qboResult, shopifyResult, amazonResult, shipstationResult]);

  console.log('\n[syncCustomers] === Sync Complete ===');
  console.log(`[syncCustomers] Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log('[syncCustomers] Totals:', totals);

  return {
    qbo: qboResult,
    shopify: shopifyResult,
    amazon: amazonResult,
    shipstation: shipstationResult,
    totals,
    durationMs,
  };
}

// CLI runner
if (process.argv[1]?.includes('syncCustomers')) {
  const fullSync = process.argv.includes('--full');
  syncCustomers({ fullSync })
    .then((result) => {
      console.log('\n[syncCustomers] Final Results:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[syncCustomers] Failed:', err);
      process.exit(1);
    });
}
