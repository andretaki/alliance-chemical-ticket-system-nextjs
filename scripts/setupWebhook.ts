// @ts-nocheck
// scripts/setupWebhook.ts
import 'dotenv/config';
import * as graphService from '../src/lib/graphService.js';
import { db } from '../src/db/index.js';
import { subscriptions } from '../src/db/schema.js';

// Validate required environment variables
if (!process.env.NEXT_PUBLIC_APP_URL) {
  console.error('Error: NEXT_PUBLIC_APP_URL environment variable is required.');
  process.exit(1);
}

if (!process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET) {
  console.error('Warning: MICROSOFT_GRAPH_WEBHOOK_SECRET not set. Using a less secure default.');
}

const NOTIFICATION_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/graph-notifications`;

async function main() {
  console.log(`Setting up Microsoft Graph subscription for email notifications...`);
  console.log(`Webhook URL: ${NOTIFICATION_URL}`);
  
  try {
    // 1. Check if we already have active subscriptions
    const existingSubscriptions = await graphService.listSubscriptions();
    console.log(`Found ${existingSubscriptions.length} existing subscription(s).`);
    
    // Cleanup any existing subscriptions that target our webhook URL
    for (const sub of existingSubscriptions) {
      if (sub.notificationUrl === NOTIFICATION_URL) {
        console.log(`Deleting existing subscription ${sub.id} with matching URL...`);
        await graphService.deleteSubscription(sub.id);
      }
    }
    
    // 2. Create a new subscription
    console.log('Creating new subscription...');
    const newSubscription = await graphService.createEmailSubscription(
      NOTIFICATION_URL,
      process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET
    );
    
    if (!newSubscription) {
      console.error('Failed to create subscription.');
      process.exit(1);
    }
    
    console.log(`Subscription created successfully!`);
    console.log(`ID: ${newSubscription.id}`);
    console.log(`Expires: ${new Date(newSubscription.expirationDateTime).toLocaleString()}`);
    
    // 3. Store the subscription in the database
    try {
      const [savedSubscription] = await db.insert(subscriptions).values({
        subscriptionId: newSubscription.id,
        resource: newSubscription.resource,
        changeType: newSubscription.changeType,
        expirationDateTime: new Date(newSubscription.expirationDateTime),
        clientState: newSubscription.clientState,
        notificationUrl: newSubscription.notificationUrl,
        creatorId: newSubscription.creatorId || 'system',
        isActive: true,
      }).returning();
      
      console.log(`Subscription saved to database with ID: ${savedSubscription.id}`);
    } catch (dbError) {
      console.error('Error saving subscription to database:', dbError);
      console.warn('Subscription was created but not saved to database. You may need to manage it manually.');
    }
    
    console.log('\nSetup Complete!');
    console.log('Important: This subscription will expire on', new Date(newSubscription.expirationDateTime).toLocaleString());
    console.log('Make sure to set up renewal logic to keep it active.');
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 