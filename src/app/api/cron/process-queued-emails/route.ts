import { NextResponse, NextRequest } from 'next/server';
import { kv } from '@vercel/kv';
import { processSingleEmail } from '@/lib/emailProcessor';
import * as graphService from '@/lib/graphService';
import { SecurityValidator } from '@/lib/security';

const EMAIL_QUEUE_KEY = 'email-processing-queue';
const BATCH_SIZE = 10; // Number of emails to process per cron run

/**
* This cron job runs every minute to process emails from the KV queue.
* It's triggered by the configuration in vercel.json.
*/
export async function GET(request: NextRequest) {
  // Environment variable check
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    const errorMessage = 'Cron (ProcessEmails): Vercel KV environment variables (KV_REST_API_URL, KV_REST_API_TOKEN) are not set.';
    console.error(errorMessage);
    return NextResponse.json(
      { success: false, message: 'Server configuration error: Missing KV credentials.' },
      { status: 500 }
    );
  }

  // Enhanced security check for cron job
  const authResult = SecurityValidator.validateCronAuth(request);
  if (!authResult.isValid) {
    console.warn(`[Security] Unauthorized cron access attempt: ${authResult.error}`);
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
          // STEP 1: Get the message headers first to find the internetMessageId. This is a very light API call.
          const headers = await graphService.getEmailHeaders(messageId);
          const internetMessageId = headers?.internetMessageId;

          if (!internetMessageId) {
              console.error(`Cron (ProcessEmails): Failed to retrieve internetMessageId for Graph ID ${messageId}. Skipping.`);
              // We might want to alert on this if it happens frequently.
              return;
          }
          
          // STEP 2: Use the correct, filterable ID to find the message anywhere in the mailbox.
          const emailMessage = await graphService.getMessageByInternetId(internetMessageId);
          
          if (!emailMessage) {
            console.warn(`Cron (ProcessEmails): Could not fetch email with Internet ID ${internetMessageId}. It may have been deleted.`);
            return;
          }
          
          await processSingleEmail(emailMessage);

        } catch (error) {
          console.error(`Cron (ProcessEmails): Critical unhandled error processing email ID ${messageId}:`, error);
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