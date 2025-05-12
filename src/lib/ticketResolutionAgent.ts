// src/lib/ticketResolutionAgent.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from '@/db';
import { tickets, ticketComments, ticketStatusEnum } from '@/db/schema';
import { eq, and, not, gte, lte, sql } from 'drizzle-orm';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { kv } from '@vercel/kv';
import * as notificationService from '@/lib/notificationService';
import { ResolutionConfig, ResolutionAnalysis, DEFAULT_RESOLUTION_CONFIG } from '@/types/resolution';

// KV storage keys
const RESOLUTION_CONFIG_KEY = 'ticket:resolution:config';
const LAST_RESOLUTION_RUN_KEY = 'ticket:resolution:last_run';

// Initialize Gemini AI
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("FATAL ERROR: Missing GOOGLE_API_KEY environment variable. Resolution Agent cannot start.");
  throw new Error("Resolution Agent configuration is incomplete. GOOGLE_API_KEY is missing.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

interface TicketWithComments {
  id: number;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  senderEmail: string | null;
  senderName: string | null;
  orderNumber: string | null;
  trackingNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  comments: {
    id: number;
    commentText: string | null;
    isFromCustomer: boolean;
    isInternalNote: boolean;
    isOutgoingReply: boolean;
    createdAt: Date;
    commenterName?: string | null;
  }[];
}

/**
 * Retrieves the resolution configuration from KV storage
 */
async function getResolutionConfig(): Promise<ResolutionConfig> {
  try {
    const config = await kv.get<ResolutionConfig>(RESOLUTION_CONFIG_KEY);
    return config || DEFAULT_RESOLUTION_CONFIG;
  } catch (error) {
    console.error('Error retrieving resolution configuration:', error);
    return DEFAULT_RESOLUTION_CONFIG;
  }
}

/**
 * Updates the last run timestamp in KV storage
 */
async function updateLastRunTime() {
  try {
    await kv.set(LAST_RESOLUTION_RUN_KEY, new Date().toISOString());
  } catch (error) {
    console.error('Error updating last run time:', error);
  }
}

/**
 * Analyzes ticket conversation to determine if it's resolved
 */
export async function analyzeTicketResolution(ticketId: number): Promise<ResolutionAnalysis | null> {
  try {
    // Fetch ticket with comments
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true,
        title: true,
        status: true,
        priority: true,
        description: true,
        senderEmail: true,
        senderName: true,
        orderNumber: true,
        trackingNumber: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        comments: {
          orderBy: (comments, { asc }) => [asc(comments.createdAt)],
          with: {
            commenter: {
              columns: {
                name: true,
              }
            }
          }
        }
      }
    });

    if (!ticket) {
      console.error(`Resolution Agent: Ticket ${ticketId} not found`);
      return null;
    }

    // Transform comments for analysis
    const transformedComments = ticket.comments.map(comment => ({
      id: comment.id,
      commentText: comment.commentText,
      isFromCustomer: comment.isFromCustomer,
      isInternalNote: comment.isInternalNote,
      isOutgoingReply: comment.isOutgoingReply,
      createdAt: comment.createdAt,
      commenterName: comment.commenter?.name,
    }));

    // Simplified ticket for analysis
    const ticketForAnalysis: TicketWithComments = {
      ...ticket,
      comments: transformedComments
    };

    // Only analyze tickets with at least one customer message and one agent response
    const customerMessages = transformedComments.filter(c => c.isFromCustomer);
    const agentResponses = transformedComments.filter(c => c.isOutgoingReply);
    
    if (customerMessages.length === 0 || agentResponses.length === 0) {
      console.log(`Resolution Agent: Ticket ${ticketId} has insufficient conversation for analysis`);
      return {
        isResolved: false,
        resolutionSummary: null,
        confidence: 'high',
        reasonForConclusion: 'Insufficient conversation (requires at least one customer message and one agent response)',
        shouldAutoClose: false,
        recommendedAction: 'none'
      };
    }

    // Has the customer responded after the last agent message?
    const lastComment = transformedComments[transformedComments.length - 1];
    const lastAgentResponse = agentResponses[agentResponses.length - 1];
    const customerRespondedLast = lastComment.isFromCustomer;
    
    // Calculate response times
    const lastAgentResponseTime = lastAgentResponse?.createdAt;
    const timeSinceLastAgentResponse = lastAgentResponseTime ? 
      Date.now() - lastAgentResponseTime.getTime() : 0;
    const daysSinceLastAgentResponse = timeSinceLastAgentResponse / (1000 * 60 * 60 * 24);

    // Basic pre-check for auto-closure candidates
    let skipAIAnalysis = false;
    let preCheckResult: ResolutionAnalysis | null = null;
    
    // Auto-close candidates:
    // 1. Last message was from agent
    // 2. Message was sent more than 7 days ago 
    // 3. No customer response after agent's last message
    if (!customerRespondedLast && daysSinceLastAgentResponse > 7) {
      skipAIAnalysis = true;
      preCheckResult = {
        isResolved: true,
        resolutionSummary: `Ticket auto-closed after ${Math.floor(daysSinceLastAgentResponse)} days with no customer response to our last message`,
        confidence: 'high',
        reasonForConclusion: 'Customer did not respond to agent message for an extended period',
        shouldAutoClose: true,
        recommendedAction: 'close'
      };
    }
    
    // If pre-check determined this is a clear auto-close case, skip AI analysis
    if (skipAIAnalysis && preCheckResult) {
      return preCheckResult;
    }

    // Prepare the conversation for AI analysis
    let conversationText = `TICKET #${ticket.id}: ${ticket.title}\n\n`;
    conversationText += `INITIAL DESCRIPTION: ${ticket.description || '(No description)'}\n\n`;
    
    if (ticket.orderNumber) {
      conversationText += `ORDER NUMBER: ${ticket.orderNumber}\n`;
    }
    
    if (ticket.trackingNumber) {
      conversationText += `TRACKING NUMBER: ${ticket.trackingNumber}\n`;
    }
    
    conversationText += `\nCONVERSATION HISTORY:\n`;
    
    transformedComments.forEach((comment, index) => {
      const sender = comment.isFromCustomer ? 
        (ticket.senderName || 'Customer') : 
        (comment.isInternalNote ? 'Internal Note' : (comment.commenterName || 'Agent'));
      
      const formattedDate = comment.createdAt.toISOString().split('T')[0];
      const messageType = comment.isInternalNote ? '[INTERNAL NOTE]' : 
                          comment.isOutgoingReply ? '[OUTGOING EMAIL]' : 
                          comment.isFromCustomer ? '[CUSTOMER EMAIL]' : '[COMMENT]';
      
      conversationText += `\n--- ${messageType} from ${sender} on ${formattedDate} ---\n`;
      conversationText += `${comment.commentText || '(No text content)'}\n`;
    });

    // Prepare the prompt for the AI
    const prompt = `
      You are an expert customer support ticket analyzer. Review this ticket conversation and determine if the ticket appears to be resolved.
      
      ${conversationText}
      
      Answer these questions:
      1. Is this ticket resolved based on the conversation? Consider factors like:
         - Did the agent properly address the customer's issue?
         - Did the customer confirm their issue was resolved?
         - Were all the customer's questions answered?
         - For order status inquiries, was tracking information provided?
         - Has there been a significant period of inactivity (suggesting the issue is resolved)?
      
      2. What is the recommended action: 'close', 'follow_up', or 'none'?
      
      3. If a follow-up is needed, what specific question should be asked?
      
      4. Write a brief (1-2 sentence) summary of how this ticket was resolved, or why it's not resolved.
      
      Respond in this JSON format:
      {
        "isResolved": true|false,
        "confidence": "high"|"medium"|"low",
        "reasonForConclusion": "explanation of why you believe the ticket is resolved or not",
        "recommendedAction": "close"|"follow_up"|"none",
        "followUpQuestion": "suggested follow up question if relevant",
        "resolutionSummary": "brief summary of how the issue was resolved"
      }
    `;
    
    // Call the AI model
    console.log(`Resolution Agent: Analyzing ticket ${ticketId} conversation`);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
        responseMimeType: "application/json"
      }
    });
    
    const responseText = result.response.text();
    if (!responseText) {
      console.error(`Resolution Agent: Empty response for ticket ${ticketId}`);
      return null;
    }
    
    // Parse the JSON response
    try {
      // Clean the response to handle potential markdown formatting
      const cleanedJson = responseText.replace(/^```json\s*|```$/g, '').trim();
      const analysis = JSON.parse(cleanedJson) as ResolutionAnalysis;
      
      // Add auto-close logic based on confidence and analysis
      analysis.shouldAutoClose = analysis.isResolved && 
                                analysis.confidence === 'high' && 
                                analysis.recommendedAction === 'close' &&
                                !customerRespondedLast &&
                                daysSinceLastAgentResponse > 5;
      
      console.log(`Resolution Agent: Ticket ${ticketId} analysis complete. Resolved: ${analysis.isResolved}, Action: ${analysis.recommendedAction}`);
      return analysis;
    } catch (parseError) {
      console.error(`Resolution Agent: Failed to parse JSON response for ticket ${ticketId}:`, parseError);
      console.error("Response was:", responseText);
      return null;
    }
  } catch (error) {
    console.error(`Resolution Agent: Error analyzing ticket ${ticketId}:`, error);
    return null;
  }
}

/**
 * Applies resolution analysis to a ticket
 */
export async function applyResolutionAnalysis(
  ticketId: number, 
  analysis: ResolutionAnalysis,
  autoClose: boolean = false
): Promise<boolean> {
  try {
    // Skip if analysis is null
    if (!analysis) return false;
    
    console.log(`Resolution Agent: Applying analysis to ticket ${ticketId}`);
    
    // Get configuration
    const config = await getResolutionConfig();
    
    // Check if the confidence level meets the threshold
    const confidenceMeetsThreshold = (
      config.confidenceThreshold === 'low' ||
      (config.confidenceThreshold === 'medium' && ['medium', 'high'].includes(analysis.confidence)) ||
      (config.confidenceThreshold === 'high' && analysis.confidence === 'high')
    );
    
    // Should we auto-close based on configuration?
    const shouldAutoClose = (
      (autoClose || analysis.shouldAutoClose) && 
      config.autoCloseEnabled && 
      confidenceMeetsThreshold
    );
    
    // Determine what action to take
    if (analysis.isResolved && shouldAutoClose) {
      // Fetch ticket for sender information (needed for notification)
      const ticketInfo = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: {
          senderEmail: true,
          senderName: true,
          orderNumber: true
        }
      });
      
      // Close the ticket
      await db.update(tickets)
        .set({
          status: 'closed',
          updatedAt: new Date()
        })
        .where(eq(tickets.id, ticketId));
      
      // Add an internal note about auto-closure
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `**Ticket Auto-Closed**\n\nThis ticket was automatically closed based on AI analysis.\n\n**Resolution Summary**: ${analysis.resolutionSummary}\n\n**Reason**: ${analysis.reasonForConclusion}\n\n**Confidence**: ${analysis.confidence}`,
        isInternalNote: true,
        isFromCustomer: false,
        isOutgoingReply: false
      });
      
      console.log(`Resolution Agent: Ticket ${ticketId} auto-closed with resolution: ${analysis.resolutionSummary}`);
      
      // Send customer notification if enabled and we have an email
      if (
        config.sendCustomerNotification && 
        ticketInfo && 
        ticketInfo.senderEmail
      ) {
        try {
          // Format survey link if enabled
          let surveyLink: string | undefined = undefined;
          if (config.includeSurveyLink && config.surveyUrl) {
            surveyLink = config.surveyUrl.replace('[TICKET_ID]', ticketId.toString());
          }
          
          // Send closure notification
          await notificationService.sendTicketClosureNotification({
            ticketId,
            recipientEmail: ticketInfo.senderEmail,
            recipientName: ticketInfo.senderName || undefined,
            resolutionSummary: analysis.resolutionSummary || 'Your issue has been resolved.',
            referenceNumber: ticketInfo.orderNumber || undefined,
            surveyLink
          });
          
          console.log(`Resolution Agent: Notification sent to ${ticketInfo.senderEmail} for ticket ${ticketId}`);
        } catch (notificationError) {
          console.error(`Resolution Agent: Failed to send notification for ticket ${ticketId}:`, notificationError);
        }
      }
      
      // Emit event for the ticket update
      ticketEventEmitter.emit({
        type: 'ticket_closed',
        ticketId: ticketId,
        autoClose: true,
        resolution: analysis.resolutionSummary
      });
      
      return true;
    } else if (analysis.isResolved) {
      // Add resolution recommendations without closing
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `**Resolution Recommendation**\n\nThis ticket appears to be resolved and can be closed.\n\n**Resolution Summary**: ${analysis.resolutionSummary}\n\n**Reason**: ${analysis.reasonForConclusion}\n\n**Confidence**: ${analysis.confidence}`,
        isInternalNote: true,
        isFromCustomer: false,
        isOutgoingReply: false
      });
      
      console.log(`Resolution Agent: Added resolution recommendation to ticket ${ticketId}`);
      
      // Emit event for the recommendation
      ticketEventEmitter.emit({
        type: 'ticket_resolution_recommended',
        ticketId: ticketId,
        resolution: analysis.resolutionSummary
      });
      
      return true;
    } else if (analysis.recommendedAction === 'follow_up' && analysis.followUpQuestion) {
      // Add follow-up recommendation
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `**Follow-Up Recommendation**\n\nThis ticket may need follow-up. Consider sending the following question to the customer:\n\n"${analysis.followUpQuestion}"`,
        isInternalNote: true,
        isFromCustomer: false,
        isOutgoingReply: false
      });
      
      console.log(`Resolution Agent: Added follow-up recommendation to ticket ${ticketId}`);
      
      // Auto-send follow-up if configured
      const ticketInfo = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: {
          senderEmail: true
        }
      });
      
      if (
        config.sendCustomerNotification && 
        ticketInfo && 
        ticketInfo.senderEmail
      ) {
        try {
          await notificationService.sendFollowUpQuestion(
            ticketId,
            ticketInfo.senderEmail,
            analysis.followUpQuestion
          );
          
          // Record that we sent a follow-up
          await db.insert(ticketComments).values({
            ticketId: ticketId,
            commentText: `**Auto Follow-Up Sent**\n\nThe system automatically sent the following follow-up question to the customer:\n\n"${analysis.followUpQuestion}"`,
            isInternalNote: true,
            isFromCustomer: false,
            isOutgoingReply: false
          });
          
          console.log(`Resolution Agent: Auto follow-up sent for ticket ${ticketId}`);
          
          // Emit event
          ticketEventEmitter.emit({
            type: 'ticket_follow_up_sent',
            ticketId: ticketId,
            question: analysis.followUpQuestion
          });
        } catch (followUpError) {
          console.error(`Resolution Agent: Failed to send follow-up for ticket ${ticketId}:`, followUpError);
        }
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Resolution Agent: Error applying analysis to ticket ${ticketId}:`, error);
    return false;
  }
}

/**
 * Checks all eligible tickets for resolution status
 */
export async function checkTicketsForResolution(
  daysWithoutActivityOverride?: number,
  maxTicketsToProcessOverride?: number,
  autoCloseConfidentResultsOverride?: boolean
): Promise<{ processed: number, resolved: number, autoClosed: number, followUp: number, error: number, reopened?: number }> {
  try {
    // Get configuration
    const config = await getResolutionConfig();
    
    // Use overrides or config values
    const daysWithoutActivity = daysWithoutActivityOverride ?? config.inactivityDays ?? 5;
    const maxTicketsToProcess = maxTicketsToProcessOverride ?? config.maxTicketsPerBatch ?? 50;
    const autoCloseConfidentResults = autoCloseConfidentResultsOverride ?? config.autoCloseEnabled ?? true;
    
  console.log(`Resolution Agent: Starting batch check of tickets inactive for ${daysWithoutActivity}+ days`);
  
    let processed = 0, resolved = 0, autoClosed = 0, followUp = 0, error = 0, reopened = 0;
  
    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWithoutActivity);
    
    // Find tickets that haven't been updated for the specified days
    // and are not already closed
    const eligibleTickets = await db.query.tickets.findMany({
      where: and(
        not(eq(tickets.status, 'closed')),
        lte(tickets.updatedAt, cutoffDate)
      ),
      orderBy: (tickets, { asc }) => [asc(tickets.updatedAt)],
      limit: maxTicketsToProcess
    });
    
    console.log(`Resolution Agent: Found ${eligibleTickets.length} eligible tickets for resolution check`);
    
    // Process each ticket
    for (const ticket of eligibleTickets) {
      processed++;
      
      try {
        const analysis = await analyzeTicketResolution(ticket.id);
        
        if (!analysis) {
          error++;
          continue;
        }
        
        const applied = await applyResolutionAnalysis(
          ticket.id, 
          analysis,
          autoCloseConfidentResults
        );
        
        if (applied) {
          if (analysis.isResolved) {
            resolved++;
            if (analysis.shouldAutoClose || autoCloseConfidentResults) {
              autoClosed++;
            }
          } else if (analysis.recommendedAction === 'follow_up') {
            followUp++;
          }
        }
      } catch (ticketError) {
        console.error(`Resolution Agent: Error processing ticket ${ticket.id}:`, ticketError);
        error++;
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Find closed tickets that were reopened by customers
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const reopenedTickets = await db
      .select({ count: sql<number>`count(*)` })
      .from(ticketComments)
      .where(
        and(
          sql`${ticketComments.commentText} LIKE '%Ticket Reopened by Customer%'`,
          gte(ticketComments.createdAt, thirtyDaysAgo)
        )
      );
    
    reopened = reopenedTickets[0]?.count || 0;
    
    // Update last run time
    await updateLastRunTime();
    
    console.log(`Resolution Agent: Batch processing complete. Processed: ${processed}, Resolved: ${resolved}, Auto-closed: ${autoClosed}, Follow-up: ${followUp}, Reopened: ${reopened}, Errors: ${error}`);
    
    return { processed, resolved, autoClosed, followUp, error, reopened };
  } catch (batchError) {
    console.error(`Resolution Agent: Error during batch processing:`, batchError);
    return { processed: 0, resolved: 0, autoClosed: 0, followUp: 0, error: 1 };
  }
}