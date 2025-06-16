import { graphClient, userEmail } from './graphService';

const NOTIFICATION_URL = process.env.NEXT_PUBLIC_APP_URL 
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/graph-notifications` 
  : null;

interface SubscriptionInfo {
  id: string;
  resource: string;
  applicationId: string;
  changeType: string;
  clientState: string;
  notificationUrl: string;
  expirationDateTime: string;
  creatorId: string;
}

/**
 * Creates a new subscription for email notifications
 * @param expirationMinutes How many minutes until the subscription expires (max 4230 minutes / ~3 days for mail)
 * @returns The created subscription object or null if creation failed
 */
export async function createMailSubscription(expirationMinutes = 4000): Promise<SubscriptionInfo | null> {
  if (!NOTIFICATION_URL) {
    console.error('Subscription Manager: Cannot create subscription - NEXT_PUBLIC_APP_URL not set');
    return null;
  }

  try {
    // Calculate expiration time (max ~3 days for mail resources)
    const expirationDateTime = new Date();
    expirationDateTime.setMinutes(expirationDateTime.getMinutes() + expirationMinutes);

    const subscription = {
      changeType: 'created',
      notificationUrl: NOTIFICATION_URL,
      resource: `/users/${userEmail}/messages`,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState: process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET || 'defaultSecretChangeThis',
    };

    console.log(`Subscription Manager: Creating mail subscription with webhook URL: ${NOTIFICATION_URL}`);
    
    const response = await graphClient
      .api('/subscriptions')
      .post(subscription);

    console.log('Subscription Manager: Subscription created successfully:', response);
    return response;
  } catch (error) {
    console.error('Subscription Manager: Error creating subscription:', error);
    return null;
  }
}

/**
 * Lists all active subscriptions
 * @returns Array of active subscriptions
 */
export async function listSubscriptions(): Promise<SubscriptionInfo[]> {
  try {
    const response = await graphClient
      .api('/subscriptions')
      .get();

    return response.value || [];
  } catch (error) {
    console.error('Subscription Manager: Error listing subscriptions:', error);
    return [];
  }
}

/**
 * Renews a subscription by extending its expiration date
 * @param subscriptionId The ID of the subscription to renew
 * @param expirationMinutes How many minutes to extend the subscription
 * @returns The updated subscription or null if renewal failed
 */
export async function renewSubscription(
  subscriptionId: string, 
  expirationMinutes = 4000
): Promise<SubscriptionInfo | null> {
  try {
    const expirationDateTime = new Date();
    expirationDateTime.setMinutes(expirationDateTime.getMinutes() + expirationMinutes);

    const response = await graphClient
      .api(`/subscriptions/${subscriptionId}`)
      .update({
        expirationDateTime: expirationDateTime.toISOString()
      });

    console.log(`Subscription Manager: Subscription ${subscriptionId} renewed until ${expirationDateTime.toISOString()}`);
    return response;
  } catch (error) {
    console.error(`Subscription Manager: Error renewing subscription ${subscriptionId}:`, error);
    return null;
  }
}

/**
 * Deletes a subscription
 * @param subscriptionId The ID of the subscription to delete
 * @returns true if successful, false otherwise
 */
export async function deleteSubscription(subscriptionId: string): Promise<boolean> {
  try {
    await graphClient
      .api(`/subscriptions/${subscriptionId}`)
      .delete();

    console.log(`Subscription Manager: Subscription ${subscriptionId} deleted successfully`);
    return true;
  } catch (error) {
    console.error(`Subscription Manager: Error deleting subscription ${subscriptionId}:`, error);
    return false;
  }
}

/**
 * Ensures an active mail subscription exists by creating one if none exist
 * or renewing any that are close to expiration
 * @returns The active subscription information
 */
export async function ensureActiveSubscription(): Promise<SubscriptionInfo | null> {
  try {
    const subscriptions = await listSubscriptions();
    const mailSubscriptions = subscriptions.filter(sub => 
      sub.resource.startsWith(`/users/${userEmail}/messages`));

    if (mailSubscriptions.length === 0) {
      console.log('Subscription Manager: No mail subscriptions found, creating new one');
      return await createMailSubscription();
    }

    // Check if subscriptions are about to expire (within 12 hours)
    const twelveHoursFromNow = new Date();
    twelveHoursFromNow.setHours(twelveHoursFromNow.getHours() + 12);

    for (const sub of mailSubscriptions) {
      const expirationDate = new Date(sub.expirationDateTime);
      
      if (expirationDate < twelveHoursFromNow) {
        console.log(`Subscription Manager: Subscription ${sub.id} expires soon, renewing`);
        const renewed = await renewSubscription(sub.id);
        if (renewed) return renewed;
      } else {
        console.log(`Subscription Manager: Active subscription ${sub.id} valid until ${expirationDate.toISOString()}`);
        return sub;
      }
    }

    // If we get here, we failed to renew any existing subscriptions
    console.log('Subscription Manager: Creating new subscription after failed renewal');
    return await createMailSubscription();
  } catch (error) {
    console.error('Subscription Manager: Error ensuring active subscription:', error);
    return null;
  }
} 