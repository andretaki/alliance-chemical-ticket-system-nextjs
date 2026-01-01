import { NextResponse } from 'next/server';
import { syncAmazonOrders } from '@/jobs/syncAmazonOrders';

// This is a Vercel Cron Job handler
// The cron schedule is configured in vercel.json
export const runtime = 'nodejs';

// Increase timeout for large syncs
export const maxDuration = 300; // 5 minutes

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await syncAmazonOrders({
      maxPages: 20, // Higher limit for cron runs
      sinceDays: 30,
    });

    return NextResponse.json({
      success: result.success,
      message: result.success ? 'Amazon order sync completed successfully' : 'Amazon order sync failed',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] Amazon order sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Amazon order sync failed',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
