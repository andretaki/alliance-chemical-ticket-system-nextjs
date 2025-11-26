// src/lib/emailProcessor.ts
// Streamlined Email Processor - AI Triage moved to microservice
import { Message } from '@microsoft/microsoft-graph-types';
import * as graphService from '@/lib/graphService';
import * as alertService from '@/lib/alertService';
import { db, tickets, users, ticketComments, ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, ticketSentimentEnum } from '@/lib/db';
import { eq, or, inArray } from 'drizzle-orm';
import { analyzeEmailContent } from '@/lib/aiService';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { sanitizeHtmlContent, validateEmailDomain } from '@/lib/validators';

// --- Types ---
interface ProcessEmailResult {
  success: boolean;
  ticketId?: number;
  commentId?: number;
  message?: string;
  error?: string;
  skipped?: boolean;
}

// --- Duplicate Detection (Atomic & Performant) ---
async function isDuplicateEmail(internetMessageId: string): Promise<boolean> {
  if (!internetMessageId) return false;

  // Single query with OR condition is more performant than 3 separate queries
  const [existingTicket, existingComment] = await Promise.all([
    db.query.tickets.findFirst({
      where: eq(tickets.externalMessageId, internetMessageId),
      columns: { id: true }
    }),
    db.query.ticketComments.findFirst({
      where: eq(ticketComments.externalMessageId, internetMessageId),
      columns: { id: true }
    })
  ]);

  return !!(existingTicket || existingComment);
}

// --- Thread Detection ---
async function findExistingThread(emailMessage: Message): Promise<{ ticketId: number } | null> {
  const headers = emailMessage.internetMessageHeaders || [];

  const inReplyTo = headers.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value;
  const references = headers.find(h => h.name?.toLowerCase() === 'references')?.value;

  // Extract message IDs from headers
  const parseMessageIds = (header: string | null | undefined): string[] => {
    if (!header) return [];
    const matches = header.match(/<([^>]+)>/g);
    return matches ? matches.map(id => id.slice(1, -1)) : [];
  };

  const referencedIds = [
    ...parseMessageIds(inReplyTo),
    ...parseMessageIds(references),
  ].filter(Boolean);

  if (referencedIds.length === 0) return null;

  // Check if any referenced message ID belongs to an existing ticket
  const existingTicket = await db.query.tickets.findFirst({
    where: inArray(tickets.externalMessageId, referencedIds),
    columns: { id: true }
  });

  if (existingTicket) return { ticketId: existingTicket.id };

  // Check comments to find parent ticket
  const existingComment = await db.query.ticketComments.findFirst({
    where: inArray(ticketComments.externalMessageId, referencedIds),
    columns: { ticketId: true }
  });

  if (existingComment) return { ticketId: existingComment.ticketId };

  return null;
}

// --- User Management with Transaction Safety ---
async function findOrCreateUser(
  email: string,
  name: string | undefined
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // Try to find existing user
    let user = await tx.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true }
    });

    if (user) return user;

    // Create new user (with race condition handling)
    try {
      const [newUser] = await tx.insert(users).values({
        email,
        name: name || email.split('@')[0], // Fallback to email username
        role: 'user',
        isExternal: true,
        approvalStatus: 'approved', // Auto-approve external ticket creators
      }).returning({ id: users.id });

      return newUser;
    } catch (error) {
      // Race condition: another process created the user
      // Retry the find operation
      const retryUser = await tx.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true }
      });

      if (retryUser) {
        console.log(`[EmailProcessor] Race condition handled for user ${email}`);
        return retryUser;
      }

      throw error; // Re-throw if it's a different error
    }
  });
}

// --- Comment Creation (Thread Reply) ---
async function createCommentForThread(
  ticketId: number,
  content: string,
  internetMessageId: string,
  senderEmail: string,
  graphMessageId: string
): Promise<ProcessEmailResult> {
  console.log(`[EmailProcessor] Creating comment for ticket #${ticketId}`);

  try {
    const user = await findOrCreateUser(senderEmail, undefined);

    const [newComment] = await db.insert(ticketComments).values({
      ticketId,
      commentText: content,
      isFromCustomer: true,
      isInternalNote: false,
      isOutgoingReply: false,
      externalMessageId: internetMessageId,
      commenterId: user.id,
      createdAt: new Date(),
    }).returning({ id: ticketComments.id });

    // Re-open ticket when customer replies
    await db.update(tickets)
      .set({
        status: 'open',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId));

    // Mark email as processed
    await graphService.markEmailAsRead(graphMessageId);

    // Flag email for agent review
    try {
      await graphService.flagEmail(graphMessageId);
      console.log(`[EmailProcessor] Flagged reply email for ticket #${ticketId}`);
    } catch (flagError) {
      console.error(`[EmailProcessor] Failed to flag email:`, flagError);
      await alertService.trackErrorAndAlert(
        'EmailFlagging-Reply-Failure',
        `Failed to flag reply for ticket #${ticketId}`,
        { ticketId, error: flagError instanceof Error ? flagError.message : String(flagError) }
      );
    }

    ticketEventEmitter.emit({ type: 'comment_added', ticketId, commentId: newComment.id });

    return {
      success: true,
      ticketId,
      commentId: newComment.id,
      message: `Comment added to ticket #${ticketId}`,
    };
  } catch (error) {
    const errorMessage = `Failed to create comment for ticket #${ticketId}`;
    console.error(`[EmailProcessor] ${errorMessage}:`, error);

    await alertService.trackErrorAndAlert(
      'EmailProcessing-Comment-Failure',
      errorMessage,
      { ticketId, error: error instanceof Error ? error.message : String(error) }
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// --- Ticket Creation (New Request) ---
async function createNewTicket(
  emailMessage: Message,
  content: string,
  internetMessageId: string,
  senderEmail: string,
  senderName: string | undefined
): Promise<ProcessEmailResult> {
  console.log(`[EmailProcessor] Creating new ticket from ${senderEmail}`);

  try {
    // Validate email domain
    if (!validateEmailDomain(senderEmail)) {
      console.warn(`[EmailProcessor] Rejected email from suspicious domain: ${senderEmail}`);
      return {
        success: false,
        error: 'Email from blacklisted domain',
        skipped: true,
      };
    }

    // Find or create reporter
    const reporter = await findOrCreateUser(senderEmail, senderName);

    // AI analysis for metadata extraction (optional - can be disabled)
    let aiAnalysis = null;
    try {
      aiAnalysis = await analyzeEmailContent(
        emailMessage.subject || 'No Subject',
        content
      );
    } catch (aiError) {
      console.error(`[EmailProcessor] AI analysis failed, continuing without it:`, aiError);
      // Continue ticket creation even if AI fails
    }

    // Create ticket
    const [newTicket] = await db.insert(tickets).values({
      title: aiAnalysis?.summary || emailMessage.subject?.substring(0, 255) || 'New Support Request',
      description: content,
      status: 'new' as typeof ticketStatusEnum.enumValues[number],
      priority: (aiAnalysis?.prioritySuggestion || 'medium') as typeof ticketPriorityEnum.enumValues[number],
      type: (aiAnalysis?.ticketType && aiAnalysis.ticketType !== 'Other'
        ? aiAnalysis.ticketType
        : 'General Inquiry') as typeof ticketTypeEcommerceEnum.enumValues[number],
      sentiment: (aiAnalysis?.sentiment || 'neutral') as typeof ticketSentimentEnum.enumValues[number],
      ai_summary: aiAnalysis?.ai_summary,
      aiSuggestedAction: aiAnalysis?.suggestedAction,
      senderEmail,
      senderName: senderName || senderEmail.split('@')[0],
      reporterId: reporter.id,
      externalMessageId: internetMessageId,
      conversationId: emailMessage.conversationId,
      orderNumber: aiAnalysis?.orderNumber,
      trackingNumber: aiAnalysis?.trackingNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Flag email for agent review
    try {
      await graphService.flagEmail(emailMessage.id!);
      console.log(`[EmailProcessor] Flagged new ticket email for ticket #${newTicket.id}`);
    } catch (flagError) {
      console.error(`[EmailProcessor] Failed to flag email:`, flagError);
      await alertService.trackErrorAndAlert(
        'EmailFlagging-NewTicket-Failure',
        `Failed to flag new ticket email for ticket #${newTicket.id}`,
        { ticketId: newTicket.id, error: flagError instanceof Error ? flagError.message : String(flagError) }
      );
    }

    // Mark as processed
    await graphService.markEmailAsRead(emailMessage.id!);

    ticketEventEmitter.emit({ type: 'ticket_created', ticketId: newTicket.id });

    return {
      success: true,
      ticketId: newTicket.id,
      message: `New ticket created: #${newTicket.id}`,
    };
  } catch (error) {
    const errorMessage = `Failed to create ticket from ${senderEmail}`;
    console.error(`[EmailProcessor] ${errorMessage}:`, error);

    await alertService.trackErrorAndAlert(
      'EmailProcessing-Ticket-Creation-Failure',
      errorMessage,
      { senderEmail, error: error instanceof Error ? error.message : String(error) }
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// --- Main Processor ---
export async function processSingleEmail(emailMessage: Message): Promise<ProcessEmailResult> {
  const messageId = emailMessage.id!;
  const internetMessageId = emailMessage.internetMessageId;
  const startTime = Date.now();

  console.log(`[EmailProcessor] Processing email ${messageId}`);

  if (!internetMessageId) {
    console.error(`[EmailProcessor] Skipped: Missing InternetMessageId for ${messageId}`);
    return {
      success: false,
      error: 'Missing InternetMessageId',
      skipped: true,
    };
  }

  try {
    // Step 1: Duplicate Check
    if (await isDuplicateEmail(internetMessageId)) {
      await graphService.markEmailAsRead(messageId);
      console.log(`[EmailProcessor] Skipped duplicate: ${internetMessageId}`);
      return {
        success: true,
        skipped: true,
        message: 'Duplicate email detected',
      };
    }

    // Extract email data
    const senderEmail = emailMessage.sender?.emailAddress?.address?.toLowerCase() || '';
    const senderName = emailMessage.sender?.emailAddress?.name ?? undefined;
    const bodyContent = sanitizeHtmlContent(emailMessage.body?.content ?? '');

    // Step 2: Thread Detection
    const existingThread = await findExistingThread(emailMessage);

    if (existingThread) {
      // This is a reply to an existing ticket
      const result = await createCommentForThread(
        existingThread.ticketId,
        bodyContent,
        internetMessageId,
        senderEmail,
        messageId
      );

      const duration = Date.now() - startTime;
      console.log(`[EmailProcessor] Completed in ${duration}ms - Comment added to ticket #${existingThread.ticketId}`);

      return result;
    }

    // Step 3: New Ticket Creation
    const result = await createNewTicket(
      emailMessage,
      bodyContent,
      internetMessageId,
      senderEmail,
      senderName
    );

    const duration = Date.now() - startTime;
    console.log(`[EmailProcessor] Completed in ${duration}ms - New ticket #${result.ticketId}`);

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[EmailProcessor] Unhandled error after ${duration}ms:`, error);

    await alertService.trackErrorAndAlert(
      'EmailProcessor-Unhandled-Exception',
      `Unhandled exception processing email ${messageId}`,
      { messageId, error: error instanceof Error ? error.message : String(error) }
    );

    return {
      success: false,
      error: `Unhandled exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// --- Batch Processor ---
export async function processUnreadEmails(limit = 50): Promise<{
  success: boolean;
  message: string;
  processed: number;
  commentAdded: number;
  errors: number;
  skipped: number;
  results: ProcessEmailResult[];
}> {
  const results: ProcessEmailResult[] = [];
  let processed = 0;
  let commentAdded = 0;
  let errors = 0;
  let skipped = 0;

  try {
    const messages = await graphService.getUnreadEmails(limit);

    if (messages.length === 0) {
      console.log('[EmailProcessor] No unread emails to process');
      return {
        success: true,
        message: 'No unread emails',
        processed: 0,
        commentAdded: 0,
        errors: 0,
        skipped: 0,
        results: [],
      };
    }

    console.log(`[EmailProcessor] Processing ${messages.length} unread emails`);

    for (const message of messages) {
      try {
        const result = await processSingleEmail(message);
        results.push(result);

        if (result.success) {
          if (result.ticketId) processed++;
          if (result.commentId) commentAdded++;
          if (result.skipped) skipped++;
        } else {
          errors++;
        }
      } catch (emailError) {
        console.error(`[EmailProcessor] Error processing message ${message.id}:`, emailError);
        errors++;
        results.push({
          success: false,
          error: `Failed to process: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
        });
      }
    }

    const summary = `Batch complete: ${processed} new tickets, ${commentAdded} comments, ${skipped} skipped, ${errors} errors`;
    console.log(`[EmailProcessor] ${summary}`);

    return {
      success: true,
      message: summary,
      processed,
      commentAdded,
      errors,
      skipped,
      results,
    };
  } catch (error) {
    const errorMessage = `Critical error fetching unread emails: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`[EmailProcessor] ${errorMessage}`, error);

    await alertService.trackErrorAndAlert(
      'EmailProcessor-Batch-Failure',
      errorMessage,
      { error: error instanceof Error ? error.message : String(error) }
    );

    return {
      success: false,
      message: errorMessage,
      processed: 0,
      commentAdded: 0,
      errors: 1,
      skipped: 0,
      results: [],
    };
  }
}
