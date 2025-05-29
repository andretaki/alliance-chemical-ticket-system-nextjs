import { NextResponse } from 'next/server';
import { ProductSyncService } from '@/services/shopify/ProductSyncService';

// This is a Vercel Cron Job handler
// The cron schedule is configured in vercel.json
export const runtime = 'nodejs';

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
    const syncService = new ProductSyncService();
    const result = await syncService.syncProducts();
    
    return NextResponse.json({
      success: true,
      message: 'Product sync completed successfully',
      data: result
    });
  } catch (error: any) {
    console.error('[Cron] Product sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Product sync failed',
        error: error.message
      },
      { status: 500 }
    );
  }
} 