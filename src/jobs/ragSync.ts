import {
  syncAllCoreSources,
  syncGraphEmails,
  syncQboEstimates,
  syncQboInvoices,
  syncShipstationShipments,
} from '@/services/rag/ragSyncService';
import { syncShopifyOrders } from './syncShopifyOrders';
import { syncAmazonOrders } from './syncAmazonOrders';
import { syncCustomers } from './syncCustomers';

export async function syncRagSources() {
  console.log('[ragSync] Starting RAG sync...');

  // CRITICAL: Sync customers FIRST so downstream inserts can link customerId
  // Order: QBO -> Shopify -> Amazon -> ShipStation
  console.log('[ragSync] === Phase 1: Customer Identity Sync ===');
  const customerResult = await syncCustomers();
  console.log('[ragSync] Customer sync complete:', customerResult.totals);

  // Sync commerce data from external providers (cursor-based incremental)
  console.log('\n[ragSync] === Phase 2: Order/Shipment Sync ===');
  console.log('[ragSync] Syncing Shopify orders...');
  await syncShopifyOrders();

  console.log('[ragSync] Syncing Amazon orders...');
  await syncAmazonOrders();

  // Sync core sources and RAG documents
  console.log('\n[ragSync] === Phase 3: RAG Document Sync ===');
  await syncAllCoreSources();
  await syncQboInvoices();
  await syncQboEstimates();
  await syncShipstationShipments();
  await syncGraphEmails();
  console.log('[ragSync] Completed.');
}

if (process.argv[1]?.includes('ragSync')) {
  syncRagSources().catch((error) => {
    console.error('[ragSync] Failed:', error);
    process.exit(1);
  });
}
