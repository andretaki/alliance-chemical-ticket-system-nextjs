import { syncAmazonOrders } from '@/jobs/syncAmazonOrders';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

// This is a Vercel Cron Job handler
// The cron schedule is configured in vercel.json
export const runtime = 'nodejs';

// Increase timeout for large syncs
export const maxDuration = 300; // 5 minutes

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    const result = await syncAmazonOrders({
      maxPages: 20, // Higher limit for cron runs
      sinceDays: 30,
    });

    if (result.success) {
      return apiSuccess(result);
    } else {
      return apiError('sync_failed', 'Amazon order sync failed', result, { status: 500 });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] Amazon order sync failed:', error);
    return apiError('cron_failed', 'Amazon order sync failed', { error: errorMessage }, { status: 500 });
  }
}
