export const runtime = 'nodejs';

import { ProductSyncService } from '@/services/shopify/ProductSyncService';
import { apiSuccess, apiError } from '@/lib/apiResponse';

export async function POST() {
  try {
    // Optional: Add authentication check here
    const syncService = new ProductSyncService();
    const result = await syncService.syncProducts();

    return apiSuccess({
      message: 'Product sync completed successfully',
      data: result
    });
  } catch (error: any) {
    console.error('[API] Product sync failed:', error);
    return apiError('sync_error', 'Product sync failed', { error: error.message }, { status: 500 });
  }
} 