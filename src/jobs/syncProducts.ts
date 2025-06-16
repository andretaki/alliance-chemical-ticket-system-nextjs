import { ProductSyncService } from '@/services/shopify/ProductSyncService';
import { schedule } from 'node-cron';

export function startProductSyncJob() {
  // Run every day at 2 AM
  schedule('0 2 * * *', async () => {
    console.log('Starting product sync job...');
    try {
      const syncService = new ProductSyncService();
      await syncService.syncProducts();
      console.log('Product sync completed successfully');
    } catch (error) {
      console.error('Product sync failed:', error);
    }
  });
} 