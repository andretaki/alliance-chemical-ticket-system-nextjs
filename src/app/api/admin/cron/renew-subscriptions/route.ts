import { NextResponse } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db, subscriptions } from '@/lib/db';
import { eq, and, lt, gt } from 'drizzle-orm';

// This route should be called by a cron job service (like Vercel Cron Jobs)
// Configure it to run daily to check for expiring subscriptions

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  console.log('CRON: Starting subscription renewal process...');
  
  try {
    // Get subscriptions that expire within the next 24 hours
    const now = new Date();
    const expirationWindow = new Date(now);
    expirationWindow.setHours(expirationWindow.getHours() + 24);
    
    const expiringSubscriptions = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.isActive, true),
        lt(subscriptions.expirationDateTime, expirationWindow),
        gt(subscriptions.expirationDateTime, now)
      )
    });
    
    console.log(`CRON: Found ${expiringSubscriptions.length} subscription(s) expiring soon.`);
    
    let renewed = 0;
    let failed = 0;
    
    // Process each subscription
    for (const subscription of expiringSubscriptions) {
      try {
        console.log(`CRON: Renewing subscription ${subscription.subscriptionId}...`);
        
        // Renew using Graph API
        const renewedSubscription = await graphService.renewSubscription(subscription.subscriptionId);
        
        if (renewedSubscription) {
          // Update database record
          await db.update(subscriptions)
            .set({
              expirationDateTime: new Date(renewedSubscription.expirationDateTime),
              updatedAt: new Date(),
              renewalCount: subscription.renewalCount + 1
            })
            .where(eq(subscriptions.subscriptionId, subscription.subscriptionId));
          
          console.log(`CRON: Successfully renewed subscription ${subscription.subscriptionId}.`);
          renewed++;
        } else {
          console.error(`CRON: Failed to renew subscription ${subscription.subscriptionId}.`);
          failed++;
        }
      } catch (error) {
        console.error(`CRON: Error processing subscription ${subscription.subscriptionId}:`, error);
        failed++;
      }
    }
    
    // Return summary
    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      renewed,
      failed,
      total: expiringSubscriptions.length,
      message: `Renewed ${renewed} subscription(s). Failed to renew ${failed} subscription(s).`
    });
  } catch (error: any) {
    console.error('CRON: Error in subscription renewal process:', error);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error',
      message: 'Failed to process subscription renewals'
    }, { status: 500 });
  }
} 