import { NextResponse } from 'next/server';
import { processOutboxBatch } from '@/jobs/outboxProcessor';
import { logError, logInfo } from '@/utils/logger';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    await processOutboxBatch();
    logInfo('cron.outbox.success');
    return NextResponse.json({ success: true });
  } catch (err) {
    logError('cron.outbox.error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to process outbox' }, { status: 500 });
  }
}
