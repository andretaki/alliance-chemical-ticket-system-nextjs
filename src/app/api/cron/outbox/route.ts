import { processOutboxBatch } from '@/jobs/outboxProcessor';
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
    await processOutboxBatch();
    logInfo('cron.outbox.success');
    return apiSuccess({ processed: true });
  } catch (err) {
    logError('cron.outbox.error', { error: err instanceof Error ? err.message : String(err) });
    return apiError('cron_failed', 'Failed to process outbox', null, { status: 500 });
  }
}
