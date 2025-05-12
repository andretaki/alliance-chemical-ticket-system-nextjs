import { NextRequest, NextResponse } from 'next/server';
import { updateResolutionMetrics } from '@/utils/resolutionMetricsUtil';

/**
 * Cron handler for updating resolution metrics
 * This API is meant to be called by a scheduled job to
 * regularly update the metrics for dashboard display
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authorization - check for API key
    const authHeader = req.headers.get('authorization');
    const apiKey = process.env.CRON_SECRET;
    
    if (!apiKey) {
      console.error('Missing CRON_SECRET environment variable');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    if (authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Update metrics
    console.log('Starting metrics update...');
    const metrics = await updateResolutionMetrics();
    
    // Return results
    return NextResponse.json({
      success: true,
      message: 'Metrics update completed',
      metrics
    });
  } catch (error) {
    console.error('Error in cron job for metrics update:', error);
    return NextResponse.json({ 
      error: 'Failed to update metrics', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Disable Next.js default body parsing for this route
 */
export const config = {
  api: {
    bodyParser: false,
  },
}; 