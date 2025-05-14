import { ProductSyncService } from '../services/shopify/ProductSyncService';

async function main() {
  console.log('Starting manual product sync...');
  try {
    const syncService = new ProductSyncService();
    const result = await syncService.syncProducts();
    console.log('Sync completed successfully:', result);
  } catch (error: any) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

main(); 