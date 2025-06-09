// src/lib/emailProcessor.ts
import { Message, InternetMessageHeader, NullableOption } from '@microsoft/microsoft-graph-types';
import * as graphService from '@/lib/graphService';
import * as alertService from '@/lib/alertService';
import { db, tickets, users, ticketComments, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, quarantinedEmails, ticketSentimentEnum } from '@/lib/db'; // Added sentiment enum
import { eq, or, inArray, and, sql } from 'drizzle-orm'; // Added sql for raw queries
import { analyzeEmailContent, triageEmailWithAI, EmailAnalysisResult } from '@/lib/aiService'; // Import EmailAnalysisResult
import { getOrderTrackingInfo, OrderTrackingInfo } from '@/lib/shipstationService'; // Import the new service
import { checkOrderAndGenerateResponse } from '@/lib/orderResponseService'; // Import the new order response service
import { ticketEventEmitter } from '@/lib/eventEmitter'; // Import event emitter

// Helper to convert NullableOption<string> to string | undefined
function nullableToOptional(value: NullableOption<string> | undefined): string | undefined {
    return value === null || value === undefined ? undefined : value;
}

// --- Constants ---
const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN || "alliancechemical.com";
const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1]; // 'medium'
const DEFAULT_STATUS = ticketStatusEnum.enumValues[0];     // 'new'
const OPEN_STATUS = ticketStatusEnum.enumValues[1];        // 'open' (Used when a reply comes in)
const PENDING_CUSTOMER_STATUS = ticketStatusEnum.enumValues[3]; // 'pending_customer'
const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];
const DEFAULT_SENTIMENT = ticketSentimentEnum.enumValues[1]; // 'neutral'

// --- Types for Hard Rules ---
type HeaderRule = { type: 'header'; name: string; value: string };
type SenderRule = { type: 'sender'; pattern: string };
type SubjectRule = { type: 'subject'; pattern: string };
type HardFilterRule = HeaderRule | SenderRule | SubjectRule;

// --- In-memory processing lock to prevent concurrent processing of same email ---
const processingLocks = new Map<string, Promise<ProcessEmailResult>>();

// --- Processing state tracking ---
interface EmailProcessingState {
    messageId: string;
    internetMessageId?: string;
    startTime: number;
    lockAcquired: boolean;
}

// Helper to acquire database lock for email processing
async function acquireEmailProcessingLock(internetMessageId: string): Promise<boolean> {
    try {
        // Use advisory lock with a hash of the internetMessageId to prevent concurrent processing
        const hashValue = Math.abs(internetMessageId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0));
        
        // Use Drizzle's raw SQL execution with simpler result handling
        const result = await db.execute(sql`SELECT pg_try_advisory_lock(${hashValue}) as lock_acquired`);
        
        // Handle different possible result formats from Drizzle
        if (Array.isArray(result)) {
            return (result[0] as any)?.lock_acquired || false;
        } else if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as any).rows)) {
            return (result as any).rows[0]?.lock_acquired || false;
        } else if (result && typeof result === 'object' && 'lock_acquired' in result) {
            return (result as any).lock_acquired || false;
        }
        return false;
    } catch (error) {
        console.error('EmailProcessor: Failed to acquire processing lock:', error);
        return false;
    }
}

// Helper to release database lock
async function releaseEmailProcessingLock(internetMessageId: string): Promise<void> {
    try {
        const hashValue = Math.abs(internetMessageId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0));
        
        await db.execute(sql`SELECT pg_advisory_unlock(${hashValue})`);
    } catch (error) {
        console.error('EmailProcessor: Failed to release processing lock:', error);
    }
}

// Enhanced duplicate check with atomic operation
async function performAtomicDuplicateCheck(internetMessageId: string): Promise<{
    isDuplicate: boolean;
    ticketId?: number;
    commentId?: number;
    quarantineId?: number;
    type?: 'ticket' | 'comment' | 'quarantine';
}> {
    // Check all possible locations in a single transaction
    const [existingTicket, existingComment, existingQuarantine] = await Promise.all([
        db.query.tickets.findFirst({ 
            where: eq(tickets.externalMessageId, internetMessageId), 
            columns: { id: true }
        }),
        db.query.ticketComments.findFirst({ 
            where: eq(ticketComments.externalMessageId, internetMessageId), 
            columns: { id: true, ticketId: true }
        }),
        db.query.quarantinedEmails.findFirst({
            where: eq(quarantinedEmails.internetMessageId, internetMessageId),
            columns: { id: true }
        })
    ]);

    if (existingTicket) {
        return { isDuplicate: true, ticketId: existingTicket.id, type: 'ticket' };
    }
    if (existingComment) {
        return { isDuplicate: true, commentId: existingComment.id, ticketId: existingComment.ticketId, type: 'comment' };
    }
    if (existingQuarantine) {
        return { isDuplicate: true, quarantineId: existingQuarantine.id, type: 'quarantine' };
    }

    return { isDuplicate: false };
}

// Helper function to extract just the first name for greetings
function extractFirstName(senderName: string | null | undefined, senderEmail: string): string {
  if (!senderName) {
    return senderEmail.split('@')[0];
  }
  
  // Handle common name formats
  if (senderName.includes(',')) {
    // "Last, First" format - take the part after the comma
    const parts = senderName.split(',');
    if (parts.length > 1) {
      return parts[1].trim();
    }
  }
  
  // Handle "First Last" format - take the first word
  const words = senderName.trim().split(/\s+/);
  return words[0];
}

// Helper function to extract email header values
function extractEmailHeaderValue(message: Message, headerName: string): string | null {
    if (!message.internetMessageHeaders) return null;
    
    const header = message.internetMessageHeaders.find(h => 
        h.name?.toLowerCase() === headerName.toLowerCase()
    );
    
    return header?.value || null;
}

/**
 * Extracts and cleans message IDs from In-Reply-To or References headers.
 * @param headerValue The raw header string value.
 * @returns An array of cleaned message IDs (without angle brackets).
 */
function parseMessageIdHeader(headerValue: string | null | undefined): string[] {
    if (!headerValue) {
        return [];
    }
    // Match message IDs enclosed in <...>
    const matches = headerValue.match(/<([^>]+)>/g);
    if (!matches) {
        // ** DEBUG LOGGING **
        console.log(`[EmailProcessor] parseMessageIdHeader: No valid message-ID formats found in header: "${headerValue}"`);
        return [];
    }
    // Remove angle brackets and return unique IDs
    const cleanedIds = [...new Set(matches.map(id => id.substring(1, id.length - 1)))];
    // ** DEBUG LOGGING **
    console.log(`[EmailProcessor] parseMessageIdHeader: Parsed ${cleanedIds.length} IDs from header "${headerValue}"`);
    return cleanedIds;
}

// --- NEW: Assignee Suggestion Mapping ---
async function mapKeywordsToAssigneeId(keywords: string | null): Promise<string | null> {
    if (!keywords) return null;
    const lowerKeywords = keywords.toLowerCase();

    // --- Simple Keyword/Role Mapping (Customize this heavily!) ---
    const keywordMap: { [key: string]: string | string[] } = {
        'shipping': ['shipping@alliancechemical.com', 'logistics@alliancechemical.com'], // Assign to one or more emails/IDs
        'tracking': 'shipping@alliancechemical.com',
        'billing': 'accounting@alliancechemical.com',
        'invoice': 'accounting@alliancechemical.com',
        'payment': 'accounting@alliancechemical.com',
        'return': ['returns@alliancechemical.com', 'support@alliancechemical.com'],
        'coa_request': 'qa@alliancechemical.com',
        'sds_request': 'qa@alliancechemical.com',
        'coc_request': 'qa@alliancechemical.com',
        'documentation': 'qa@alliancechemical.com',
        'technical_support': 'tech@alliancechemical.com',
        'product_question': 'tech@alliancechemical.com',
        'sales': 'sales@alliancechemical.com',
        'quote_request': 'sales@alliancechemical.com',
    };
    // --- End Mapping ---

    let targetEmails: string[] = [];
    for (const key in keywordMap) {
        if (lowerKeywords.includes(key)) {
            const targets = keywordMap[key];
            if (Array.isArray(targets)) {
                targetEmails.push(...targets);
            } else {
                targetEmails.push(targets);
            }
            // Optional: break after first match or collect all matches
            // break;
        }
    }

    if (targetEmails.length === 0) return null; // No mapping found

    // Find the first *existing* user from the mapped emails
    try {
        // Normalize emails to lower case for query
        const lowerCaseEmails = targetEmails.map(email => email.toLowerCase());
        const potentialUsers = await db.query.users.findMany({
            where: inArray(users.email, lowerCaseEmails),
            columns: { id: true, email: true } // Fetch email to match later if needed
        });

        if (potentialUsers.length > 0) {
            // Prioritize? For now, just take the first one found.
            const foundUser = potentialUsers.find(u => lowerCaseEmails.includes(u.email));
            if (foundUser) {
                console.log(`EmailProcessor (Assignee Suggestion): Mapped "${keywords}" to user ID ${foundUser.id} (${foundUser.email})`);
                return foundUser.id; // Return the user ID (string UUID)
            }
        }
    } catch (error) {
        console.error("EmailProcessor (Assignee Suggestion): DB error looking up user:", error);
    }

    console.log(`EmailProcessor (Assignee Suggestion): No existing user found for keywords "${keywords}" mapped to emails: ${targetEmails.join(', ')}`);
    return null;
}

// --- Enhanced Result Interface ---
interface ProcessEmailResult {
    success: boolean;
    ticketId?: number;
    commentId?: number;
    message: string;
    skipped?: boolean; // General skip (duplicate, internal non-reply)
    discarded?: boolean; // Specifically discarded by filter/AI
    quarantined?: boolean; // Sent to quarantine
    aiTriageClassification?: string; // Store AI triage result
    automation_attempted?: boolean;
    automation_info?: OrderTrackingInfo | null;
    messageId?: string; // Add messageId for error tracking
}

// Helper function to log and return results with duration
async function logAndReturn(
    result: ProcessEmailResult,
    state: EmailProcessingState,
    logMessage: string
): Promise<ProcessEmailResult> {
    const duration = Date.now() - state.startTime;
    console.log(`[EmailProcessor] [${state.messageId}] Finalizing: ${logMessage}. Duration: ${duration}ms.`);
    return result;
}

// --- Core Processing Function for a Single Email ---
export async function processSingleEmail(emailMessage: Message): Promise<ProcessEmailResult> {
    const state: EmailProcessingState = {
        messageId: emailMessage.id!,
        internetMessageId: nullableToOptional(emailMessage.internetMessageId),
        startTime: Date.now(),
        lockAcquired: false,
    };
    console.log(`[EmailProcessor] [${state.messageId}] Starting processing for subject: "${emailMessage.subject}"`);
    try {
        const result = await processSingleEmailInternal(emailMessage);
        console.log(`[EmailProcessor] [${state.messageId}] Finished processing. Success: ${result.success}, Message: ${result.message}`);
        return result;
    } catch (error) {
        console.error(`[EmailProcessor] [${state.messageId}] Unhandled exception in processSingleEmail:`, error);
        return {
            success: false,
            message: `Unhandled exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
            messageId: state.messageId,
        };
    }
}

// Internal processing function (renamed from original processSingleEmail)
async function processSingleEmailInternal(emailMessage: Message): Promise<ProcessEmailResult> {
    const state: EmailProcessingState = {
        messageId: emailMessage.id!,
        internetMessageId: nullableToOptional(emailMessage.internetMessageId),
        startTime: Date.now(),
        lockAcquired: false,
    };
    console.log(`[EmailProcessor] [${state.messageId}] Starting processing for subject: "${emailMessage.subject}"`);

    if (!state.internetMessageId) {
        return logAndReturn({
            success: false,
            message: `Email ${state.messageId} is missing the required InternetMessageId and cannot be processed.`,
            quarantined: true,
            messageId: state.messageId,
        }, state, "Missing InternetMessageId");
    }

    try {
        state.lockAcquired = await acquireEmailProcessingLock(state.internetMessageId);
        if (!state.lockAcquired) {
            return logAndReturn({
                success: false,
                message: `Could not acquire processing lock for email ${state.internetMessageId}. It is likely being processed by another instance.`,
                skipped: true,
                messageId: state.messageId,
            }, state, "Lock not acquired");
        }
        console.log(`[EmailProcessor] [${state.messageId}] Lock acquired.`);

        // Check for duplicates first
        const duplicateCheck = await performAtomicDuplicateCheck(state.internetMessageId);
        if (duplicateCheck.isDuplicate) {
            return logAndReturn({
                success: true,
                message: `Email ${state.internetMessageId} already processed as ${duplicateCheck.type} ID ${duplicateCheck.ticketId || duplicateCheck.commentId || duplicateCheck.quarantineId}`,
                skipped: true,
                messageId: state.messageId,
            }, state, "Duplicate detected");
        }

        // Extract basic info
        const senderEmail = nullableToOptional(emailMessage.sender?.emailAddress?.address) || '';
        const senderName = nullableToOptional(emailMessage.sender?.emailAddress?.name) || null;
        const subject = nullableToOptional(emailMessage.subject) || '';
        const bodyContent = nullableToOptional(emailMessage.body?.content) || '';

        // Check if it's an internal email (skip if not a reply)
        const isInternal = senderEmail.toLowerCase().includes(INTERNAL_DOMAIN.toLowerCase());
        if (isInternal) {
            // Only process internal emails if they are replies to existing tickets
            const inReplyToIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'In-Reply-To'));
            const referencesIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'References'));
            const allReferencedIds = [...inReplyToIds, ...referencesIds];

            if (allReferencedIds.length === 0) {
                return logAndReturn({
                    success: true,
                    message: `Internal email from ${senderEmail} has no reply context. Skipping.`,
                    skipped: true,
                    messageId: state.messageId,
                }, state, "Internal non-reply skipped");
            }
        }

        // Determine if this is a reply to an existing ticket
        const inReplyToIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'In-Reply-To'));
        const referencesIds = parseMessageIdHeader(extractEmailHeaderValue(emailMessage, 'References'));
        const allReferencedIds = [...inReplyToIds, ...referencesIds];

        if (allReferencedIds.length > 0) {
            // Check if any referenced IDs match existing tickets or comments
            const existingTicket = await db.query.tickets.findFirst({
                where: or(
                    inArray(tickets.externalMessageId, allReferencedIds),
                    eq(tickets.conversationId, nullableToOptional(emailMessage.conversationId) || '')
                ),
                columns: { id: true, title: true, status: true }
            });

            const existingComment = await db.query.ticketComments.findFirst({
                where: inArray(ticketComments.externalMessageId, allReferencedIds),
                columns: { id: true, ticketId: true }
            });

            if (existingTicket || existingComment) {
                const targetTicketId = existingTicket?.id || existingComment?.ticketId;
                if (targetTicketId) {
                    return await processAsNewComment(emailMessage, targetTicketId, state);
                }
            }
        }

        // Process as new ticket
        return await processAsNewTicket(emailMessage, state);

    } catch (error) {
        console.error(`[EmailProcessor] [${state.messageId}] Unhandled exception in processSingleEmailInternal:`, error);
        return logAndReturn({
            success: false,
            message: `Unhandled exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
            messageId: state.messageId,
        }, state, "Unhandled exception");
    } finally {
        if (state.lockAcquired && state.internetMessageId) {
            await releaseEmailProcessingLock(state.internetMessageId);
            console.log(`[EmailProcessor] [${state.messageId}] Lock released.`);
        }
    }
}

// Placeholder for processAsNewComment - needs to be implemented
async function processAsNewComment(emailMessage: Message, ticketId: number, state: EmailProcessingState): Promise<ProcessEmailResult> {
    try {
        const senderEmail = nullableToOptional(emailMessage.sender?.emailAddress?.address) || '';
        const senderName = nullableToOptional(emailMessage.sender?.emailAddress?.name) || null;
        const bodyContent = nullableToOptional(emailMessage.body?.content) || '';

        // Add comment to the ticket
        const [newComment] = await db.insert(ticketComments).values({
            ticketId: ticketId,
            commentText: bodyContent,
            isFromCustomer: true,
            isInternalNote: false,
            isOutgoingReply: false,
            externalMessageId: state.internetMessageId
        }).returning();

        // Update ticket status to 'open' if it was pending
        await db.update(tickets)
            .set({ 
                status: OPEN_STATUS, 
                updatedAt: new Date() 
            })
            .where(eq(tickets.id, ticketId));

        // Mark email as read and flag it for review
        if (emailMessage.id) {
            await graphService.markEmailAsRead(emailMessage.id);
            
            // Flag customer email for human review
            try {
                await graphService.flagEmail(emailMessage.id);
                console.log(`EmailProcessor: Flagged email ${emailMessage.id} for comment on ticket ${ticketId} (customer reply requiring review)`);
            } catch (flagError) {
                console.warn(`EmailProcessor: Failed to flag email ${emailMessage.id}:`, flagError);
                // Don't fail the whole process if flagging fails
            }
        }

        return logAndReturn({
            success: true,
            commentId: newComment.id,
            message: `Comment added to ticket ${ticketId}`,
            messageId: state.messageId,
        }, state, "Comment added successfully");

    } catch (error) {
        console.error(`[EmailProcessor] [${state.messageId}] Error processing as comment:`, error);
        return logAndReturn({
            success: false,
            message: `Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`,
            messageId: state.messageId,
        }, state, "Comment processing failed");
    }
}

// Placeholder for processAsNewTicket - needs to be implemented
async function processAsNewTicket(emailMessage: Message, state: EmailProcessingState): Promise<ProcessEmailResult> {
    try {
        const senderEmail = nullableToOptional(emailMessage.sender?.emailAddress?.address) || '';
        const senderName = nullableToOptional(emailMessage.sender?.emailAddress?.name) || null;
        const subject = nullableToOptional(emailMessage.subject) || '';
        const bodyContent = nullableToOptional(emailMessage.body?.content) || '';

        // Find or create a default system user for external tickets
        let reporterId = 'system'; // Default fallback
        try {
            const systemUser = await db.query.users.findFirst({
                where: eq(users.email, 'system@alliancechemical.com'),
                columns: { id: true }
            });
            if (systemUser) {
                reporterId = systemUser.id;
            } else {
                // Create a system user if it doesn't exist
                const [newSystemUser] = await db.insert(users).values({
                    email: 'system@alliancechemical.com',
                    name: 'System User',
                    role: 'user',
                    isExternal: true
                }).returning();
                reporterId = newSystemUser.id;
            }
        } catch (error) {
            console.error(`[EmailProcessor] [${state.messageId}] Error finding/creating system user:`, error);
        }

        // Analyze email content with AI
        let aiAnalysis: EmailAnalysisResult | null = null;
        let suggestedAssigneeId: string | null = null;
        try {
            aiAnalysis = await analyzeEmailContent(subject, bodyContent);
            if (aiAnalysis?.suggestedRoleOrKeywords) {
                suggestedAssigneeId = await mapKeywordsToAssigneeId(aiAnalysis.suggestedRoleOrKeywords);
            }
        } catch (aiError) {
            console.error(`[EmailProcessor] [${state.messageId}] AI analysis failed:`, aiError);
        }

        // Create new ticket
        const [newTicket] = await db.insert(tickets).values({
            title: subject || 'No Subject',
            description: bodyContent,
            status: DEFAULT_STATUS,
            priority: aiAnalysis?.prioritySuggestion || DEFAULT_PRIORITY,
            type: aiAnalysis?.ticketType && aiAnalysis.ticketType !== 'Other' ? aiAnalysis.ticketType : DEFAULT_TYPE,
            senderEmail: senderEmail,
            senderName: senderName,
            externalMessageId: state.internetMessageId,
            conversationId: nullableToOptional(emailMessage.conversationId),
            sentiment: aiAnalysis?.sentiment || DEFAULT_SENTIMENT,
            ai_summary: aiAnalysis?.ai_summary,
            ai_suggested_assignee_id: suggestedAssigneeId,
            reporterId: reporterId,
            orderNumber: aiAnalysis?.orderNumber,
            trackingNumber: aiAnalysis?.trackingNumber
        }).returning();

        // Mark email as read and flag it for human review
        if (emailMessage.id) {
            await graphService.markEmailAsRead(emailMessage.id);
            
            // Flag ALL customer emails that create tickets for human review
            try {
                let flagReason = 'customer request requiring human review';
                
                // Add specific reasons for prioritization
                if (newTicket.priority === 'high' || newTicket.priority === 'urgent') {
                    flagReason = `${newTicket.priority} priority customer request`;
                }
                
                if (aiAnalysis?.intent === 'return_request' || 
                    aiAnalysis?.sentiment === 'negative' ||
                    aiAnalysis?.ticketType === 'Return') {
                    flagReason = `${aiAnalysis.intent || 'return request'} requiring urgent attention`;
                }
                
                if (aiAnalysis?.intent === 'documentation_request') {
                    flagReason = 'documentation request requiring review';
                }
                
                await graphService.flagEmail(emailMessage.id);
                console.log(`EmailProcessor: Flagged ticket ${newTicket.id} email (${flagReason})`);
                
            } catch (flagError) {
                console.warn(`EmailProcessor: Failed to flag email for ticket ${newTicket.id}:`, flagError);
                // Don't fail the whole process if flagging fails
            }
        }

        // Emit ticket created event
        ticketEventEmitter.emit({
            type: 'ticket_created',
            ticketId: newTicket.id,
            title: newTicket.title || 'No Subject',
            priority: newTicket.priority || DEFAULT_PRIORITY,
            assigneeId: suggestedAssigneeId
        });

        return logAndReturn({
            success: true,
            ticketId: newTicket.id,
            message: `New ticket created: ${newTicket.id}`,
            messageId: state.messageId,
        }, state, "Ticket created successfully");

    } catch (error) {
        console.error(`[EmailProcessor] [${state.messageId}] Error processing as new ticket:`, error);
        return logAndReturn({
            success: false,
            message: `Failed to create ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
            messageId: state.messageId,
        }, state, "Ticket creation failed");
    }
}

// --- Batch Processing Function (processUnreadEmails) ---
// Keep the existing batch function logic, it will now call the enhanced processSingleEmail
export async function processUnreadEmails(limit = 50): Promise<{
    success: boolean; message: string; processed: number; commentAdded: number;
    errors: number; skipped: number; discarded: number; quarantined: number; // Added discarded/quarantined
    automationAttempts: number; automationSuccess: number; results: ProcessEmailResult[];
}> {
    console.log(`[EmailProcessor Cron] Starting job run at ${new Date().toISOString()}`);
    const results: ProcessEmailResult[] = [];
    let processedCount = 0;
    let commentCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let discardedCount = 0;
    let quarantinedCount = 0;
    let automationAttempts = 0;
    let automationSuccess = 0;

    try {
        const messages = await graphService.getUnreadEmails(limit);
        console.log(`[EmailProcessor Cron] Found ${messages.length} unread emails to process.`);

        if (messages.length === 0) {
            return {
                success: true,
                message: 'No unread emails to process.',
                processed: 0, errors: 0, skipped: 0, commentAdded: 0,
                discarded: 0, quarantined: 0, automationAttempts: 0, automationSuccess: 0,
                results: []
            };
        }

        for (const message of messages) {
            console.log(`[EmailProcessor Cron] Processing message ID: ${message.id}, Subject: "${message.subject}"`);
            try {
                const result = await processSingleEmail(message);
                results.push(result);

                if (result.success) {
                    if (result.skipped) {
                        skippedCount++;
                    } else if (result.discarded) {
                        discardedCount++;
                    } else if (result.quarantined) {
                        quarantinedCount++;
                    } else if (result.ticketId) {
                        processedCount++;
                    } else if (result.commentId) {
                        commentCount++;
                    }
                    if (result.automation_info) {
                        automationAttempts++;
                        if (result.automation_info.found) {
                            automationSuccess++;
                        }
                    }
                } else {
                    errorCount++;
                }
            } catch (emailError: any) {
                console.error(`[EmailProcessor Cron] Error processing message ID ${message.id}:`, emailError);
                errorCount++;
                results.push({
                    success: false,
                    message: `Failed to process: ${emailError.message}`,
                    messageId: message.id
                });
            }
        }

        const summary = `[EmailProcessor Cron] Job finished. Results -> New Tickets: ${processedCount}, New Comments: ${commentCount}, Skipped: ${skippedCount}, Discarded: ${discardedCount}, Quarantined: ${quarantinedCount}, Errors: ${errorCount}.`;
        console.log(summary);
        
        return {
            success: true,
            message: summary,
            processed: processedCount,
            commentAdded: commentCount,
            errors: errorCount,
            skipped: skippedCount,
            discarded: discardedCount,
            quarantined: quarantinedCount,
            automationAttempts,
            automationSuccess,
            results,
        };

    } catch (error: any) {
        const errorMessage = `[EmailProcessor Cron] Critical error fetching unread emails: ${error.message}`;
        console.error(errorMessage, error);
        await alertService.trackErrorAndAlert('EmailProcessor-Cron-Failure', errorMessage, error);
        return {
            success: false,
            message: errorMessage,
            processed: 0, errors: 1, skipped: 0, commentAdded: 0,
            discarded: 0, quarantined: 0, automationAttempts: 0, automationSuccess: 0,
            results: []
        };
    }
}