// src/lib/ticketResolutionAgent.ts
import { GoogleGenerativeAI, GenerationConfig, GenerativeModel } from "@google/generative-ai";
import { Groq } from 'groq-sdk';
import { db, tickets, ticketComments, ticketStatusEnum } from '@/lib/db';
import { eq, and, not, gte, lte, sql } from 'drizzle-orm';
import { ticketEventEmitter } from '@/lib/eventEmitter';
import { kv } from '@vercel/kv';
import * as notificationService from '@/lib/notificationService';
import { ResolutionConfig, ResolutionAnalysis, DEFAULT_RESOLUTION_CONFIG } from '@/types/resolution';

// KV storage keys
const RESOLUTION_CONFIG_KEY = 'ticket:resolution:config';
const LAST_RESOLUTION_RUN_KEY = 'ticket:resolution:last_run';

// Lazy initialization to avoid build-time errors
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("FATAL ERROR: Missing GOOGLE_API_KEY environment variable. Resolution Agent cannot start.");
    throw new Error("Resolution Agent configuration is incomplete. GOOGLE_API_KEY is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash-preview-05-20" });
  return _model;
}

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
 * Builds comprehensive conversation text for AI analysis
 */
function buildConversationTextForAI(ticket: TicketWithComments): string {
  let conversationText = `TICKET #${ticket.id}: ${ticket.title}\n`;
  conversationText += `INITIAL DESCRIPTION: ${ticket.description || '(No description provided)'}\n`;
  
  if (ticket.orderNumber) {
    conversationText += `ORDER NUMBER: ${ticket.orderNumber}\n`;
  }
  if (ticket.trackingNumber) {
    conversationText += `TRACKING NUMBER: ${ticket.trackingNumber}\n`;
  }
  conversationText += `PRIORITY: ${ticket.priority}\n`;
  conversationText += `STATUS (at time of analysis): ${ticket.status}\n\n`;
  
  conversationText += `CONVERSATION HISTORY (chronological, excluding internal notes):\n`;
  conversationText += `${'='.repeat(50)}\n`;
  
  ticket.comments.filter(c => !c.isInternalNote).forEach((comment) => {
    const sender = comment.isFromCustomer ? 
      (ticket.senderName || 'Customer') : 
      (comment.commenterName || 'Agent');
    
    const formattedDate = new Date(comment.createdAt).toISOString().split('T')[0];
    const formattedTime = new Date(comment.createdAt).toTimeString().split(' ')[0];
    
    const messageType = comment.isFromCustomer ? '[CUSTOMER MESSAGE]' : '[AGENT RESPONSE]';
    
    conversationText += `\n${messageType} from ${sender} on ${formattedDate} at ${formattedTime}:\n`;
    conversationText += `${'-'.repeat(30)}\n`;
    conversationText += `${comment.commentText || '(No text content)'}\n`;
    conversationText += `${'-'.repeat(30)}\n`;
  });
  
  conversationText += `${'='.repeat(50)}\n`;
  
  return conversationText;
}

/**
 * Determines if a ticket should be auto-closed based on AI analysis and configuration
 */
function determineAutoCloseEligibility(
  analysis: ResolutionAnalysis, 
  config: ResolutionConfig
): boolean {
  if (!analysis.isResolved || !config.autoCloseEnabled) {
    return false;
  }

  const confidenceMet = (
    config.confidenceThreshold === 'low' ||
    (config.confidenceThreshold === 'medium' && ['medium', 'high'].includes(analysis.confidence)) ||
    (config.confidenceThreshold === 'high' && analysis.confidence === 'high')
  );

  if (!confidenceMet) return false;
  if (analysis.recommendedAction !== 'close') return false;
  if (analysis.satisfactionIndicators?.negativeSentiment) return false; // Don't close if negative sentiment

  if (config.autoCloseOnlyIfAgentRespondedLast && analysis.analysisContext.customerRespondedLast) {
    return false;
  }

  const requiredInactivityDays = analysis.confidence === 'high' && !analysis.analysisContext.customerRespondedLast
    ? config.inactivityDaysForConfidentClosure
    : config.inactivityDays;
    
  if (analysis.analysisContext.daysSinceLastAgentResponse < requiredInactivityDays) {
    return false;
  }
  
  // If medium/low confidence, require explicit satisfaction or gratitude, unless it's been inactive for much longer
  if (analysis.confidence !== 'high') {
    const hasPositiveConfirmation = analysis.satisfactionIndicators?.explicitSatisfaction || analysis.satisfactionIndicators?.expresstionOfGratitude;
    if (!hasPositiveConfirmation && analysis.analysisContext.daysSinceLastAgentResponse < (config.inactivityDays * 1.5)) {
        return false; // Requires stronger positive signal or longer inactivity for non-high confidence
    }
  }

  return true;
}

/**
 * Analyzes ticket conversation to determine if it's resolved using advanced AI analysis
 */
export async function analyzeTicketResolution(ticketId: number): Promise<ResolutionAnalysis | null> {
  try {
    const config = await getResolutionConfig();
    
    const ticketData = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        id: true, title: true, status: true, priority: true, description: true,
        senderEmail: true, senderName: true, orderNumber: true, trackingNumber: true,
        createdAt: true, updatedAt: true,
      },
      with: {
        comments: {
          orderBy: (comments, { asc }) => [asc(comments.createdAt)],
          with: { commenter: { columns: { name: true } } }
        }
      }
    });

    if (!ticketData) {
      console.error(`Resolution Agent: Ticket ${ticketId} not found for analysis.`);
      return null;
    }
    
    const ticket: TicketWithComments = {
        ...ticketData,
        comments: ticketData.comments.map(c => ({...c, commenterName: c.commenter?.name}))
    };

    const customerMessages = ticket.comments.filter(c => c.isFromCustomer && !c.isInternalNote);
    const agentResponses = ticket.comments.filter(c => c.isOutgoingReply && !c.isInternalNote);
    const conversationTurns = customerMessages.length + agentResponses.length;

    if (conversationTurns < config.minimumConversationTurnsForAI && !config.analyzeLowActivityTickets) {
      console.log(`Resolution Agent: Ticket ${ticketId} has ${conversationTurns} turns, less than min ${config.minimumConversationTurnsForAI}. Skipping AI.`);
      return {
        isResolved: false, confidence: 'low', reasonForConclusion: 'Conversation too short for AI analysis.',
        resolutionSummary: null, recommendedAction: 'none', shouldAutoClose: false,
        analysisContext: { customerRespondedLast: false, daysSinceLastAgentResponse: 0, conversationTurns, hasMultipleIssues: false, identifiedIssues: [] },
        satisfactionIndicators: { explicitSatisfaction: false, expresstionOfGratitude: false, negativeSentiment: false, satisfactionConfidence: 'low' }
      };
    }
    
    const lastNonInternalComment = ticket.comments.filter(c => !c.isInternalNote).pop();
    const customerRespondedLast = !!lastNonInternalComment?.isFromCustomer;
    
    const lastAgentResponse = agentResponses.length > 0 ? agentResponses[agentResponses.length - 1] : null;
    const daysSinceLastAgentResponse = lastAgentResponse ? (Date.now() - new Date(lastAgentResponse.createdAt).getTime()) / (1000 * 60 * 60 * 24) : 0;

    const conversationText = buildConversationTextForAI(ticket);

    const prompt = `
You are an expert Customer Support Manager AI with deep experience in customer service resolution analysis. Your task is to analyze this support ticket conversation and provide a comprehensive assessment.

ANALYSIS REQUIREMENTS:
1. RESOLUTION STATUS: Has the customer's primary issue been fully addressed?
2. CUSTOMER SATISFACTION INDICATORS: Explicit confirmations ("thank you, it works!", "all set"), gratitude, negative sentiment, etc.
3. CONVERSATION CONTEXT: Who responded last, timing since last agent response, total conversation turns.
4. BUSINESS CONTEXT: What was the ticket about (order, product, technical issue)?

DECISION CRITERIA:
- High confidence resolution: Customer explicitly confirmed satisfaction OR agent provided a complete, clear solution and customer has not replied for several days (${config.inactivityDaysForConfidentClosure}+ days).
- Medium confidence: Agent likely resolved the issue, but no explicit confirmation from customer. Customer has been inactive for a few days (${config.inactivityDays}+ days).
- Low confidence: Unclear if resolved, or potential for unresolved issues.

Ticket Conversation:
${conversationText}

Respond with this exact JSON structure:
{
  "isResolved": boolean,
  "confidence": "high" | "medium" | "low",
  "reasonForConclusion": "Detailed explanation of your decision (2-3 sentences).",
  "resolutionSummary": "If resolved, concise summary of how issue was resolved. If not resolved, state 'Not yet resolved'.",
  "recommendedAction": "close" | "follow_up" | "none",
  "followUpQuestion": "If 'follow_up' recommended, specific question to ask customer. Otherwise null.",
  "analysisContext": {
    "customerRespondedLast": ${customerRespondedLast},
    "daysSinceLastAgentResponse": ${parseFloat(daysSinceLastAgentResponse.toFixed(1))},
    "conversationTurns": ${conversationTurns},
    "hasMultipleIssues": boolean, // Determine if multiple distinct issues were discussed
    "identifiedIssues": ["list", "of", "distinct issues identified"] // List the core issues
  },
  "satisfactionIndicators": {
    "explicitSatisfaction": boolean, // e.g., "Thanks, that worked!", "Perfect!"
    "expresstionOfGratitude": boolean, // e.g., "Thank you for your help", "Appreciate it"
    "negativeSentiment": boolean, // e.g., "This is frustrating", "Still not working"
    "satisfactionConfidence": "high" | "medium" | "low" // Confidence in the satisfaction assessment
  }
}`;
    
    const generationConfig: GenerationConfig = {
        temperature: 0.2, // Lower for more factual, less creative responses
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048, // Increased to handle potentially longer contexts and structured JSON
        responseMimeType: "application/json"
    };

    console.log(`Resolution Agent: Analyzing ticket ${ticketId} with Gemini (${conversationTurns} turns). Customer responded last: ${customerRespondedLast}. Days since last agent: ${daysSinceLastAgentResponse.toFixed(1)}`);
    const result = await getModel().generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig
    });
    
    const responseText = result.response.text();
    if (!responseText) {
      console.error(`Resolution Agent: Empty Gemini response for ticket ${ticketId}`);
      return null;
    }
    
    try {
      const cleanedJson = responseText.replace(/^```json\s*|```$/g, '').trim();
      const analysis = JSON.parse(cleanedJson) as ResolutionAnalysis;
      
      // Ensure all nested objects exist with defaults if AI omits them
      analysis.analysisContext = analysis.analysisContext || { 
        customerRespondedLast, daysSinceLastAgentResponse, conversationTurns, 
        hasMultipleIssues: false, identifiedIssues: [] 
      };
      analysis.satisfactionIndicators = analysis.satisfactionIndicators || { 
        explicitSatisfaction: false, expresstionOfGratitude: false, negativeSentiment: false, satisfactionConfidence: 'low' 
      };
      
      // Correct typo in property name if it comes from AI with 'expresstion'
      if ((analysis.satisfactionIndicators as any).expresstionOfGratitude !== undefined) {
          analysis.satisfactionIndicators.expresstionOfGratitude = (analysis.satisfactionIndicators as any).expresstionOfGratitude;
      }

      analysis.shouldAutoClose = determineAutoCloseEligibility(analysis, config);
      
      console.log(`Resolution Agent: Ticket ${ticketId} AI analysis complete. Resolved: ${analysis.isResolved}, Confidence: ${analysis.confidence}, Action: ${analysis.recommendedAction}, Auto-close: ${analysis.shouldAutoClose}`);
      return analysis;
    } catch (parseError) {
      console.error(`Resolution Agent: Failed to parse Gemini JSON response for ticket ${ticketId}:`, parseError);
      console.error("Gemini Response was:", responseText);
      return null;
    }
  } catch (error) {
    console.error(`Resolution Agent: Error in analyzeTicketResolution for ticket ${ticketId}:`, error);
    return null;
  }
}

/**
 * Applies resolution analysis to a ticket
 */
export async function applyResolutionAnalysis(
  ticketId: number, 
  analysis: ResolutionAnalysis,
  autoCloseOverride: boolean = false
): Promise<boolean> {
  try {
    if (!analysis) {
        console.warn(`Resolution Agent: No analysis provided for ticket ${ticketId}. Skipping application.`);
        return false;
    }
    
    console.log(`Resolution Agent: Applying analysis to ticket ${ticketId}. AI Recommendation: ${analysis.recommendedAction}, Auto-close eligible based on AI: ${analysis.shouldAutoClose}`);
    
    const config = await getResolutionConfig();
    const effectiveAutoClose = autoCloseOverride || analysis.shouldAutoClose;

    if (analysis.isResolved && effectiveAutoClose) {
      const ticketInfo = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
        columns: { senderEmail: true, senderName: true, orderNumber: true }
      });
      
      await db.update(tickets).set({ status: 'closed', updatedAt: new Date() }).where(eq(tickets.id, ticketId));
      
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `**Ticket Auto-Closed by AI Sales Manager**\n\n**Resolution Summary**: ${analysis.resolutionSummary || 'Issue resolved.'}\n**AI Reason**: ${analysis.reasonForConclusion}\n**AI Confidence**: ${analysis.confidence}\n**Satisfaction Signal**: ${analysis.satisfactionIndicators?.explicitSatisfaction ? 'Explicit' : (analysis.satisfactionIndicators?.expresstionOfGratitude ? 'Gratitude' : 'Implicit/None')}`,
        isInternalNote: true, isFromCustomer: false, isOutgoingReply: false
      });
      
      console.log(`Resolution Agent: Ticket ${ticketId} auto-closed. Summary: ${analysis.resolutionSummary}`);
      
      if (config.sendCustomerNotification && ticketInfo?.senderEmail) {
        try {
          let surveyLink: string | undefined = undefined;
          if (config.includeSurveyLink && config.surveyUrl) {
            surveyLink = config.surveyUrl.replace('[TICKET_ID]', ticketId.toString());
          }
          await notificationService.sendTicketClosureNotification({
            ticketId, recipientEmail: ticketInfo.senderEmail, recipientName: ticketInfo.senderName || undefined,
            resolutionSummary: analysis.resolutionSummary || 'Your issue has been resolved.',
            referenceNumber: ticketInfo.orderNumber || undefined, surveyLink
          });
          console.log(`Resolution Agent: Closure notification sent to ${ticketInfo.senderEmail} for ticket ${ticketId}`);
        } catch (e) { console.error(`Resolution Agent: Failed to send closure notification for ticket ${ticketId}:`, e); }
      }
      
      ticketEventEmitter.emit({ type: 'ticket_closed', ticketId: ticketId, autoClose: true, resolution: analysis.resolutionSummary });
      return true;

    } else if (analysis.isResolved && analysis.recommendedAction === 'close' && !effectiveAutoClose) {
      await db.insert(ticketComments).values({
        ticketId: ticketId,
        commentText: `**AI Resolution Recommendation (Manual Close Suggested)**\n\nThis ticket appears resolved and can likely be closed.\n**AI Summary**: ${analysis.resolutionSummary}\n**AI Reason**: ${analysis.reasonForConclusion}\n**AI Confidence**: ${analysis.confidence}`,
        isInternalNote: true, isFromCustomer: false, isOutgoingReply: false
      });
      console.log(`Resolution Agent: Added manual close recommendation to ticket ${ticketId}`);
      ticketEventEmitter.emit({ type: 'ticket_resolution_recommended', ticketId: ticketId, resolution: analysis.resolutionSummary });
      return true;

    } else if (analysis.recommendedAction === 'follow_up' && analysis.followUpQuestion) {
      const followUpNote = `**AI Follow-Up Recommendation**\n\nConsider asking the customer: "${analysis.followUpQuestion}"\n**AI Reason**: ${analysis.reasonForConclusion}\n**AI Confidence**: ${analysis.confidence}`;
      await db.insert(ticketComments).values({
        ticketId: ticketId, commentText: followUpNote, isInternalNote: true, isFromCustomer: false, isOutgoingReply: false
      });
      console.log(`Resolution Agent: Added follow-up recommendation to ticket ${ticketId}`);
      
      if (config.enableAutoFollowUp && config.sendCustomerNotification) {
        const ticketInfo = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), columns: { senderEmail: true } });
        if (ticketInfo?.senderEmail) {
          try {
            await notificationService.sendFollowUpQuestion(ticketId, ticketInfo.senderEmail, analysis.followUpQuestion);
            await db.insert(ticketComments).values({
              ticketId: ticketId,
              commentText: `**Auto Follow-Up Sent by AI**\nQuestion: "${analysis.followUpQuestion}"`,
              isInternalNote: true, isFromCustomer: false, isOutgoingReply: true // Mark as outgoing
            });
            console.log(`Resolution Agent: Auto follow-up sent for ticket ${ticketId}`);
            ticketEventEmitter.emit({ type: 'ticket_follow_up_sent', ticketId: ticketId, question: analysis.followUpQuestion });
          } catch (e) { console.error(`Resolution Agent: Failed to send auto follow-up for ticket ${ticketId}:`, e); }
        }
      }
      return true;
    }
    
    console.log(`Resolution Agent: No definitive action taken for ticket ${ticketId} based on AI analysis. isResolved: ${analysis.isResolved}, recommendedAction: ${analysis.recommendedAction}, shouldAutoClose (derived): ${analysis.shouldAutoClose}, effectiveAutoClose: ${effectiveAutoClose}`);
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
): Promise<{ processed: number, resolvedByAI: number, autoClosedByAI: number, followUpRecommendedByAI: number, errors: number, reopened?: number, aiAnalysisUsed: number }> {
  try {
    const config = await getResolutionConfig();
    
    const daysWithoutActivity = daysWithoutActivityOverride ?? config.inactivityDays;
    const maxTicketsToProcess = maxTicketsToProcessOverride ?? config.maxTicketsPerBatch;
    const autoCloseConfidentResults = autoCloseConfidentResultsOverride ?? config.autoCloseEnabled;
    
    console.log(`Resolution Agent: Starting batch check (inactive ${daysWithoutActivity}d, max ${maxTicketsToProcess}). Auto-close: ${autoCloseConfidentResults}`);
  
    let processed = 0, resolvedByAI = 0, autoClosedByAI = 0, followUpRecommendedByAI = 0, errors = 0, reopened = 0, aiAnalysisUsed = 0;
  
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWithoutActivity);
    
    const eligibleTickets = await db.query.tickets.findMany({
      where: and(
        not(eq(tickets.status, 'closed')),
        lte(tickets.updatedAt, cutoffDate) // Ticket hasn't been updated recently
      ),
       orderBy: (t) => [sql`RANDOM()`], // Process in random order to vary AI inputs
       limit: maxTicketsToProcess,
       with: { comments: { orderBy: (c, { asc }) => [asc(c.createdAt)], columns: { isFromCustomer: true } } }
     });
     
     console.log(`Resolution Agent: Found ${eligibleTickets.length} eligible tickets.`);
     
     for (const ticket of eligibleTickets) {
       processed++;
       try {
         const analysis = await analyzeTicketResolution(ticket.id);
         if (!analysis) { errors++; continue; }
         aiAnalysisUsed++;
         
         const applied = await applyResolutionAnalysis(ticket.id, analysis, autoCloseConfidentResults);
         if (applied) {
           if (analysis.isResolved) resolvedByAI++;
           if (analysis.shouldAutoClose && autoCloseConfidentResults) autoClosedByAI++;
           if (analysis.recommendedAction === 'follow_up') followUpRecommendedByAI++;
         }
       } catch (ticketError) {
         console.error(`Resolution Agent: Error processing ticket ${ticket.id}:`, ticketError);
         errors++;
       }
       await new Promise(resolve => setTimeout(resolve, 1200)); // Increased delay
     }
     
     // This part is for metrics, not directly part of the AI decision loop for THIS run
     const thirtyDaysAgo = new Date();
     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
     const reopenedResult = await db.select({ count: sql<number>`count(*)` }).from(ticketComments)
       .where(and(sql`comment_text LIKE '%Ticket Reopened by Customer%'`, gte(ticketComments.createdAt, thirtyDaysAgo)));
     reopened = reopenedResult[0]?.count || 0;
     
     await updateLastRunTime();
     
     console.log(`Resolution Agent: Batch complete. Processed: ${processed}, AI Analyzed: ${aiAnalysisUsed}, Resolved by AI: ${resolvedByAI}, Auto-Closed by AI: ${autoClosedByAI}, Follow-up by AI: ${followUpRecommendedByAI}, Errors: ${errors}, Reopened (last 30d): ${reopened}`);
     
     return { processed, resolvedByAI, autoClosedByAI, followUpRecommendedByAI, errors, reopened, aiAnalysisUsed };
   } catch (batchError) {
     console.error(`Resolution Agent: Error during batch processing:`, batchError);
     return { processed: 0, resolvedByAI: 0, autoClosedByAI: 0, followUpRecommendedByAI: 0, errors: 1, aiAnalysisUsed: 0 };
   }
}