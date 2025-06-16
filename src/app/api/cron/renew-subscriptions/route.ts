import { NextResponse } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db, subscriptions } from '@/lib/db';
import { and, eq, lt, gt } from 'drizzle-orm';
import * as subscriptionManager from '@/lib/graphSubscriptionManager';

// Verify the request is from Vercel Cron
function isValidCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  // Verify this is a valid cron request
  if (!isValidCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let allActiveSubscriptions: any[] = [];

  try {
    console.log('CRON: Starting subscription renewal check...');

    // First, check if we have any active subscriptions at all
    allActiveSubscriptions = await db.query.subscriptions.findMany({
      where: eq(subscriptions.isActive, true)
    });

    console.log(`CRON: Found ${allActiveSubscriptions.length} total active subscriptions`);

    // If no active subscriptions exist, create one
    if (allActiveSubscriptions.length === 0) {
      console.log('CRON: No active subscriptions found, creating new one...');
      try {
        const newSubscription = await subscriptionManager.ensureActiveSubscription();
        if (newSubscription) {
          // Save to database
          await db.insert(subscriptions).values({
            subscriptionId: newSubscription.id,
            resource: newSubscription.resource,
            changeType: newSubscription.changeType,
            expirationDateTime: new Date(newSubscription.expirationDateTime),
            clientState: newSubscription.clientState,
            notificationUrl: newSubscription.notificationUrl,
            creatorId: 'ae5f0d83-e175-44c8-8041-e0117d2c6924', // System user
            isActive: true,
            renewalCount: 0
          });
          console.log(`CRON: Created and saved new subscription ${newSubscription.id}`);
        }
      } catch (createError) {
        console.error('CRON: Failed to create new subscription:', createError);
      }
    }

    // Get subscriptions that expire in the next 24 hours
    const expiringSoon = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.isActive, true),
        lt(subscriptions.expirationDateTime, new Date(Date.now() + 24 * 60 * 60 * 1000)),
        gt(subscriptions.expirationDateTime, new Date())
      )
    });

    console.log(`CRON: Found ${expiringSoon.length} subscriptions expiring soon`);

    for (const subscription of expiringSoon) {
      try {
        console.log(`CRON: Renewing subscription ${subscription.subscriptionId}...`);
        
        // Renew using Graph API
        const renewedSubscription = await graphService.renewSubscription(
          subscription.subscriptionId
        );

        if (renewedSubscription) {
          // Update the subscription in the database
          await db.update(subscriptions)
            .set({
              expirationDateTime: new Date(renewedSubscription.expirationDateTime),
              updatedAt: new Date()
            })
            .where(eq(subscriptions.id, subscription.id));

          console.log(`Successfully renewed subscription ${subscription.subscriptionId}`);
        } else {
          console.error(`Failed to renew subscription ${subscription.subscriptionId}`);
        }
      } catch (error) {
        console.error(`Error renewing subscription ${subscription.subscriptionId}:`, error);
      }
    }

    return NextResponse.json({ 
      message: 'Subscription maintenance completed',
      renewedCount: expiringSoon.length,
      totalActiveCount: allActiveSubscriptions.length
    });
  } catch (error) {
    console.error('Error in subscription renewal cron job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 