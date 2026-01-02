import { NextRequest } from 'next/server';
import { updateResolutionMetrics } from '@/utils/resolutionMetricsUtil';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

/**
 * Cron handler for updating resolution metrics
 * This API is meant to be called by a scheduled job to
 * regularly update the metrics for dashboard display
 */
export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    console.log('Starting metrics update...');
    const metrics = await updateResolutionMetrics();

    return apiSuccess({ updated: true, metrics });
  } catch (error) {
    console.error('Error in cron job for metrics update:', error);
    return apiError(
      'cron_failed',
      'Failed to update metrics',
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 