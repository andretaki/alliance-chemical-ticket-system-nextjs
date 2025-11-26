import { NextResponse } from 'next/server';
import { enqueueLateOrders } from '@/jobs/arLateJob';
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
    const count = await enqueueLateOrders();
    logInfo('cron.ar_late.success', { queued: count });
    return NextResponse.json({ success: true, queued: count });
  } catch (err) {
    logError('cron.ar_late.error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to process AR late orders' }, { status: 500 });
  }
}
