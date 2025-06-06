import { NextResponse } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db, subscriptions } from '@/lib/db';
import { and, eq, lt, gt } from 'drizzle-orm';

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

  try {
    console.log('Starting subscription renewal check...');

    // Get subscriptions that expire in the next 24 hours
    const expiringSoon = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.isActive, true),
        lt(subscriptions.expirationDateTime, new Date(Date.now() + 24 * 60 * 60 * 1000)),
        gt(subscriptions.expirationDateTime, new Date())
      )
    });

    console.log(`Found ${expiringSoon.length} subscriptions expiring soon`);

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
      message: 'Subscription renewal check completed',
      renewedCount: expiringSoon.length
    });
  } catch (error) {
    console.error('Error in subscription renewal cron job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 