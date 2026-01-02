import { ProductSyncService } from '@/services/shopify/ProductSyncService';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

// This is a Vercel Cron Job handler
// The cron schedule is configured in vercel.json
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    const syncService = new ProductSyncService();
    const result = await syncService.syncProducts();

    return apiSuccess(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] Product sync failed:', error);
    return apiError('cron_failed', 'Product sync failed', { error: errorMessage }, { status: 500 });
  }
} 