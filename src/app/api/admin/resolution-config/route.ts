import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { kv } from '@vercel/kv';
import { authOptions } from '@/lib/authOptions';
import { ResolutionConfig, DEFAULT_RESOLUTION_CONFIG } from '@/types/resolution';

// KV storage key
const RESOLUTION_CONFIG_KEY = 'ticket:resolution:config';

/**
 * GET handler to retrieve resolution configuration
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin status
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Get config from KV storage
    let config = await kv.get<ResolutionConfig>(RESOLUTION_CONFIG_KEY);
    
    // If no config exists, use default and save it
    if (!config) {
      config = DEFAULT_RESOLUTION_CONFIG;
      await kv.set(RESOLUTION_CONFIG_KEY, config);
    }
    
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error retrieving resolution configuration:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST handler to update resolution configuration
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication and admin status
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Get request body
    const body = await req.json();
    
    // Validate the incoming configuration
    if (typeof body.autoCloseEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid autoCloseEnabled value' }, { status: 400 });
    }
    
    if (typeof body.inactivityDays !== 'number' || body.inactivityDays < 1 || body.inactivityDays > 30) {
      return NextResponse.json({ error: 'Invalid inactivityDays value. Must be between 1-30.' }, { status: 400 });
    }
    
    if (!['high', 'medium', 'low'].includes(body.confidenceThreshold)) {
      return NextResponse.json({ error: 'Invalid confidenceThreshold value' }, { status: 400 });
    }
    
    if (typeof body.maxTicketsPerBatch !== 'number' || body.maxTicketsPerBatch < 10 || body.maxTicketsPerBatch > 200) {
      return NextResponse.json({ error: 'Invalid maxTicketsPerBatch value. Must be between 10-200.' }, { status: 400 });
    }
    
    // Create validated config object
    const newConfig: ResolutionConfig = {
      autoCloseEnabled: body.autoCloseEnabled,
      inactivityDays: body.inactivityDays,
      confidenceThreshold: body.confidenceThreshold,
      maxTicketsPerBatch: body.maxTicketsPerBatch,
      sendCustomerNotification: body.sendCustomerNotification ?? DEFAULT_RESOLUTION_CONFIG.sendCustomerNotification,
      includeSurveyLink: body.includeSurveyLink ?? DEFAULT_RESOLUTION_CONFIG.includeSurveyLink,
      surveyUrl: body.surveyUrl ?? DEFAULT_RESOLUTION_CONFIG.surveyUrl
    };
    
    // Save to KV storage
    await kv.set(RESOLUTION_CONFIG_KEY, newConfig);
    
    return NextResponse.json({ 
      success: true,
      message: 'Resolution configuration updated successfully',
      config: newConfig
    });
  } catch (error) {
    console.error('Error updating resolution configuration:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 