import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { kv } from '@vercel/kv';
import { ResolutionConfig, DEFAULT_RESOLUTION_CONFIG } from '@/types/resolution';

// KV storage key
const RESOLUTION_CONFIG_KEY = 'ticket:resolution:config';

/**
 * GET handler to retrieve resolution configuration
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin status
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
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
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
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
    
    // Validate new AI-specific configuration fields
    if (body.autoCloseOnlyIfAgentRespondedLast !== undefined && typeof body.autoCloseOnlyIfAgentRespondedLast !== 'boolean') {
      return NextResponse.json({ error: 'Invalid autoCloseOnlyIfAgentRespondedLast value' }, { status: 400 });
    }
    
    if (body.minimumConversationTurnsForAI !== undefined && (typeof body.minimumConversationTurnsForAI !== 'number' || body.minimumConversationTurnsForAI < 1 || body.minimumConversationTurnsForAI > 10)) {
      return NextResponse.json({ error: 'Invalid minimumConversationTurnsForAI value. Must be between 1-10.' }, { status: 400 });
    }
    
    if (body.inactivityDaysForConfidentClosure !== undefined && (typeof body.inactivityDaysForConfidentClosure !== 'number' || body.inactivityDaysForConfidentClosure < 1 || body.inactivityDaysForConfidentClosure > 14)) {
      return NextResponse.json({ error: 'Invalid inactivityDaysForConfidentClosure value. Must be between 1-14.' }, { status: 400 });
    }
    
    if (body.enableAutoFollowUp !== undefined && typeof body.enableAutoFollowUp !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enableAutoFollowUp value' }, { status: 400 });
    }
    
    if (body.analyzeLowActivityTickets !== undefined && typeof body.analyzeLowActivityTickets !== 'boolean') {
      return NextResponse.json({ error: 'Invalid analyzeLowActivityTickets value' }, { status: 400 });
    }
    
    // Create validated config object with all fields
    const newConfig: ResolutionConfig = {
      autoCloseEnabled: body.autoCloseEnabled,
      inactivityDays: body.inactivityDays,
      confidenceThreshold: body.confidenceThreshold,
      maxTicketsPerBatch: body.maxTicketsPerBatch,
      sendCustomerNotification: body.sendCustomerNotification ?? DEFAULT_RESOLUTION_CONFIG.sendCustomerNotification,
      includeSurveyLink: body.includeSurveyLink ?? DEFAULT_RESOLUTION_CONFIG.includeSurveyLink,
      surveyUrl: body.surveyUrl ?? DEFAULT_RESOLUTION_CONFIG.surveyUrl,
      autoCloseOnlyIfAgentRespondedLast: body.autoCloseOnlyIfAgentRespondedLast ?? DEFAULT_RESOLUTION_CONFIG.autoCloseOnlyIfAgentRespondedLast,
      minimumConversationTurnsForAI: body.minimumConversationTurnsForAI ?? DEFAULT_RESOLUTION_CONFIG.minimumConversationTurnsForAI,
      inactivityDaysForConfidentClosure: body.inactivityDaysForConfidentClosure ?? DEFAULT_RESOLUTION_CONFIG.inactivityDaysForConfidentClosure,
      enableAutoFollowUp: body.enableAutoFollowUp ?? DEFAULT_RESOLUTION_CONFIG.enableAutoFollowUp,
      analyzeLowActivityTickets: body.analyzeLowActivityTickets ?? DEFAULT_RESOLUTION_CONFIG.analyzeLowActivityTickets
    };
    
    // Save to KV storage
    await kv.set(RESOLUTION_CONFIG_KEY, newConfig);
    
    console.log('Resolution configuration updated:', {
      autoCloseEnabled: newConfig.autoCloseEnabled,
      confidenceThreshold: newConfig.confidenceThreshold,
      minimumConversationTurns: newConfig.minimumConversationTurnsForAI,
      enableAutoFollowUp: newConfig.enableAutoFollowUp
    });
    
    return NextResponse.json({ 
      success: true,
      message: 'Enhanced resolution configuration updated successfully',
      config: newConfig
    });
  } catch (error) {
    console.error('Error updating resolution configuration:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 