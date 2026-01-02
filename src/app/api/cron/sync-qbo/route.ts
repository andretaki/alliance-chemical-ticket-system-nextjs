import { syncQboCustomerSnapshots } from '@/jobs/syncQboCustomerSnapshots';
import { resetPaidLateFlags } from '@/jobs/arLateJob';
import { logError, logInfo } from '@/utils/logger';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * QBO Sync Cron Job
 *
 * This endpoint should be called by an external scheduler (e.g., Vercel Cron, AWS EventBridge)
 * to sync QuickBooks Online customer AR snapshots.
 *
 * Recommended schedule: Every 4 hours
 *
 * Also resets lateFlag for orders that have been paid (synced from QBO).
 */
export async function GET(request: Request) {
  // Validate cron secret
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    // 1. Sync QBO customer snapshots
    await syncQboCustomerSnapshots();

    // 2. Reset late flags for orders that have been paid
    // This catches cases where QBO sync updates financial status
    const resetCount = await resetPaidLateFlags();

    logInfo('cron.sync_qbo.success', { resetPaidLateFlags: resetCount });
    return apiSuccess({ synced: true, resetPaidLateFlags: resetCount });
  } catch (err) {
    logError('cron.sync_qbo.error', { error: err instanceof Error ? err.message : String(err) });
    return apiError('cron_failed', 'Failed to sync QBO', null, { status: 500 });
  }
}
