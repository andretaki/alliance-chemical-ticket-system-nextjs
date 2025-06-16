// src/lib/emailProcessor.ts
import { Message } from '@microsoft/microsoft-graph-types';
import * as graphService from '@/lib/graphService';
import * as alertService from '@/lib/alertService';
import { db, tickets, users, ticketComments, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, quarantinedEmails, ticketSentimentEnum } from '@/lib/db';
import { eq, or, inArray, and, sql } from 'drizzle-orm';
import { analyzeEmailContent, triageEmailWithAI, EmailAnalysisResult } from '@/lib/aiService'; // Import triage function
import { ticketEventEmitter } from '@/lib/eventEmitter';

// --- Helper Functions & Constants (from your original file) ---
const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN || "alliancechemical.com";
const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1];
const DEFAULT_STATUS = ticketStatusEnum.enumValues[0];
const OPEN_STATUS = ticketStatusEnum.enumValues[1];
const PENDING_CUSTOMER_STATUS = ticketStatusEnum.enumValues[3];
const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];
const DEFAULT_SENTIMENT = ticketSentimentEnum.enumValues[1];

function nullableToOptional(value: string | null | undefined): string | undefined {
    return value === null || value === undefined ? undefined : value;
}

function extractEmailHeaderValue(message: Message, headerName: string): string | null {
    if (!message.internetMessageHeaders) return null;
    const header = message.internetMessageHeaders.find(h => h.name?.toLowerCase() === headerName.toLowerCase());
    return header?.value || null;
}

function parseMessageIdHeader(headerValue: string | null | undefined): string[] {
    if (!headerValue) return [];
    const matches = headerValue.match(/<([^>]+)>/g);
    if (!matches) return [];
    return [...new Set(matches.map(id => id.substring(1, id.length - 1)))];
}

// --- Types ---
interface EmailProcessingState {
    messageId: string;
    internetMessageId?: string;
    startTime: number;
}

interface ProcessEmailResult {
    success: boolean;
    ticketId?: number;
    commentId?: number;
    message: string;
    skipped?: boolean;
    discarded?: boolean;
    quarantined?: boolean;
    aiTriageClassification?: string;
}

// --- Duplicate Check (Atomic) ---
async function isDuplicate(internetMessageId: string): Promise<boolean> {
    const [existingTicket, existingComment, existingQuarantine] = await Promise.all([
        db.query.tickets.findFirst({ where: eq(tickets.externalMessageId, internetMessageId), columns: { id: true } }),
        db.query.ticketComments.findFirst({ where: eq(ticketComments.externalMessageId, internetMessageId), columns: { id: true } }),
        db.query.quarantinedEmails.findFirst({ where: eq(quarantinedEmails.internetMessageId, internetMessageId), columns: { id: true } })
    ]);
    return !!existingTicket || !!existingComment || !!existingQuarantine;
}

// --- Main Email Processor ---
export async function processSingleEmail(emailMessage: Message): Promise<ProcessEmailResult> {
    const state: EmailProcessingState = {
        messageId: emailMessage.id!,
        internetMessageId: nullableToOptional(emailMessage.internetMessageId),
        startTime: Date.now(),
    };

    const logAndReturn = (result: ProcessEmailResult, logMessage: string): ProcessEmailResult => {
        const duration = Date.now() - state.startTime;
        console.log(`[EmailProcessor] [${state.messageId}] Finalizing: ${logMessage}. Duration: ${duration}ms.`);
        return result;
    };

    if (!state.internetMessageId) {
        // This is a critical failure, we can't process without a unique ID.
        // It might be a good idea to move this email to an error folder.
        return logAndReturn({ success: false, message: `Email ${state.messageId} is missing InternetMessageId.` }, "Missing InternetMessageId");
    }

    try {
        // Step 1: Duplicate Check
        if (await isDuplicate(state.internetMessageId)) {
            await graphService.markEmailAsRead(state.messageId); // Mark as read to avoid reprocessing
            return logAndReturn({ success: true, skipped: true, message: "Duplicate email detected and skipped." }, "Duplicate Detected");
        }

        const senderEmail = nullableToOptional(emailMessage.sender?.emailAddress?.address)?.toLowerCase() || '';
        const senderName = nullableToOptional(emailMessage.sender?.emailAddress?.name);
        const subject = nullableToOptional(emailMessage.subject) || 'No Subject';
        const bodyContent = nullableToOptional(emailMessage.body?.content) || '';
        const bodyPreview = emailMessage.bodyPreview || bodyContent.substring(0, 250);

        // Step 2: AI Triage - The Gatekeeper
        const triageResult = await triageEmailWithAI(subject, bodyPreview, senderEmail);

        if (!triageResult) {
            // If AI triage fails, quarantine the email for manual review.
            await db.insert(quarantinedEmails).values({
                originalGraphMessageId: state.messageId,
                internetMessageId: state.internetMessageId,
                senderEmail, senderName, subject,
                bodyPreview,
                receivedAt: new Date(emailMessage.receivedDateTime!),
                aiClassification: false,
                aiReason: 'AI Triage service failed or returned an invalid response.',
                status: 'pending_review'
            });
            await graphService.markEmailAsRead(state.messageId);
            return logAndReturn({ success: true, quarantined: true, message: "Email quarantined due to AI triage failure." }, "AI Triage Failed");
        }

        // Step 3: Decision Gateway - Route email based on AI classification
        switch (triageResult.classification) {
            case 'CUSTOMER_SUPPORT_REQUEST':
            case 'CUSTOMER_REPLY':
                // Valid emails, proceed to threading check.
                console.log(`[EmailProcessor] [${state.messageId}] AI classified as '${triageResult.classification}'. Proceeding to process.`);
                break; // Fall through to the next section

            case 'SPAM_PHISHING':
            case 'MARKETING_PROMOTIONAL':
            case 'VENDOR_BUSINESS':
                await graphService.markEmailAsRead(state.messageId);
                // Optionally move to a "Junk" or "Processed-Ignored" folder in Graph
                return logAndReturn({
                    success: true,
                    discarded: true,
                    message: `Email discarded by AI as '${triageResult.classification}'.`,
                    aiTriageClassification: triageResult.classification
                }, "Email Discarded");

            case 'OUT_OF_OFFICE':
            case 'SYSTEM_NOTIFICATION':
                await graphService.markEmailAsRead(state.messageId);
                return logAndReturn({
                    success: true,
                    skipped: true,
                    message: `Email skipped by AI as '${triageResult.classification}'.`,
                    aiTriageClassification: triageResult.classification
                }, "Automated Email Skipped");

            default: // Covers 'UNCLEAR_NEEDS_REVIEW', 'PERSONAL_INTERNAL', and any unexpected values
                await db.insert(quarantinedEmails).values({
                    originalGraphMessageId: state.messageId,
                    internetMessageId: state.internetMessageId,
                    senderEmail, senderName, subject,
                    bodyPreview,
                    receivedAt: new Date(emailMessage.receivedDateTime!),
                    aiClassification: false,
                    aiReason: triageResult.reasoning || `Classified by AI as '${triageResult.classification}'`,
                    status: 'pending_review'
                });
                await graphService.markEmailAsRead(state.messageId);
                // Optionally move to a 'Quarantined' folder in Graph
                return logAndReturn({
                    success: true,
                    quarantined: true,
                    message: `Email quarantined for review. Reason: ${triageResult.reasoning}`,
                    aiTriageClassification: triageResult.classification
                }, "Email Quarantined");
        }

        // Step 4: Threading Check (only for valid customer emails)
        const inReplyToIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'In-Reply-To'));
        const referencesIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'References'));
        const allReferencedIds = [...new Set([...inReplyToIds, ...referencesIds])];

        if (allReferencedIds.length > 0) {
            const existingTicket = await db.query.tickets.findFirst({
                where: or(inArray(tickets.externalMessageId, allReferencedIds), eq(tickets.conversationId, nullableToOptional(emailMessage.conversationId) || ''))
            });

            const existingComment = await db.query.ticketComments.findFirst({
                where: inArray(ticketComments.externalMessageId, allReferencedIds)
            });

            const targetTicketId = existingTicket?.id || existingComment?.ticketId;
            if (targetTicketId) {
                return await processAsNewComment(emailMessage, targetTicketId, state);
            }
        }

        // Step 5: New Ticket Creation (only for valid new requests)
        return await processAsNewTicket(emailMessage, state);

    } catch (error) {
        console.error(`[EmailProcessor] [${state.messageId}] Unhandled exception:`, error);
        return logAndReturn({ success: false, message: `Unhandled exception: ${error instanceof Error ? error.message : 'Unknown error'}` }, "Unhandled Exception");
    }
}

async function processAsNewComment(emailMessage: Message, ticketId: number, state: EmailProcessingState): Promise<ProcessEmailResult> {
    const bodyContent = nullableToOptional(emailMessage.body?.content) || '';

    // Log the intention
    console.log(`[EmailProcessor] [${state.messageId}] Processing as a new comment for ticket ${ticketId}.`);

    try {
        const newComment = await db.insert(ticketComments).values({
            ticketId: ticketId,
            commentText: bodyContent,
            isFromCustomer: true,
            isInternalNote: false,
            isOutgoingReply: false,
            externalMessageId: state.internetMessageId,
            createdAt: new Date(),
            // Assuming 'authorId' or 'reporterId' might be relevant if you can determine it
        }).returning({ id: ticketComments.id });

        // When a customer replies, re-open the ticket and mark it as pending
        await db.update(tickets).set({
            status: OPEN_STATUS, // 'open'
            updatedAt: new Date(),
            // Potentially reset assignee or add a note that customer replied
        }).where(eq(tickets.id, ticketId));

        // Mark the original email as read so it's not reprocessed
        await graphService.markEmailAsRead(state.messageId!);

        // === INTELLIGENT FLAGGING FOR REPLIES ===
        try {
            console.log(`[EmailProcessor] [${state.messageId}] Flagging reply for ticket ${ticketId} for human review.`);
            await graphService.flagEmail(state.messageId!); // Flag all customer replies
        } catch (flagError) {
            const errorMessage = `Failed to flag reply email for ticket ${ticketId}. MessageID: ${state.messageId}`;
            console.error(`[EmailProcessor] [${state.messageId}] ${errorMessage}`, flagError);
            // Non-critical error, but we should alert on it to fix permissions/config
            await alertService.trackErrorAndAlert('EmailFlagging-Reply-Failure', errorMessage, {
                messageId: state.messageId,
                ticketId: ticketId,
                error: flagError instanceof Error ? flagError.message : String(flagError),
            });
        }


        // Notify the system that a comment has been added
        ticketEventEmitter.emit({ type: 'comment_added', ticketId: ticketId, commentId: newComment[0].id });

        return {
            success: true,
            ticketId: ticketId,
            commentId: newComment[0].id,
            message: `Comment added to ticket ${ticketId} and email flagged.`
        };

    } catch (error) {
        const errorMessage = `Error processing new comment for ticket ${ticketId}.`;
        console.error(`[EmailProcessor] [${state.messageId}] ${errorMessage}`, error);
        // This is a critical error, as we might lose a customer reply.
        await alertService.trackErrorAndAlert('EmailProcessing-Comment-Failure', errorMessage, {
            messageId: state.messageId,
            ticketId: ticketId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: errorMessage };
    }
}

async function processAsNewTicket(emailMessage: Message, state: EmailProcessingState): Promise<ProcessEmailResult> {
    const subject = nullableToOptional(emailMessage.subject) || 'No Subject';
    const bodyContent = nullableToOptional(emailMessage.body?.content) || '';
    const senderEmail = nullableToOptional(emailMessage.sender?.emailAddress?.address)?.toLowerCase() || '';
    const senderName = nullableToOptional(emailMessage.sender?.emailAddress?.name);
    
    // Find or create reporter
    let reporter = await db.query.users.findFirst({ where: eq(users.email, senderEmail) });
    if (!reporter) {
        [reporter] = await db.insert(users).values({
            email: senderEmail,
            name: senderName,
            isExternal: true
        }).returning();
    }
    
    const aiAnalysis = await analyzeEmailContent(subject, bodyContent);

    const [newTicket] = await db.insert(tickets).values({
        title: aiAnalysis?.summary || subject.substring(0, 255),
        description: bodyContent,
        status: DEFAULT_STATUS,
        priority: aiAnalysis?.prioritySuggestion || DEFAULT_PRIORITY,
        type: aiAnalysis?.ticketType && aiAnalysis.ticketType !== 'Other' ? aiAnalysis.ticketType : DEFAULT_TYPE,
        senderEmail: senderEmail,
        senderName: senderName,
        reporterId: reporter.id,
        externalMessageId: state.internetMessageId,
        conversationId: nullableToOptional(emailMessage.conversationId),
        sentiment: aiAnalysis?.sentiment || DEFAULT_SENTIMENT,
        ai_summary: aiAnalysis?.ai_summary,
        orderNumber: aiAnalysis?.orderNumber,
        trackingNumber: aiAnalysis?.trackingNumber,
        aiSuggestedAction: aiAnalysis?.suggestedAction,
    }).returning();

    // === INTELLIGENT EMAIL FLAGGING ===
    // Flag ALL customer requests that create tickets for human review
    try {
        let shouldFlag = true; // Always flag customer requests
        let flagReason = 'customer request requiring human review';

        // Add specific reasons for prioritization
        if (newTicket.priority === 'high' || newTicket.priority === 'urgent') {
            flagReason = `${newTicket.priority} priority customer request`;
        }

        if (aiAnalysis?.intent === 'return_request' || 
            aiAnalysis?.sentiment === 'negative' ||
            newTicket.type === 'Return') {
            flagReason = `${aiAnalysis?.intent || newTicket.type} requiring urgent attention`;
        }

        if (aiAnalysis?.intent === 'documentation_request') {
            flagReason = 'documentation request requiring review';
        }

        if (aiAnalysis?.intent === 'order_status_inquiry') {
            flagReason = 'order inquiry requiring review';
        }

        if (aiAnalysis?.intent === 'quote_request') {
            flagReason = 'quote request requiring review';
        }

        if (shouldFlag && state.messageId) {
            await graphService.flagEmail(state.messageId);
            console.log(`[EmailProcessor] [${state.messageId}] Flagged new ticket email for TICKET_ID: ${newTicket.id} because: ${flagReason}`);
        }
    } catch (flagError) {
        const errorMessage = `Failed to flag new ticket email for TICKET_ID: ${newTicket.id}. MessageID: ${state.messageId}`;
        console.error(`[EmailProcessor] [${state.messageId}] ${errorMessage}`, flagError);
        // Non-critical error for ticket creation, but critical for visibility. Alert on it.
        await alertService.trackErrorAndAlert('EmailFlagging-NewTicket-Failure', errorMessage, {
            messageId: state.messageId,
            ticketId: newTicket.id,
            error: flagError instanceof Error ? flagError.message : String(flagError),
        });
    }

    await graphService.markEmailAsRead(state.messageId!);
    ticketEventEmitter.emit({ type: 'ticket_created', ticketId: newTicket.id });

    return { success: true, ticketId: newTicket.id, message: `New ticket created: #${newTicket.id}` };
}

// --- Batch Processor (Updated to handle new result types) ---
export async function processUnreadEmails(limit = 50): Promise<{
    success: boolean; message: string; processed: number; commentAdded: number;
    errors: number; skipped: number; discarded: number; quarantined: number;
    results: ProcessEmailResult[];
}> {
    const results: ProcessEmailResult[] = [];
    let processed = 0, commentAdded = 0, errors = 0, skipped = 0, discarded = 0, quarantined = 0;

    try {
        const messages = await graphService.getUnreadEmails(limit);
        if (messages.length === 0) {
            return { success: true, message: 'No unread emails to process.', processed: 0, commentAdded: 0, errors: 0, skipped: 0, discarded: 0, quarantined: 0, results: [] };
        }

        for (const message of messages) {
            try {
                const result = await processSingleEmail(message);
                results.push(result);

                if (result.success) {
                    if (result.ticketId) processed++;
                    else if (result.commentId) commentAdded++;
                    else if (result.skipped) skipped++;
                    else if (result.discarded) discarded++;
                    else if (result.quarantined) quarantined++;
                } else {
                    errors++;
                }
            } catch (emailError: any) {
                console.error(`[EmailProcessor Cron] Error processing message ID ${message.id}:`, emailError);
                errors++;
                results.push({ success: false, message: `Failed to process: ${emailError.message}` });
            }
        }

        const summary = `Job finished. New Tickets: ${processed}, New Comments: ${commentAdded}, Skipped: ${skipped}, Discarded: ${discarded}, Quarantined: ${quarantined}, Errors: ${errors}.`;
        console.log(summary);
        
        return { success: true, message: summary, processed, commentAdded, errors, skipped, discarded, quarantined, results };
    } catch (error: any) {
        const errorMessage = `Critical error fetching unread emails: ${error.message}`;
        console.error(errorMessage, error);
        await alertService.trackErrorAndAlert('EmailProcessor-Cron-Failure', errorMessage, error);
        return { success: false, message: errorMessage, processed: 0, commentAdded: 0, errors: 1, skipped: 0, discarded: 0, quarantined: 0, results: [] };
    }
}