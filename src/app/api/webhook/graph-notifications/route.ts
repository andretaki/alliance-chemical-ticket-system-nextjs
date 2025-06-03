import { NextResponse, NextRequest } from 'next/server';
import * as graphService from '@/lib/graphService';
import { db } from '@/db';
import { tickets, users, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { analyzeEmailContent } from '@/lib/aiService';
import { processSingleEmail } from '@/lib/emailProcessor';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { customerAutoCreateService } from '@/services/customerAutoCreateService';

// Constants from your process-emails route (or a shared config)
const PROCESSED_FOLDER_NAME = process.env.PROCESSED_FOLDER_NAME || "Processed";
const ERROR_FOLDER_NAME = process.env.ERROR_FOLDER_NAME || "Error";
const INTERNAL_DOMAIN = process.env.INTERNAL_DOMAIN || "alliancechemical.com"; // Made configurable
const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1]; // 'medium'
const DEFAULT_STATUS = ticketStatusEnum.enumValues[0]; // 'new'
const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];

// Add these new constants for optimization
const MAX_CONCURRENT_PROCESSING = parseInt(process.env.WEBHOOK_MAX_CONCURRENT || '3'); // Configurable
const PROCESSING_TIMEOUT = parseInt(process.env.WEBHOOK_PROCESSING_TIMEOUT || '10000'); // Configurable
const ENABLE_QUICK_FILTERING = process.env.WEBHOOK_ENABLE_QUICK_FILTERING !== 'false'; // Default true

// --- Webhook-level deduplication to prevent processing same message multiple times ---
const recentlyProcessedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 60000; // 1 minute window for deduplication

// Helper to check if message was recently processed
function isRecentlyProcessed(messageId: string): boolean {
    const now = Date.now();
    const lastProcessed = recentlyProcessedMessages.get(messageId);
    
    // Clean up old entries
    for (const [id, timestamp] of recentlyProcessedMessages.entries()) {
        if (now - timestamp > DEDUP_WINDOW_MS) {
            recentlyProcessedMessages.delete(id);
        }
    }
    
    if (lastProcessed && (now - lastProcessed) < DEDUP_WINDOW_MS) {
        return true;
    }
    
    // Mark as being processed
    recentlyProcessedMessages.set(messageId, now);
    return false;
}

// Helper function to find or create a user based on email
async function findOrCreateUserWebhook(senderEmail: string, senderName?: string | null): Promise<string | null> {
    if (!senderEmail) return null;
    
    try {
        let user = await db.query.users.findFirst({ 
            where: eq(users.email, senderEmail), 
            columns: { id: true }
        });
        
        if (user) return user.id;
        
        const [newUser] = await db.insert(users).values({
            email: senderEmail, 
            name: senderName || senderEmail.split('@')[0], 
            password: null,
            role: 'user', 
            isExternal: true,
        }).returning({ id: users.id });
        
        return newUser.id;
    } catch (error) {
        console.error(`Webhook: Error finding or creating user for ${senderEmail}:`, error);
        return null;
    }
}

// Helper function to create a ticket from an email
async function createTicketFromEmail(email: any, reporterId: string) {
    try {
        const subject = email.subject || "No Subject";
        const body = email.body?.contentType === 'text' 
            ? email.body.content 
            : email.bodyPreview || '';

        let aiAnalysis = null;
        
        try {
            aiAnalysis = await analyzeEmailContent(subject, body);
        } catch (aiError) {
            console.error(`Webhook: AI Analysis Error for email ${email.id}:`, aiError);
            // Continue with default values if AI analysis fails
        }

        const ticketData = {
            title: aiAnalysis?.summary?.substring(0, 255) || subject.substring(0, 255),
            description: body,
            reporterId,
            priority: aiAnalysis?.prioritySuggestion || DEFAULT_PRIORITY,
            status: DEFAULT_STATUS,
            type: (aiAnalysis?.ticketType && ticketTypeEcommerceEnum.enumValues.includes(aiAnalysis.ticketType as any))
                  ? aiAnalysis.ticketType as typeof ticketTypeEcommerceEnum.enumValues[number]
                  : DEFAULT_TYPE,
            orderNumber: aiAnalysis?.orderNumber || null,
            trackingNumber: aiAnalysis?.trackingNumber || null,
            senderEmail: email.sender?.emailAddress?.address,
            senderName: email.sender?.emailAddress?.name,
            externalMessageId: email.internetMessageId,
        };

        const [newTicket] = await db.insert(tickets).values(ticketData).returning({ id: tickets.id });
        console.log(`Webhook: Created ticket ${newTicket.id} for email ${email.id}. AI Used: ${!!aiAnalysis}`);
        
        // --- Auto-create customer in Shopify if enabled and customer info is provided ---
        if (ticketData.senderEmail && customerAutoCreateService.isAutoCreateEnabled()) {
            try {
                console.log(`[Webhook] Attempting to auto-create customer for ticket ${newTicket.id} from email`);
                
                // Parse sender name into first and last name
                let firstName: string | undefined;
                let lastName: string | undefined;
                
                if (ticketData.senderName) {
                    const nameParts = ticketData.senderName.trim().split(' ');
                    firstName = nameParts[0];
                    lastName = nameParts.slice(1).join(' ') || undefined;
                }

                const customerResult = await customerAutoCreateService.createCustomerFromTicket({
                    email: ticketData.senderEmail,
                    firstName,
                    lastName,
                    ticketId: newTicket.id,
                    source: 'email'
                });

                if (customerResult.success) {
                    if (customerResult.alreadyExists) {
                        console.log(`[Webhook] Customer already exists in Shopify for email ticket ${newTicket.id}: ${ticketData.senderEmail}`);
                    } else {
                        console.log(`[Webhook] Successfully created customer in Shopify for email ticket ${newTicket.id}: ${ticketData.senderEmail} (ID: ${customerResult.customerId})`);
                    }
                } else if (customerResult.skipped) {
                    console.log(`[Webhook] Skipped customer creation for email ticket ${newTicket.id}: ${customerResult.skipReason}`);
                } else {
                    console.warn(`[Webhook] Failed to create customer in Shopify for email ticket ${newTicket.id}: ${customerResult.error}`);
                }
            } catch (customerError) {
                // Don't fail ticket creation if customer creation fails
                console.error(`[Webhook] Error during customer auto-creation for email ticket ${newTicket.id}:`, customerError);
            }
        }
        
        // Emit event for the new ticket
        ticketEventEmitter.emit({
            type: 'ticket_created',
            ticketId: newTicket.id
        });
        
        return newTicket;
    } catch (error) {
        console.error(`Webhook: Error creating ticket for email ${email.id}:`, error);
        throw error;
    }
}

// NEW: Quick pre-filter function to check if we should process an email
async function shouldProcessEmail(messageId: string): Promise<{ shouldProcess: boolean; reason?: string; senderEmail?: string }> {
    try {
        // Get minimal email info for quick filtering
        const emailHeaders = await graphService.getEmailHeaders(messageId);
        if (!emailHeaders) {
            return { shouldProcess: false, reason: 'Could not fetch headers' };
        }

        const senderEmail = emailHeaders.sender?.emailAddress?.address;
        if (!senderEmail) {
            return { shouldProcess: false, reason: 'No sender email' };
        }

        const lowerSender = senderEmail.toLowerCase();
        
        // Quick internal domain check
        if (lowerSender.endsWith(`@${INTERNAL_DOMAIN.toLowerCase()}`)) {
            return { shouldProcess: false, reason: 'Internal email', senderEmail };
        }

        // Add other quick filters here (e.g., known spam domains)
        const spamDomains = ['noreply', 'mailer-daemon', 'notifications'];
        if (spamDomains.some(domain => lowerSender.includes(domain))) {
            return { shouldProcess: false, reason: 'Spam/automated email', senderEmail };
        }

        return { shouldProcess: true, senderEmail };
    } catch (error: any) {
        // Handle 404 errors gracefully (common with webhook race conditions)
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            console.log(`Webhook: Email ${messageId} not found (likely moved/deleted quickly) - skipping`);
            return { shouldProcess: false, reason: 'Email not found (moved/deleted)' };
        }
        console.error(`Webhook: Error in pre-filter for ${messageId}:`, error);
        return { shouldProcess: false, reason: 'Error in pre-filter' };
    }
}

// NEW: Process a single notification with timeout
async function processNotificationWithTimeout(messageId: string): Promise<void> {
    return Promise.race([
        processNotification(messageId),
        new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT)
        )
    ]);
}

// NEW: Process a single notification
async function processNotification(messageId: string): Promise<void> {
    try {
        // Check for recent processing to prevent duplicates
        if (isRecentlyProcessed(messageId)) {
            console.log(`Webhook: Skipping recently processed email ${messageId} (within ${DEDUP_WINDOW_MS/1000}s window)`);
            return;
        }

        // Use quick pre-filter only if enabled
        if (ENABLE_QUICK_FILTERING) {
            const filterResult = await shouldProcessEmail(messageId);
            
            if (!filterResult.shouldProcess) {
                console.log(`Webhook: Skipping email ${messageId} - ${filterResult.reason}${filterResult.senderEmail ? ` (${filterResult.senderEmail})` : ''}`);
                // Only mark as read if it's not a "not found" error
                if (!filterResult.reason?.includes('not found')) {
                    await graphService.markEmailAsRead(messageId);
                }
                return;
            }

            console.log(`Webhook: Processing external email ${messageId} from ${filterResult.senderEmail}`);
        } else {
            console.log(`Webhook: Processing email ${messageId} (quick filtering disabled)`);
        }
        
        // Fetch the full message details only for emails we want to process
        const emailMessage = await graphService.getMessageById(messageId);

        if (emailMessage) {
            // Call the centralized processing function
            const result = await processSingleEmail(emailMessage);
            if (!result.success && !result.skipped) {
                // Log errors that weren't just skips
                console.error(`Webhook: Failed to process email ${messageId}: ${result.message}`);
            } else if (result.skipped) {
                console.log(`Webhook: Email ${messageId} was skipped by processor: ${result.message}`);
            } else if (result.success) {
                console.log(`Webhook: Successfully processed email ${messageId}`);
            }
        } else {
            console.log(`Webhook: Could not fetch email ${messageId} - likely moved/deleted quickly (common with webhooks)`);
        }
    } catch (error: any) {
        // Handle 404 errors gracefully (very common with webhooks)
        if (error.statusCode === 404 || error.code === 'ErrorItemNotFound') {
            console.log(`Webhook: Email ${messageId} not found during processing - likely moved/deleted quickly (normal)`);
        } else {
            console.error(`Webhook: Error processing notification ${messageId}:`, error);
        }
    }
}

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const validationToken = searchParams.get('validationToken');

    // 1. Handle Subscription Validation Request
    if (validationToken) {
        console.log('Webhook: Received validation token:', validationToken);
        // Return the validation token exactly as received, with plain text content type
        // Important: No JSON, just the plain token text
        return new Response(validationToken, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    }

    // 2. Handle Actual Notifications
    try {
        // Check if the request has content before attempting to parse JSON
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.warn('Webhook: Received request with invalid content type:', contentType);
            return NextResponse.json({ message: 'Invalid content type' }, { status: 400 });
        }

        // Get the request body text and verify it's not empty
        const bodyText = await request.text();
        if (!bodyText || bodyText.trim() === '') {
            console.warn('Webhook: Received empty request body');
            return NextResponse.json({ message: 'Empty request body' }, { status: 202 });
        }

        // Now safely parse the JSON
        const notificationPayload = JSON.parse(bodyText);
        console.log('Webhook: Received notification'); // Don't log full payload by default
        
        // Log essential details for debugging
        console.log(`Webhook: Notification details - Type: ${notificationPayload.changeType || 'N/A'}, Resource count: ${notificationPayload?.value?.length || 0}`);
        
        if (notificationPayload?.value?.length > 0) {
            // NEW: Collect all message IDs for batch processing
            const messageIds: string[] = [];
            
            for (const notification of notificationPayload.value) {
                // Verify clientState (Keep this)
                if (process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET &&
                    notification.clientState !== process.env.MICROSOFT_GRAPH_WEBHOOK_SECRET) {
                    console.warn('Webhook: Invalid clientState. Ignoring notification.');
                    continue;
                }

                if (notification.resource && notification.changeType === 'created') {
                    const messageId = notification.resourceData?.id;
                    if (!messageId) {
                        console.warn('Webhook: Notification received without message ID.');
                        continue;
                    }
                    messageIds.push(messageId);
                } else {
                    console.log(`Webhook: Received notification type ${notification.changeType} for resource ${notification.resource}. Ignoring (only processing 'created').`);
                }
            }

            // NEW: Process notifications in controlled batches to avoid overwhelming the system
            if (messageIds.length > 0) {
                const startTime = Date.now();
                console.log(`Webhook: Processing ${messageIds.length} notifications...`);
                
                // Process in small concurrent batches
                const batches = [];
                for (let i = 0; i < messageIds.length; i += MAX_CONCURRENT_PROCESSING) {
                    const batch = messageIds.slice(i, i + MAX_CONCURRENT_PROCESSING);
                    batches.push(batch);
                }

                let totalProcessed = 0;
                let totalSkipped = 0;
                let totalErrors = 0;

                // Process each batch concurrently, but wait for each batch to complete
                for (const [batchIndex, batch] of batches.entries()) {
                    const batchStartTime = Date.now();
                    console.log(`Webhook: Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} emails`);
                    
                    const results = await Promise.allSettled(
                        batch.map(messageId => processNotificationWithTimeout(messageId))
                    );
                    
                    // Count results
                    const batchSucceeded = results.filter(r => r.status === 'fulfilled').length;
                    const batchFailed = results.filter(r => r.status === 'rejected').length;
                    
                    totalProcessed += batchSucceeded;
                    totalErrors += batchFailed;
                    
                    const batchDuration = Date.now() - batchStartTime;
                    console.log(`Webhook: Batch ${batchIndex + 1} completed in ${batchDuration}ms - Success: ${batchSucceeded}, Failed: ${batchFailed}`);
                }
                
                const totalDuration = Date.now() - startTime;
                console.log(`Webhook: Completed processing all ${messageIds.length} notifications in ${totalDuration}ms - Processed: ${totalProcessed}, Errors: ${totalErrors}, Avg: ${Math.round(totalDuration / messageIds.length)}ms per email`);
            }
        }

        // Always return 202 for notifications
        return NextResponse.json({ message: 'Notification received' }, { status: 202 });
    } catch (error: any) {
        console.error('Webhook: Error processing notification payload:', error);
        
        // Add more detailed error info
        if (error instanceof SyntaxError) {
            console.error('Webhook: JSON parsing error - likely malformed payload');
        }
        
        // Always return 202 even for errors to prevent Microsoft Graph from deactivating subscription
        return NextResponse.json({ message: 'Error processing notification but accepted' }, { status: 202 });
    }
} 