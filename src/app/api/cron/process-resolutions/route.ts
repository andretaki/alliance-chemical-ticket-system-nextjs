import { NextRequest, NextResponse } from 'next/server';
import { checkTicketsForResolution } from '@/lib/ticketResolutionAgent';

/**
 * Cron handler for ticket resolution processing
 * This API is meant to be called by a scheduled job to regularly check for
 * tickets that can be resolved automatically
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
    
    // Process resolutions
    console.log('Starting scheduled ticket resolution check...');
    const result = await checkTicketsForResolution();
    
    // Return results
    return NextResponse.json({
      success: true,
      message: 'Ticket resolution check completed',
      result
    });
  } catch (error) {
    console.error('Error in cron job for ticket resolution processing:', error);
    return NextResponse.json({ 
      error: 'Failed to process resolutions', 
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