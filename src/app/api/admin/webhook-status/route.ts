import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import * as graphService from '@/lib/graphService';

export async function GET(request: NextRequest) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check webhook status by testing Graph API connectivity
    const webhookStatus = {
      isConnected: false,
      lastChecked: new Date().toISOString(),
      error: null as string | null,
      subscriptions: [] as any[],
    };

    try {
      // Test Graph API connectivity
      const subscriptions = await graphService.listSubscriptions();
      webhookStatus.isConnected = true;
      webhookStatus.subscriptions = subscriptions || [];
      
      console.log('Webhook status check: SUCCESS - Graph API accessible');
    } catch (error: any) {
      webhookStatus.isConnected = false;
      webhookStatus.error = error.message || 'Failed to connect to Graph API';
      console.error('Webhook status check: FAILED -', error);
    }

    // Additional status info with correct environment variable names
    const statusInfo = {
      webhookEndpoint: '/api/webhook/graph-notifications',
      environment: process.env.NODE_ENV,
      tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID ? '***configured***' : 'NOT SET',
      clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID ? '***configured***' : 'NOT SET',
      hasClientSecret: !!process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
      sharedMailbox: process.env.SHARED_MAILBOX_ADDRESS ? '***configured***' : 'NOT SET',
    };

    return NextResponse.json({
      ...webhookStatus,
      info: statusInfo,
    });

  } catch (error) {
    console.error('Error checking webhook status:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
} 