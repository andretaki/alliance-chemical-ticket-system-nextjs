import { NextResponse, NextRequest } from 'next/server';
import { kv } from '@vercel/kv';

// Define the key for the KV queue. This list will store incoming message IDs.
const EMAIL_QUEUE_KEY = 'email-processing-queue';

/**
* Handles incoming notifications from Microsoft Graph.
* This webhook must be extremely fast to avoid being disabled by Microsoft.
* It now validates the request and immediately pushes the notification payload to a Vercel KV queue.
* A separate cron job will process the queue.
*/
export async function POST(request: NextRequest) {
const searchParams = request.nextUrl.searchParams;
const validationToken = searchParams.get('validationToken');

// 1. Handle Subscription Validation Request
if (validationToken) {
console.log('Webhook: Received validation token, responding to confirm subscription.');
return new Response(validationToken, {
status: 200,
headers: { 'Content-Type': 'text/plain' },
});
}

// 2. Handle Actual Notifications
try {
const notificationPayload = await request.json();
console.log('Webhook: Received notification payload.');

if (!notificationPayload.value || notificationPayload.value.length === 0) {
console.log('Webhook: Notification received but no new messages to process.');
return new NextResponse('Notification received, no action taken.', { status: 202 });
}

// Immediately return a 202 Accepted response.
// The processing will happen in the background via a cron job reading from the KV queue.
const response = new NextResponse('Notification accepted for processing.', { status: 202 });

// Offload the processing to avoid blocking the response
(async () => {
try {
console.log(`Webhook: Offloading ${notificationPayload.value.length} message(s) to KV queue.`);

const messagesToQueue: string[] = [];
for (const notification of notificationPayload.value) {
// Verify clientState for security
if (process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET &&
notification.clientState !== process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET) {
console.warn(`Webhook: Invalid clientState received. Ignoring notification.`);
continue;
}

const messageId = notification.resourceData?.id;
if (notification.changeType === 'created' && messageId) {
messagesToQueue.push(messageId);
} else {
console.log(`Webhook: Ignoring notification of type '${notification.changeType}'.`);
}
}

if (messagesToQueue.length > 0) {
// Use lpush to add all new message IDs to the front of the list in one go
await kv.lpush(EMAIL_QUEUE_KEY, ...messagesToQueue);
console.log(`Webhook: Successfully pushed ${messagesToQueue.length} message IDs to KV queue.`);
}
} catch (kvError) {
console.error('Webhook: CRITICAL ERROR - Failed to push notifications to KV queue:', kvError);
// Here you might want to trigger a high-priority alert (e.g., via another service)
// because emails will not be processed.
}
})();

return response;

} catch (error: any) {
console.error('Webhook: Error parsing notification payload:', error);
// Even on error, return 202 to prevent Microsoft from disabling the subscription.
// This could happen with empty or malformed requests.
return new NextResponse('Error processing notification, but accepted.', { status: 202 });
}
}