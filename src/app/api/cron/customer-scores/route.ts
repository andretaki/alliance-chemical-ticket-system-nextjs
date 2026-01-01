import { NextResponse } from 'next/server';
import { calculateCustomerScores } from '@/jobs/calculateCustomerScores';
import { logError, logInfo } from '@/utils/logger';

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
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    logInfo('cron.customer_scores.start', {});
    await calculateCustomerScores();
    logInfo('cron.customer_scores.success', {});
    return NextResponse.json({ success: true });
  } catch (err) {
    logError('cron.customer_scores.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to calculate customer scores' }, { status: 500 });
  }
}
