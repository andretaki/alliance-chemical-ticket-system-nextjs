export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { ProductSyncService } from '@/services/shopify/ProductSyncService';

export async function POST(request: Request) {
  try {
    // Optional: Add authentication check here
    const syncService = new ProductSyncService();
    const result = await syncService.syncProducts();
    
    return NextResponse.json({
      success: true,
      message: 'Product sync completed successfully',
      data: result
    });
  } catch (error: any) {
    console.error('[API] Product sync failed:', error);
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