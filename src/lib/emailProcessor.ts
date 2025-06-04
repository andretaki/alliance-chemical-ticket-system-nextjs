// src/lib/emailProcessor.ts
import { Message, InternetMessageHeader, NullableOption } from '@microsoft/microsoft-graph-types';
import * as graphService from '@/lib/graphService';
import * as alertService from '@/lib/alertService';
import { db } from '@/db';
import { tickets, users, ticketComments, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, quarantinedEmails, ticketSentimentEnum } from '@/db/schema'; // Added sentiment enum
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

// --- Helper: Find or Create User ---
async function findOrCreateUser(senderEmail: string, senderName?: string | null): Promise<string | null> {
    if (!senderEmail) {
        console.warn("EmailProcessor: Sender email missing.");
        return null;
    }

    try {
        let user = await db.query.users.findFirst({
            where: eq(users.email, senderEmail.toLowerCase()), // Ensure case-insensitive lookup
            columns: { id: true }
        });

        if (user) {
            return String(user.id); // Convert to string to match expected type (text)
        } else {
            console.log(`EmailProcessor: Creating new external user for ${senderEmail}`);
            const [newUser] = await db.insert(users).values({
                email: senderEmail.toLowerCase(),
                name: senderName || senderEmail.split('@')[0],
                password: null,
                role: 'user',
                isExternal: true,
            }).returning({ id: users.id });
            return String(newUser.id); // Convert to string to match expected type (text)
        }
    } catch (error) {
        console.error(`EmailProcessor: Error finding or creating user for ${senderEmail}:`, error);
        await alertService.trackErrorAndAlert(
            'EmailProcessor-User',
            `Failed to find or create user for ${senderEmail}`,
            error
        );
        return null;
    }
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
        return [];
    }
    // Remove angle brackets and return unique IDs
    return [...new Set(matches.map(id => id.substring(1, id.length - 1)))];
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

// --- Core Processing Function for a Single Email ---
export async function processSingleEmail(emailMessage: Message): Promise<ProcessEmailResult> {
    const messageId = emailMessage.id;
    const internetMessageId = nullableToOptional(emailMessage.internetMessageId);
    const senderEmail = emailMessage.sender?.emailAddress?.address;
    const senderName = emailMessage.sender?.emailAddress?.name;
    const subject = emailMessage.subject || "";
    const bodyPreview = emailMessage.bodyPreview || "";
    const receivedAt = emailMessage.receivedDateTime ? new Date(emailMessage.receivedDateTime) : new Date();
    const conversationId = emailMessage.conversationId;

    // Track processing state
    const processingState: EmailProcessingState = {
        messageId: messageId || 'unknown',
        internetMessageId,
        startTime: Date.now(),
        lockAcquired: false
    };

    try {
        // === Phase 0: Pre-processing Validation and Duplicate Prevention ===
        if (!messageId || !senderEmail) {
            console.warn(`EmailProcessor (Phase 0): Skipping email - missing critical ID or Sender.`);
            if (messageId) { try { await graphService.markEmailAsRead(messageId); } catch (e) { } }
            return { success: false, message: "Missing essential info (ID or Sender)", skipped: true };
        }

        // === Phase 0.1: In-Memory Lock Check ===
        if (internetMessageId && processingLocks.has(internetMessageId)) {
            console.log(`EmailProcessor (Phase 0.1): Email ${messageId} already being processed (internetMessageId: ${internetMessageId}). Waiting for completion...`);
            return await processingLocks.get(internetMessageId)!;
        }

        // === Phase 0.2: Database Lock Acquisition ===
        // NOTE: Temporarily disabled due to database compatibility issues
        // The other 4 layers should be sufficient for duplicate prevention
        /*
        if (internetMessageId) {
            const lockAcquired = await acquireEmailProcessingLock(internetMessageId);
            if (!lockAcquired) {
                console.log(`EmailProcessor (Phase 0.2): Failed to acquire processing lock for ${internetMessageId}. Another process is likely handling this email.`);
                return { success: true, message: "Email being processed by another instance", skipped: true };
            }
            processingState.lockAcquired = true;
            console.log(`EmailProcessor (Phase 0.2): Acquired processing lock for ${internetMessageId}`);
        }
        */

        // === Phase 0.3: Enhanced Atomic Duplicate Check ===
        if (internetMessageId) {
            const duplicateCheck = await performAtomicDuplicateCheck(internetMessageId);
            if (duplicateCheck.isDuplicate) {
                console.log(`EmailProcessor (Phase 0.3): Email ${messageId} is duplicate - already exists as ${duplicateCheck.type} (ID: ${duplicateCheck.ticketId || duplicateCheck.commentId || duplicateCheck.quarantineId})`);
                try { await graphService.markEmailAsRead(messageId); } catch(e){}
                return { 
                    success: true, 
                    message: `Duplicate email, already processed as ${duplicateCheck.type} ${duplicateCheck.ticketId || duplicateCheck.commentId || duplicateCheck.quarantineId}`, 
                    skipped: true,
                    ticketId: duplicateCheck.ticketId,
                    commentId: duplicateCheck.commentId
                };
            }
        }

        // === Phase 0.4: Create Processing Promise and Store in Lock Map ===
        const processingPromise = (async (): Promise<ProcessEmailResult> => {
            try {
                return await processSingleEmailInternal(emailMessage, processingState);
            } finally {
                // Clean up locks
                if (internetMessageId) {
                    // Database locks disabled - no cleanup needed
                    /*
                    if (processingState.lockAcquired) {
                        await releaseEmailProcessingLock(internetMessageId);
                    }
                    */
                    processingLocks.delete(internetMessageId);
                }
            }
        })();

        if (internetMessageId) {
            processingLocks.set(internetMessageId, processingPromise);
        }

        return await processingPromise;

    } catch (error: any) {
        // Clean up on error
        if (internetMessageId) {
            // Database locks disabled - no cleanup needed
            /*
            if (processingState.lockAcquired) {
                await releaseEmailProcessingLock(internetMessageId);
            }
            */
            processingLocks.delete(internetMessageId);
        }
        throw error;
    }
}

// Internal processing function (renamed from original processSingleEmail)
async function processSingleEmailInternal(emailMessage: Message, processingState: EmailProcessingState): Promise<ProcessEmailResult> {
    // FIX: Ensure messageId and senderEmail are non-null or handle cases where they might be.
    // The initial check in processSingleEmail should catch if messageId or senderEmail is null.
    // For TypeScript, we'll use non-null assertion or provide fallbacks where appropriate.
    const messageId = emailMessage.id!; // Asserting it's non-null based on earlier checks
    const internetMessageId = nullableToOptional(emailMessage.internetMessageId); // Can be null
    const senderEmail = emailMessage.sender?.emailAddress?.address!; // Asserting based on earlier checks
    const senderName = emailMessage.sender?.emailAddress?.name;
    const subject = emailMessage.subject || "";
    const bodyPreview = emailMessage.bodyPreview || "";
    const receivedAt = emailMessage.receivedDateTime ? new Date(emailMessage.receivedDateTime) : new Date();
    const conversationId = emailMessage.conversationId;

    // Update processingState's internetMessageId if it's not undefined and not null
    if (internetMessageId !== undefined && internetMessageId !== null) {
        processingState.internetMessageId = internetMessageId;
    }

    try {
        // === Phase 1: Preprocessing & Basic Validation ===
        const lowerSender = senderEmail!.toLowerCase();
        const lowerSubject = subject.toLowerCase();

        // === Phase 2: Hard Rules Filter ===
        const hardFilterRules: HardFilterRule[] = [
            { type: 'header', name: 'precedence', value: 'bulk' },
            { type: 'header', name: 'precedence', value: 'junk' },
            { type: 'header', name: 'x-auto-response-suppress', value: 'all' },
            { type: 'sender', pattern: 'mailer-daemon@' },
            { type: 'sender', pattern: 'noreply@' },
            { type: 'sender', pattern: 'notifications@example.com' }, // Replace example.com
            { type: 'subject', pattern: 'out of office' },
            { type: 'subject', pattern: 'automatic reply' },
            { type: 'subject', pattern: 'undeliverable:'}
        ];
        const headers = emailMessage.internetMessageHeaders as InternetMessageHeader[] | undefined;

        for (const rule of hardFilterRules) {
            let match = false;
            let ruleIdentifier = ''; // For logging

            switch (rule.type) {
                case 'header':
                    const header = headers?.find(h => h.name?.toLowerCase() === rule.name);
                    // Check if header.value exists before calling includes
                    if (header?.value && header.value.toLowerCase().includes(rule.value)) {
                        match = true;
                        ruleIdentifier = `${rule.name} header includes '${rule.value}'`;
                    }
                    break;
                case 'sender':
                    if (lowerSender.includes(rule.pattern)) {
                        match = true;
                        ruleIdentifier = `sender includes '${rule.pattern}'`;
                    }
                    break;
                case 'subject':
                    if (lowerSubject.includes(rule.pattern)) {
                        match = true;
                        ruleIdentifier = `subject includes '${rule.pattern}'`;
                    }
                    break;
            }


            if (match) {
                console.log(`EmailProcessor (Phase 2): Discarding email ${messageId} based on hard rule: ${ruleIdentifier}`);
                if (messageId) { try { await graphService.markEmailAsRead(messageId); } catch (e) { } }
                return { success: true, message: `Discarded by rule (${ruleIdentifier})`, discarded: true };
            }
        }
        // --- End Hard Rules Filtering ---

        // === Phase 3: Duplicate Check ===
        if (internetMessageId) {
            // Check tickets table
            const existingTicket = await db.query.tickets.findFirst({ where: eq(tickets.externalMessageId, internetMessageId), columns: { id: true }});
            if (existingTicket) {
                console.log(`EmailProcessor (Phase 3): Skipping duplicate email (Ticket ${existingTicket.id}) for internetMessageId: ${internetMessageId}`);
                if (messageId) { try { await graphService.markEmailAsRead(messageId); } catch(e){} }
                return { success: true, message: `Duplicate email, already processed as ticket ${existingTicket.id}`, skipped: true };
            }
            // Check comments table
            const existingComment = await db.query.ticketComments.findFirst({ where: eq(ticketComments.externalMessageId, internetMessageId), columns: { id: true, ticketId: true }});
             if (existingComment) {
                console.log(`EmailProcessor (Phase 3): Skipping duplicate email (Comment ${existingComment.id} for Ticket ${existingComment.ticketId}) for internetMessageId: ${internetMessageId}`);
                if (messageId) { try { await graphService.markEmailAsRead(messageId); } catch(e){} }
                return { success: true, message: `Duplicate email, already processed as comment ${existingComment.id}`, skipped: true };
            }
        } else {
             console.warn(`EmailProcessor (Phase 3): Message ID ${messageId} missing internetMessageId. Cannot perform robust duplicate check.`);
        }

        // === Phase 4: Threading Check ===
        const potentialParentIds = parseMessageIdHeader(headers?.find(h => h.name?.toLowerCase() === 'references')?.value)
                                 .concat(parseMessageIdHeader(headers?.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value));
        const uniqueParentIds = [...new Set(potentialParentIds)].filter(Boolean);

        let existingTicketId: number | null = null;
        let foundBy: string | null = null;

        if (uniqueParentIds.length > 0) {
           try {
                const potentialTickets = await db.query.tickets.findMany({
                    where: inArray(tickets.externalMessageId, uniqueParentIds),
                    columns: { id: true },
                    limit: 1
                });
                if (potentialTickets.length > 0) {
                    existingTicketId = potentialTickets[0].id;
                    foundBy = 'Headers';
                }
           } catch(dbError) { console.error("EmailProcessor (Phase 4): Error querying tickets by headers", dbError); }
        }
        // Check by conversation ID if header check failed
        if (!existingTicketId && conversationId) {
            try {
                const potentialTicket = await db.query.tickets.findFirst({
                    where: eq(tickets.conversationId, conversationId),
                    columns: { id: true }
                });
                 if (potentialTicket) {
                    existingTicketId = potentialTicket.id;
                    foundBy = 'Conversation ID';
                 }
            } catch(dbError) { console.error("EmailProcessor (Phase 4): Error querying tickets by conversation ID", dbError); }
        }

        // === Phase 5: Internal Domain Filter (for *new* threads only) ===
        const isInternalSender = lowerSender.endsWith(`@${INTERNAL_DOMAIN.toLowerCase()}`);
        if (isInternalSender && existingTicketId === null) {
            console.log(`EmailProcessor (Phase 5): Skipping new internal email from ${senderEmail} (Message ID: ${messageId})`);
            try { await graphService.markEmailAsRead(messageId); } catch (e) { }
            // Optionally move to "Processed" or "Internal-Ignored" folder
            return { success: true, message: "Skipped new internal email", skipped: true };
        }

        // === Phase 3: AI Analysis ===
        let aiAnalysis = null;
        try {
            aiAnalysis = await analyzeEmailContent(subject, bodyPreview);
            console.log(`EmailProcessor (Phase 3): AI Analysis for ${messageId}:`, aiAnalysis);

            // NOTE: Removed automatic flagging here - we'll only flag if a ticket is created
        } catch (error) {
            console.error(`EmailProcessor (Phase 3): AI Analysis failed for ${messageId}:`, error);
            await alertService.trackErrorAndAlert(
                'EmailProcessor-AI',
                `AI analysis failed for email ${messageId}`,
                error
            );
        }

        // --- If it's a Reply (Existing Ticket Found) ---
        if (existingTicketId !== null && foundBy) {
            console.log(`EmailProcessor (Phase 4 Handled): Email ${messageId} is a reply to Ticket ${existingTicketId} (found by ${foundBy}). Adding as comment.`);
            const replyCommenterId = await findOrCreateUser(senderEmail, senderName);
            if (!replyCommenterId) {
                 try { await graphService.markEmailAsRead(messageId); } catch(e){}
                 throw new Error(`Could not find or create user for reply sender: ${senderEmail}`);
            }
            const fullBodyContent = emailMessage.body?.content ?? bodyPreview; 
            try {
                const [newComment] = await db.insert(ticketComments).values({
                    ticketId: existingTicketId, commentText: fullBodyContent, commenterId: replyCommenterId,
                    isFromCustomer: !isInternalSender, isInternalNote: false, isOutgoingReply: isInternalSender, 
                    externalMessageId: internetMessageId || null, createdAt: receivedAt,
                }).returning({ id: ticketComments.id });
                console.log(`EmailProcessor: Added comment ${newComment.id} to ticket ${existingTicketId}.`);
                await graphService.markEmailAsRead(messageId);
                await db.update(tickets).set({ status: OPEN_STATUS, updatedAt: new Date() }).where(and(
                    eq(tickets.id, existingTicketId),
                    or(eq(tickets.status, ticketStatusEnum.enumValues[3]), eq(tickets.status, ticketStatusEnum.enumValues[4]))
                ));

                // **NEW: Generate AI suggested reply for customer replies**
                if (!isInternalSender) { // Only for customer replies
                    const analysisForReply = await analyzeEmailContent(subject, fullBodyContent);
                    if (analysisForReply?.suggestedReply) {
                        await db.insert(ticketComments).values({
                            ticketId: existingTicketId,
                            commentText: `**AI Suggested Reply:**\n${analysisForReply.suggestedReply}`,
                            commenterId: null, // System
                            isInternalNote: true,
                            isFromCustomer: false,
                        });
                        console.log(`EmailProcessor: Added AI suggested reply to ticket ${existingTicketId} based on customer's comment.`);
                    }
                }

                ticketEventEmitter.emit({ type: 'comment_added', ticketId: existingTicketId, commentId: newComment.id });
                return { success: true, ticketId: existingTicketId, commentId: newComment.id, message: "Reply added to ticket successfully" };
            } catch (commentError: any) {
                 if (commentError.code === '23505') {
                     console.warn(`EmailProcessor: Duplicate comment skipped (internetMessageId: ${internetMessageId}).`);
                     try { await graphService.markEmailAsRead(messageId); } catch(e){}
                     return { success: true, ticketId: existingTicketId, message: "Duplicate comment skipped", skipped: true };
                 }
                 throw commentError; // Rethrow other errors
            }
        }

        // === Phase 6: AI Triage ===
        console.log(`EmailProcessor (Phase 6): Email ${messageId} is a new thread. Sending for AI Triage.`);
        const triageResult = await triageEmailWithAI(subject, bodyPreview, senderEmail);

        if (!triageResult) {
            console.warn(`EmailProcessor (Phase 6): AI Triage failed for ${messageId}. Sending to quarantine.`);
            // Send to Quarantine as fallback
            try {
                await db.insert(quarantinedEmails).values({
                    originalGraphMessageId: messageId, 
                    internetMessageId: internetMessageId || `missing-${messageId}`, 
                    senderEmail: lowerSender, 
                    senderName: senderName, 
                    subject: subject, 
                    bodyPreview: bodyPreview, 
                    receivedAt: receivedAt,
                    aiClassification: false, 
                    aiReason: "AI Triage API call failed.", 
                    status: 'pending_review',
                    reviewerId: null
                });
                try { await graphService.markEmailAsRead(messageId); } catch(e){}
                return { success: false, message: "AI Triage failed, sent to quarantine", quarantined: true };
            } catch (quarantineError: any) {
                // Handle duplicate key constraint violation
                if (quarantineError.code === '23505' || 
                    (quarantineError.message && quarantineError.message.includes('duplicate key value violates unique constraint'))) {
                    console.log(`EmailProcessor-QuarantineFail: Email ${messageId} already in quarantine. Skipping duplicate quarantine.`);
                    if (messageId) {
                        try { await graphService.markEmailAsRead(messageId); } catch(e){}
                    }
                    
                    // Send specific alert about the quarantine fail situation
                    await alertService.trackErrorAndAlert(
                        'EmailProcessor-QuarantineFail',
                        `Failed to quarantine critically errored email ${messageId}`,
                        {
                            mainError: quarantineError.message || 'Unknown error',
                            quarantineError: quarantineError
                        }
                    );
                    
                    return { 
                        success: false, 
                        message: "Error processing email, already in quarantine", 
                        quarantined: true 
                    };
                }
                // Rethrow other errors
                throw quarantineError;
            }
        }

        // === Phase 7: Decision Gate ===
        console.log(`EmailProcessor (Phase 7): AI Triage for ${messageId}: ${triageResult.classification} (Confidence: ${triageResult.confidence})`);
        switch (triageResult.classification) {
            case 'CUSTOMER_SUPPORT_REQUEST':
            case 'CUSTOMER_REPLY': // Treat unexpected customer replies as new tickets if threading failed
                if (triageResult.confidence === 'low') {
                    console.log(`EmailProcessor: Low confidence customer request (${messageId}). Sending to quarantine.`);
                    try {
                        await db.insert(quarantinedEmails).values({
                            originalGraphMessageId: messageId,
                            internetMessageId: internetMessageId || `missing-${messageId}`,
                            senderEmail: lowerSender,
                            senderName: senderName,
                            subject: subject,
                            bodyPreview: bodyPreview,
                            receivedAt: receivedAt,
                            aiClassification: true,
                            aiReason: triageResult.reasoning,
                            status: 'pending_review',
                            reviewerId: null
                        });
                        try { await graphService.markEmailAsRead(messageId); } catch(e){}
                        return { success: true, message: "Sent to quarantine due to low AI confidence", quarantined: true, aiTriageClassification: triageResult.classification };
                    } catch (quarantineError: any) {
                        // Handle duplicate key constraint violation
                        if (quarantineError.code === '23505' || 
                            (quarantineError.message && quarantineError.message.includes('duplicate key value violates unique constraint'))) {
                            console.log(`EmailProcessor-QuarantineFail: Email ${messageId} already in quarantine. Skipping duplicate quarantine.`);
                            if (messageId) {
                                try { await graphService.markEmailAsRead(messageId); } catch(e){}
                            }
                            // Send specific alert about the quarantine fail situation
                            await alertService.trackErrorAndAlert(
                                'EmailProcessor-QuarantineFail',
                                `Failed to quarantine critically errored email ${messageId}`,
                                {
                                    mainError: quarantineError.message || 'Unknown error',
                                    quarantineError: quarantineError
                                }
                            );
                            return { 
                                success: false, 
                                message: "Error processing email, already in quarantine", 
                                quarantined: true 
                            };
                        }
                        // Rethrow other errors
                        throw quarantineError;
                    }
                }
                // --- Proceed to Phase 8: Data Extraction & Ticket Creation ---
                console.log(`EmailProcessor: Confirmed customer request (${messageId}). Proceeding to data extraction.`);
                break; // Exit switch to continue processing below

            case 'SYSTEM_NOTIFICATION':
            case 'MARKETING_PROMOTIONAL':
            case 'SPAM_PHISHING':
            case 'OUT_OF_OFFICE':
            case 'PERSONAL_INTERNAL':
            case 'VENDOR_BUSINESS':
                console.log(`EmailProcessor (Phase 7): Discarding email ${messageId} based on AI classification: ${triageResult.classification}`);
                try { await graphService.markEmailAsRead(messageId); } catch (e) { }
                // Optionally move to a specific folder based on classification
                return { success: true, message: `Discarded by AI (${triageResult.classification})`, discarded: true, aiTriageClassification: triageResult.classification };

            case 'UNCLEAR_NEEDS_REVIEW':
            default:
                console.log(`EmailProcessor (Phase 7): AI unclear for ${messageId}. Sending to quarantine.`);
                 await db.insert(quarantinedEmails).values({
                    originalGraphMessageId: messageId,
                    internetMessageId: internetMessageId || `missing-${messageId}`,
                    senderEmail: lowerSender,
                    senderName: senderName,
                    subject: subject,
                    bodyPreview: bodyPreview,
                    receivedAt: receivedAt,
                    aiClassification: false,
                    aiReason: triageResult.reasoning,
                    status: 'pending_review',
                    reviewerId: null
                 });
                 try { await graphService.markEmailAsRead(messageId); } catch(e){}
                return { success: true, message: "Sent to quarantine for review (AI unclear)", quarantined: true, aiTriageClassification: triageResult.classification };
        }

        // === Phase 8: Data Extraction & Ticket Creation ===
        // This part only runs if triage passed it as a customer request

        // Fetch full body *now* that we know we need it
        const fullMessageDetails = await graphService.getMessageById(messageId); // Fetch again for full body
        const fullBody = fullMessageDetails?.body?.content ?? bodyPreview; // Use full body if available

        let analysisResult: EmailAnalysisResult | null = await analyzeEmailContent(subject, fullBody); // Use the *extraction* AI
        const reporterId = await findOrCreateUser(senderEmail, senderName); // Re-confirm user ID
        if (!reporterId) { throw new Error(`User creation failed just before ticket creation for ${senderEmail}`); }

        // --- NEW: Map keywords to Assignee ID ---
        const suggestedAssigneeId = await mapKeywordsToAssigneeId(analysisResult?.suggestedRoleOrKeywords || null);

        let automationAttempted = false;
        let automationInfo: OrderTrackingInfo | null = null;
        let draftReplyContent: string | null = null; // CoA draft
        let ticketStatus: typeof ticketStatusEnum.enumValues[number] = analysisResult?.prioritySuggestion === 'urgent' ? OPEN_STATUS : DEFAULT_STATUS; // Start as Open if Urgent

        // NEW: Check for order status inquiry and generate response
        if (senderName && (analysisResult?.orderNumber || analysisResult?.intent === 'order_status_inquiry' || subject.toLowerCase().includes('order'))) {
            console.log(`EmailProcessor: Checking for order status inquiry from ${senderName}`);
            automationAttempted = true;
            
            const orderResponse = await checkOrderAndGenerateResponse(
                senderName,
                subject,
                fullBody
            );
            
            console.log(`EmailProcessor DEBUG: Order response result:`, {
                orderFound: orderResponse.orderFound,
                hasResponseText: !!orderResponse.responseText,
                orderNumber: orderResponse.orderNumber,
                responseTextLength: orderResponse.responseText?.length || 0,
                responsePreview: orderResponse.responseText?.substring(0, 100) || 'No response text'
            });
            
            if (orderResponse.orderFound) {
                console.log(`EmailProcessor: Order found, generating response`);
                
                // Use the generated response as draft reply
                draftReplyContent = orderResponse.responseText;
                console.log(`EmailProcessor DEBUG: Set draftReplyContent:`, {
                    hasDraftContent: !!draftReplyContent,
                    draftLength: draftReplyContent?.length || 0,
                    draftPreview: draftReplyContent?.substring(0, 100) || 'No draft content'
                });
                
                // Update ticket status to pending if we have a draft
                if (draftReplyContent) {
                    ticketStatus = PENDING_CUSTOMER_STATUS;
                }
                
                // If we found an order number not already detected by AI, update it
                if (orderResponse.orderNumber && !analysisResult?.orderNumber) {
                    // Update only the orderNumber field, preserving the original type
                    analysisResult = {
                        ...analysisResult,
                        orderNumber: orderResponse.orderNumber
                    } as typeof analysisResult;
                }
            } else {
                console.log(`EmailProcessor DEBUG: Order not found in checkOrderAndGenerateResponse`);
            }
        }

        // Check for missing Lot# on COA requests AFTER confirming it's a customer request
         if (analysisResult && 
             (analysisResult.intent === 'documentation_request') && 
             ((analysisResult.ticketType === 'COA Request') || 
              (analysisResult.documentType === 'COA' && analysisResult.documentRequestConfidence !== 'low')) && 
             !analysisResult.lotNumber) {
             console.log(`EmailProcessor: COA request (${messageId}) missing Lot Number. Drafting reply.`);
             automationAttempted = true; // Consider this an "automation" attempt
             const customerName = extractFirstName(senderName, senderEmail);
             const productName = analysisResult.summary.includes('for') ? analysisResult.summary.split('for')[1].trim() : "the product";
             draftReplyContent = `Hi ${customerName},\n\nTo provide the correct Certificate of Analysis (CoA), please reply with the Lot Number for ${productName}.\n\nOrder #: ${analysisResult.orderNumber || '(Not Found)'}\n\nBest regards,\nAlliance Chemical Support`.trim();
             ticketStatus = PENDING_CUSTOMER_STATUS; // Use the constant
         } else if (analysisResult && 
                   (analysisResult.intent === 'documentation_request') && 
                   ((analysisResult.ticketType === 'SDS Request') || 
                    (analysisResult.documentType === 'SDS' && analysisResult.documentRequestConfidence !== 'low'))) {
             console.log(`EmailProcessor: SDS request (${messageId}). Drafting reply.`);
             automationAttempted = true;
             const customerName = extractFirstName(senderName, senderEmail);
             const productName = analysisResult.summary.includes('for') ? analysisResult.summary.split('for')[1].trim() : "the product";
             draftReplyContent = `Hi ${customerName},\n\nThank you for your request for the Safety Data Sheet (SDS) for ${productName}.\n\nI have attached the requested SDS document to this email. Please let me know if you need any additional information.\n\nBest regards,\nAlliance Chemical Support`.trim();
             ticketStatus = DEFAULT_STATUS;
         } else if (analysisResult && 
                   (analysisResult.intent === 'documentation_request') && 
                   ((analysisResult.ticketType === 'COC Request') || 
                    (analysisResult.documentType === 'COC' && analysisResult.documentRequestConfidence !== 'low'))) {
             console.log(`EmailProcessor: COC request (${messageId}). Drafting reply.`);
             automationAttempted = true;
             const customerName = extractFirstName(senderName, senderEmail);
             const productName = analysisResult.summary.includes('for') ? analysisResult.summary.split('for')[1].trim() : "the product";
             const orderRef = analysisResult.orderNumber ? `for order #${analysisResult.orderNumber}` : "";
             draftReplyContent = `Hi ${customerName},\n\nThank you for your request for the Certificate of Conformity (COC) for ${productName} ${orderRef}.\n\nTo provide the correct Certificate of Conformity, please confirm the following information:\n\n1. Order number (if not provided)\n2. Product name and grade\n3. Purchase date (approximate is fine)\n\nOnce we have this information, we'll locate and send the appropriate document.\n\nBest regards,\nAlliance Chemical Support`.trim();
             ticketStatus = PENDING_CUSTOMER_STATUS;
         } else if (analysisResult && 
                  (analysisResult.intent === 'documentation_request') && 
                  (analysisResult.documentType === 'OTHER' && analysisResult.documentRequestConfidence !== 'low')) {
             console.log(`EmailProcessor: Other documentation request (${messageId}): ${analysisResult.documentName}. Drafting reply.`);
             automationAttempted = true;
             const customerName = extractFirstName(senderName, senderEmail);
             const documentName = analysisResult.documentName || "requested document";
             const productName = analysisResult.summary.includes('for') ? analysisResult.summary.split('for')[1].trim() : "the product";
             const orderRef = analysisResult.orderNumber ? `for order #${analysisResult.orderNumber}` : "";
             draftReplyContent = `Hi ${customerName},\n\nThank you for your request for the ${documentName} for ${productName} ${orderRef}.\n\nTo help us locate the correct documentation, please provide the following details:\n\n1. Specific product name and grade\n2. Order number (if applicable)\n3. Any specific version or format requirements for the document\n\nOnce we have this information, our team will work to provide the documentation you need.\n\nBest regards,\nAlliance Chemical Support`.trim();
             ticketStatus = PENDING_CUSTOMER_STATUS;
         }

        // ShipStation Lookup (if applicable)
        if (analysisResult?.orderNumber && (analysisResult.intent === 'order_status_inquiry' || analysisResult.intent === 'tracking_request')) {
            automationAttempted = true;
            
            // Only perform ShipStation lookup if we haven't already done it in the order status check
            if (!draftReplyContent) {
                automationInfo = await getOrderTrackingInfo(analysisResult.orderNumber);

                // Try to generate an automated response for order status inquiries
                if (automationInfo?.found) {
                    console.log(`EmailProcessor: Attempting to generate order status response for ${messageId}`);
                    const customerName = extractFirstName(senderName, senderEmail);
                    const orderResponse = await checkOrderAndGenerateResponse(customerName, subject, fullBody);
                    
                    if (orderResponse.responseText) {
                        console.log(`EmailProcessor: Successfully generated order status response for order ${orderResponse.orderNumber}`);
                        draftReplyContent = orderResponse.responseText;
                        
                        // Set appropriate ticket status based on whether a reply was generated
                        if (automationInfo.orderStatus === 'shipped' && automationInfo.shipments && automationInfo.shipments.length > 0) {
                            ticketStatus = DEFAULT_STATUS; // For shipped orders, we provide tracking info and stay in DEFAULT_STATUS
                        } else {
                            ticketStatus = PENDING_CUSTOMER_STATUS; // For processing orders, we may need more info
                        }
                    }
                }
            }
        }

        // **NEW: Combine specific drafts with general AI suggested reply**
        let internalNoteForAISuggestion = '';
        console.log(`EmailProcessor DEBUG: Draft selection logic:`, {
            hasDraftReplyContent: !!draftReplyContent,
            draftReplyPreview: draftReplyContent?.substring(0, 50) || 'No draft',
            hasAISuggestedReply: !!analysisResult?.suggestedReply,
            aiSuggestedReplyPreview: analysisResult?.suggestedReply?.substring(0, 50) || 'No AI suggestion',
            intent: analysisResult?.intent,
            orderNumber: analysisResult?.orderNumber
        });
        
        if (draftReplyContent) { // Specific draft takes precedence
            console.log(`EmailProcessor DEBUG: Using specific draft reply (length: ${draftReplyContent.length})`);
            // Add document type-specific label to the internal note
            let replyLabel = "Suggested Reply";
            if (analysisResult?.documentType === 'COA' || analysisResult?.ticketType === 'COA Request') {
                replyLabel += " (Request for Lot #)";
            } else if (analysisResult?.documentType === 'SDS' || analysisResult?.ticketType === 'SDS Request') {
                replyLabel += " (SDS Document)";
            } else if (analysisResult?.documentType === 'COC' || analysisResult?.ticketType === 'COC Request') {
                replyLabel += " (COC Information)";
            } else if (analysisResult?.documentType === 'OTHER') {
                replyLabel += ` (${analysisResult.documentName || "Document Request"})`;
            } else if (analysisResult?.intent === 'order_status_inquiry' || analysisResult?.intent === 'tracking_request') {
                replyLabel = "Order Status Reply";
                
                // Add detailed information about found order status
                if (automationInfo?.orderStatus === 'shipped' && automationInfo.shipments && automationInfo.shipments.length > 0) {
                    const shipment = automationInfo.shipments[0];
                    replyLabel += ` - Shipped via ${shipment.carrier}`;
                } else if (automationInfo?.orderStatus) {
                    replyLabel += ` - ${automationInfo.orderStatus.replace('_', ' ').toUpperCase()}`;
                }
            }
            internalNoteForAISuggestion = `**${replyLabel}:**\n${draftReplyContent}`;
        } else if (analysisResult?.suggestedReply) { // Use general AI reply if no specific one
            console.log(`EmailProcessor DEBUG: Using general AI suggested reply (length: ${analysisResult.suggestedReply.length})`);
            internalNoteForAISuggestion = `**AI Suggested Reply:**\n${analysisResult.suggestedReply}`;
            if (ticketStatus === DEFAULT_STATUS && !isInternalSender) ticketStatus = OPEN_STATUS; // If AI suggests a reply for customer, open ticket
        } else {
            console.log(`EmailProcessor DEBUG: No draft or AI suggestion available`);
        }

        // --- Prepare ticket data WITH NEW FIELDS ---
        const ticketData = {
            title: analysisResult?.summary?.substring(0, 255) || subject.substring(0, 255),
            description: fullBody,
            reporterId: reporterId,
            priority: analysisResult?.prioritySuggestion || DEFAULT_PRIORITY,
            status: ticketStatus,
            type: (analysisResult?.ticketType && ticketTypeEcommerceEnum.enumValues.includes(analysisResult.ticketType as any))
                  ? analysisResult.ticketType as typeof ticketTypeEcommerceEnum.enumValues[number]
                  : DEFAULT_TYPE,
            orderNumber: analysisResult?.orderNumber || null,
            trackingNumber: analysisResult?.trackingNumber || automationInfo?.shipments?.[0]?.trackingNumber || null,
            senderEmail: senderEmail,
            senderName: senderName,
            externalMessageId: internetMessageId || null,
            conversationId: conversationId || null,
            createdAt: receivedAt,
            // --- ADD NEW FIELDS ---
            sentiment: analysisResult?.sentiment || null, // Default to null if AI doesn't provide it
            ai_summary: analysisResult?.ai_summary || null,
            ai_suggested_assignee_id: suggestedAssigneeId, // Store the suggested ID
        };

        // Create Ticket with duplicate handling
        let newTicket;
        try {
            [newTicket] = await db.insert(tickets).values(ticketData).returning({ id: tickets.id });
            console.log(`EmailProcessor (Phase 8): Created ticket ${newTicket.id} for email ${messageId}.`);
        } catch (insertError: any) {
            // Handle duplicate key constraint violation
            if (insertError.code === '23505' && insertError.constraint_name === 'tickets_external_message_id_unique') {
                console.warn(`EmailProcessor (Phase 8): Duplicate ticket creation attempt for external_message_id: ${internetMessageId}. Checking for existing ticket...`);
                
                // Perform one final check to find the existing ticket
                const existingTicket = internetMessageId ? await db.query.tickets.findFirst({ 
                    where: eq(tickets.externalMessageId, internetMessageId), 
                    columns: { id: true }
                }) : null;
                
                if (existingTicket) {
                    console.log(`EmailProcessor (Phase 8): Found existing ticket ${existingTicket.id} for email ${messageId}. Treating as successful duplicate handling.`);
                    try { await graphService.markEmailAsRead(messageId); } catch(e){}
                    return { 
                        success: true, 
                        ticketId: existingTicket.id,
                        message: `Email already processed as ticket ${existingTicket.id} (duplicate creation attempt handled)`, 
                        skipped: true 
                    };
                } else {
                    // This shouldn't happen, but if it does, we need to quarantine
                    console.error(`EmailProcessor (Phase 8): Duplicate constraint violated but no existing ticket found for ${internetMessageId}. Quarantining for review.`);
                    
                    try {
                        await db.insert(quarantinedEmails).values({
                            originalGraphMessageId: messageId,
                            internetMessageId: internetMessageId || `duplicate-error-${messageId}-${Date.now()}`,
                            senderEmail: senderEmail,
                            senderName: senderName,
                            subject: subject,
                            bodyPreview: bodyPreview,
                            receivedAt: receivedAt,
                            aiClassification: false,
                            aiReason: `Duplicate constraint violation without existing record: ${insertError.message}`,
                            status: 'pending_review',
                            reviewerId: null
                        });
                        
                        try { await graphService.markEmailAsRead(messageId); } catch(e){}
                        
                        return { 
                            success: false, 
                            message: "Duplicate constraint violation, quarantined for review", 
                            quarantined: true 
                        };
                    } catch (quarantineError: any) {
                        // If we can't even quarantine, something is seriously wrong
                        console.error(`EmailProcessor (Phase 8): Failed to quarantine after duplicate constraint violation:`, quarantineError);
                        throw insertError; // Re-throw the original error
                    }
                }
            } else {
                // Re-throw other insertion errors
                throw insertError;
            }
        }

        // === INTELLIGENT FLAGGING: Flag ALL customer requests for human review ===
        // Since we want human-in-the-loop for all customer requests, flag every ticket created
        let shouldFlag = true; // Always flag customer requests
        let flagReason = 'customer request requiring human review';

        // Add specific reasons for high-priority or critical issues
        if (ticketData.priority === 'high' || ticketData.priority === 'urgent') {
            flagReason = `${ticketData.priority} priority customer request`;
        } else if (analysisResult?.intent === 'return_request' || 
                   analysisResult?.sentiment === 'negative' ||
                   analysisResult?.ticketType === 'Return' ||
                   analysisResult?.intent === 'order_issue') {
            flagReason = `${analysisResult.intent || analysisResult.ticketType} requiring urgent attention`;
        } else if (analysisResult?.intent === 'documentation_request') {
            flagReason = 'documentation request requiring review';
        } else if (analysisResult?.intent === 'order_status_inquiry' || analysisResult?.intent === 'tracking_request') {
            flagReason = 'order inquiry requiring review';
        }

        if (shouldFlag) {
            try {
                await graphService.flagEmail(messageId, 'red');
                console.log(`EmailProcessor: Flagged ticket ${newTicket.id} email (${flagReason})`);
            } catch (flagError) {
                console.warn(`EmailProcessor: Failed to flag email ${messageId} for ticket ${newTicket.id}:`, flagError);
            }
        }
        
        if (internalNoteForAISuggestion.trim()) {
             const noteTextToSave = internalNoteForAISuggestion.replace("(Ref: Ticket ID will be generated shortly)", `(Ref: Ticket #${newTicket.id})`);
             await db.insert(ticketComments).values({
                 ticketId: newTicket.id, commentText: noteTextToSave, commenterId: null, // System
                 isInternalNote: true, isFromCustomer: false
             });
             console.log(`EmailProcessor: Added internal AI suggestion note to ticket ${newTicket.id}`);
        }

        await graphService.markEmailAsRead(messageId);
        ticketEventEmitter.emit({ type: 'ticket_created', ticketId: newTicket.id });
        return {
            success: true, ticketId: newTicket.id,
            message: internalNoteForAISuggestion ? "Ticket created; AI reply drafted." : "Ticket created successfully.",
            aiTriageClassification: triageResult.classification,
            automation_attempted: automationAttempted, 
            automation_info: automationInfo
        };

    } catch (processingError: any) {
        console.error(`EmailProcessor: Error processing email ${messageId}:`, processingError);
        
        // Try to quarantine the problematic email
        try {
            // Alert the error before trying to quarantine
            await alertService.trackErrorAndAlert(
                'EmailProcessor-Error',
                `Failed to process email ${messageId}`,
                processingError
            );
            
            // Try to quarantine the email that caused the error
            try {
                if (!messageId) {
                    throw new Error('Message ID is undefined');
                }
                
                const quarantineData = {
                    originalGraphMessageId: messageId,
                    internetMessageId: internetMessageId || `error-${messageId}-${Date.now()}`,
                    senderEmail: senderEmail || 'unknown@example.com',
                    senderName: senderName || 'Unknown Sender',
                    subject: subject || '[No Subject]',
                    bodyPreview: bodyPreview || 'Error occurred while processing this email',
                    receivedAt: receivedAt,
                    aiClassification: false,
                    aiReason: `Error: ${processingError.message || 'Unknown error'}`,
                    status: 'pending_review' as const,
                    reviewerId: null
                };
                
                await db.insert(quarantinedEmails).values(quarantineData);
                
                console.log(`EmailProcessor: Quarantined errored email ${messageId}`);
                await graphService.markEmailAsRead(messageId);
                
                return { 
                    success: false, 
                    message: `Error processing email, quarantined for review: ${processingError.message || 'Unknown error'}`,
                    quarantined: true
                };
            } catch (quarantineError: any) {
                // If quarantine fails due to duplicate key, log and move on
                if (quarantineError.code === '23505' || 
                    (quarantineError.message && quarantineError.message.includes('duplicate key value violates unique constraint'))) {
                    console.log(`EmailProcessor-QuarantineFail: Email ${messageId} already in quarantine. Skipping duplicate quarantine.`);
                    if (messageId) {
                        await graphService.markEmailAsRead(messageId);
                    }
                    
                    // Send specific alert about the quarantine fail situation
                    await alertService.trackErrorAndAlert(
                        'EmailProcessor-QuarantineFail',
                        `Failed to quarantine critically errored email ${messageId}`,
                        {
                            mainError: quarantineError.message || 'Unknown error',
                            quarantineError: quarantineError
                        }
                    );
                    
                    return { 
                        success: false, 
                        message: "Error processing email, already in quarantine", 
                        quarantined: true 
                    };
                }
                
                // For other quarantine errors, log this additional failure
                console.error(`EmailProcessor: Failed to quarantine errored email ${messageId}:`, quarantineError);
                await alertService.trackErrorAndAlert(
                    'EmailProcessor-CriticalFail',
                    `Failed to quarantine errored email ${messageId}`,
                    {
                        mainError: processingError.message || 'Unknown error',
                        quarantineError: quarantineError
                    }
                );
            }
        } catch (alertError) {
            console.error(`EmailProcessor: Critical failure in error handling for ${messageId}:`, alertError);
        }
        
        // Return failure, but don't throw
        return { success: false, message: `Error processing email: ${processingError.message || 'Unknown error'}` };
    }
}

// --- Batch Processing Function (processUnreadEmails) ---
// Keep the existing batch function logic, it will now call the enhanced processSingleEmail
export async function processUnreadEmails(limit = 50): Promise<{
    success: boolean; message: string; processed: number; commentAdded: number;
    errors: number; skipped: number; discarded: number; quarantined: number; // Added discarded/quarantined
    automationAttempts: number; automationSuccess: number; results: ProcessEmailResult[];
}> {
    let processedCount = 0, commentAddedCount = 0, errorCount = 0, skippedCount = 0;
    let discardedCount = 0, quarantinedCount = 0; // Track new outcomes
    let automationAttempts = 0, automationSuccess = 0;
    const results: ProcessEmailResult[] = [];

    console.log(`EmailProcessor: Starting batch processing (limit ${limit}).`);
    let unreadEmails: Message[];
    try {
        unreadEmails = await graphService.getUnreadEmails(limit);
    } catch (fetchError: any) {
        console.error("EmailProcessor Batch: Failed fetch.", fetchError);
        await alertService.trackErrorAndAlert('EmailProcessor-Fetch', 'Batch fetch failed', fetchError);
        // Return structure matches expected output
        return { success: false, message: `Fetch failed: ${fetchError.message}`, processed: 0, commentAdded: 0, errors: 1, skipped: 0, discarded: 0, quarantined: 0, automationAttempts: 0, automationSuccess: 0, results: [] };
    }

    if (unreadEmails.length === 0) {
         return { success: true, message: "No unread emails.", processed: 0, commentAdded: 0, errors: 0, skipped: 0, discarded: 0, quarantined: 0, automationAttempts: 0, automationSuccess: 0, results: [] };
    }

    console.log(`EmailProcessor Batch: Found ${unreadEmails.length} emails. Processing...`);
    for (const email of unreadEmails) {
        const result = await processSingleEmail(email);
        results.push(result);

        if (result.automation_attempted) automationAttempts++;
        if (result.automation_info?.found) automationSuccess++;

        if (result.success) {
            if (result.skipped) skippedCount++;
            else if (result.discarded) discardedCount++;
            else if (result.quarantined) quarantinedCount++;
            else if (result.commentId) commentAddedCount++;
            else processedCount++; // Created new ticket
        } else {
            // Only count as error if it wasn't explicitly quarantined due to the error itself
            if (!result.quarantined) {
                errorCount++;
            }
        }
    }

    const summary = `Batch complete. New Tickets: ${processedCount}, Comments: ${commentAddedCount}, Quarantined: ${quarantinedCount}, Discarded: ${discardedCount}, Skipped (Dup/Int): ${skippedCount}, Errors: ${errorCount}. Automation: ${automationSuccess}/${automationAttempts}.`;
    console.log(`EmailProcessor Batch: ${summary}`);

     if (errorCount > 0) {
         // Filter results to only include non-successful, non-quarantined items for the alert
         const criticalErrorDetails = results.filter(r => !r.success && !r.quarantined);
         await alertService.trackErrorAndAlert('EmailProcessor-Batch', `Batch finished with ${errorCount} critical processing errors`, { errors: criticalErrorDetails });
     }

    return {
        success: errorCount === 0, message: summary, processed: processedCount, commentAdded: commentAddedCount,
        errors: errorCount, skipped: skippedCount, discarded: discardedCount, quarantined: quarantinedCount,
        automationAttempts, automationSuccess, results
    };
}