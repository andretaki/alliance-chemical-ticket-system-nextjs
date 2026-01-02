import { enqueueLateOrders } from '@/jobs/arLateJob';
import { logError, logInfo } from '@/utils/logger';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Validate cron secret
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    const count = await enqueueLateOrders();
    logInfo('cron.ar_late.success', { queued: count });
    return apiSuccess({ queued: count });
  } catch (err) {
    logError('cron.ar_late.error', { error: err instanceof Error ? err.message : String(err) });
    return apiError('cron_failed', 'Failed to process AR late orders', null, { status: 500 });
  }
}
