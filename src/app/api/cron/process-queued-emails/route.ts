import { NextResponse, NextRequest } from 'next/server';
import { kv } from '@vercel/kv';
import { processSingleEmail } from '@/lib/emailProcessor';
import * as graphService from '@/lib/graphService';

const EMAIL_QUEUE_KEY = 'email-processing-queue';
const BATCH_SIZE = 10; // Number of emails to process per cron run

/**
* This cron job runs every minute to process emails from the KV queue.
* It's triggered by the configuration in vercel.json.
*/
export async function GET(request: NextRequest) {
// Security check for cron job
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
}

try {
// Pop a batch of message IDs from the right end of the list (oldest first)
// The return type can be string | string[] | null, so we need to handle all cases.
const poppedItems = await kv.rpop(EMAIL_QUEUE_KEY, BATCH_SIZE);

if (!poppedItems || (Array.isArray(poppedItems) && poppedItems.length === 0)) {
  console.log('Cron (ProcessEmails): Queue is empty. Nothing to process.');
  return NextResponse.json({ success: true, message: 'Queue is empty' });
}

// Ensure messageIds is always an array of non-null strings.
const messageIds = (Array.isArray(poppedItems) ? poppedItems : [poppedItems]).filter(
  (id): id is string => id !== null
);

if (messageIds.length === 0) {
  console.log('Cron (ProcessEmails): Queue is empty after filtering null/empty items.');
  return NextResponse.json({ success: true, message: 'Queue is empty' });
}

console.log(`Cron (ProcessEmails): Processing batch of ${messageIds.length} email(s) from queue.`);

const processingResults = await Promise.allSettled(
  messageIds.map(async (messageId) => {
    // This check is slightly redundant now but adds robustness.
    if (typeof messageId !== 'string') return;
    
    try {
      const emailMessage = await graphService.getMessageById(messageId);
      if (!emailMessage) {
        console.warn(`Cron (ProcessEmails): Could not fetch email with ID ${messageId}. It may have been deleted.`);
        return;
      }
      await processSingleEmail(emailMessage);
    } catch (error) {
      console.error(`Cron (ProcessEmails): Error processing email ID ${messageId}:`, error);
    }
  })
);

const successfulCount = processingResults.filter(r => r.status === 'fulfilled').length;
const failedCount = processingResults.length - successfulCount;

const summary = `Cron (ProcessEmails): Batch finished. Processed: ${successfulCount}, Failed: ${failedCount}.`;
console.log(summary);

return NextResponse.json({ success: true, message: summary, processed: successfulCount, failed: failedCount });
} catch (error: any) {
console.error('Cron (ProcessEmails): Critical error during queue processing:', error);
return NextResponse.json(
{ success: false, message: 'Internal ServerError', error: error.message },
{ status: 500 }
);
}
} 