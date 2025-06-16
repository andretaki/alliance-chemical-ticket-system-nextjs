// scripts/renewSubscriptions.ts
import 'dotenv/config';
import * as graphService from '../src/lib/graphService.js';
import { db } from '../src/lib/db.js';
import { subscriptions } from '../src/db/schema.js';
import { eq, and, lt, gt } from 'drizzle-orm';

// Function to renew subscriptions that are about to expire
async function renewExpiringSubscriptions() {
  console.log('Starting subscription renewal check...');
  
  try {
    // Get the current time and calculate future times
    const now = new Date();
    const hoursBeforeExpiration = 24; // Renew subscriptions 24 hours before expiration
    
    // Calculate the expiration window (now + hoursBeforeExpiration)
    const expirationWindow = new Date(now);
    expirationWindow.setHours(expirationWindow.getHours() + hoursBeforeExpiration);
    
    // Query for subscriptions that are:
    // 1. Active
    // 2. Expire in the next X hours
    // 3. Haven't expired yet
    const expiringSubscriptions = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.isActive, true),
        lt(subscriptions.expirationDateTime, expirationWindow),
        gt(subscriptions.expirationDateTime, now)
      )
    });
    
    console.log(`Found ${expiringSubscriptions.length} subscription(s) expiring in the next ${hoursBeforeExpiration} hours.`);
    
    if (expiringSubscriptions.length === 0) {
      return { renewed: 0, failed: 0, message: 'No subscriptions need renewal at this time.' };
    }
    
    let renewedCount = 0;
    let failedCount = 0;
    
    // Process each expiring subscription
    for (const subscription of expiringSubscriptions) {
      console.log(`Renewing subscription ${subscription.subscriptionId}...`);
      console.log(`- Current expiration: ${subscription.expirationDateTime.toLocaleString()}`);
      
      try {
        // Renew the subscription with Microsoft Graph
        const renewedSubscription = await graphService.renewSubscription(subscription.subscriptionId);
        
        if (!renewedSubscription) {
          console.error(`Failed to renew subscription ${subscription.subscriptionId}.`);
          failedCount++;
          continue;
        }
        
        // Update the subscription in the database
        await db.update(subscriptions)
          .set({
            expirationDateTime: new Date(renewedSubscription.expirationDateTime),
            updatedAt: new Date(),
            renewalCount: subscription.renewalCount + 1
          })
          .where(eq(subscriptions.subscriptionId, subscription.subscriptionId));
        
        console.log(`Successfully renewed subscription ${subscription.subscriptionId}.`);
        console.log(`- New expiration: ${new Date(renewedSubscription.expirationDateTime).toLocaleString()}`);
        renewedCount++;
      } catch (renewError) {
        console.error(`Error renewing subscription ${subscription.subscriptionId}:`, renewError);
        failedCount++;
        
        // Optionally: Set isActive to false if renewal failed due to a permanent error
        // await db.update(subscriptions)
        //  .set({ isActive: false, updatedAt: new Date() })
        //  .where(eq(subscriptions.subscriptionId, subscription.subscriptionId));
      }
    }
    
    console.log(`Renewal process complete. Renewed: ${renewedCount}, Failed: ${failedCount}`);
    return {
      renewed: renewedCount,
      failed: failedCount,
      message: `Renewed ${renewedCount} subscription(s). Failed to renew ${failedCount} subscription(s).`
    };
  } catch (error: unknown) {
    console.error('Error during subscription renewal:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      renewed: 0,
      failed: -1,
      message: `Error during renewal process: ${errorMessage}`
    };
  }
}

// Execute the renewal process
async function main() {
  console.log('=== Microsoft Graph Subscription Renewal ===');
  console.log('Started at:', new Date().toLocaleString());
  
  try {
    const result = await renewExpiringSubscriptions();
    console.log('\nSummary:', result.message);
    
    if (result.failed > 0) {
      console.warn('Warning: Some subscriptions failed to renew. Check the logs for details.');
      process.exit(1); // Optional: exit with error code if renewals failed
    }
    
    console.log('Completed at:', new Date().toLocaleString());
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during renewal process:', error);
    process.exit(1);
  }
}

// Run the script
main(); 