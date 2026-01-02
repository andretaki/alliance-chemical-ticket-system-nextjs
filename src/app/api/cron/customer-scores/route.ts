import { calculateCustomerScores } from '@/jobs/calculateCustomerScores';
import { logError, logInfo } from '@/utils/logger';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for scoring job

/**
 * Cron endpoint to calculate customer RFM scores, health scores, and churn risk.
 * Also creates tasks for stale quotes and rising churn.
 *
 * Recommended schedule: Daily at 2am or 3am
 *
 * Example Vercel cron config:
 * {
 *   "crons": [
 *     { "path": "/api/cron/customer-scores", "schedule": "0 3 * * *" }
 *   ]
 * }
 */
export async function GET(request: Request) {
  // Validate cron secret
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    logInfo('cron.customer_scores.start', {});
    await calculateCustomerScores();
    logInfo('cron.customer_scores.success', {});
    return apiSuccess({ calculated: true });
  } catch (err) {
    logError('cron.customer_scores.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError('cron_failed', 'Failed to calculate customer scores', null, { status: 500 });
  }
}
