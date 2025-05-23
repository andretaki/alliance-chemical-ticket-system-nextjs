import { EmailAnalysisData } from '@/types/emailAnalysis';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, type GenerativeModel } from '@google/generative-ai';
import { NotificationService } from './notificationService';

// Minimal representation of a raw email for analysis
interface RawEmailInput {
  id: string;
  subject: string;
  bodyText: string; // HTML-stripped body
  senderEmail: string;
  receivedDateTime: string; // ISO
  conversationId?: string;
}

// Initialize Gemini Model
let geminiModel: GenerativeModel | null = null;
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-1.5-flash";

function initializeGoogleAI(): GenerativeModel | null {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("CRITICAL: GOOGLE_API_KEY not set in aiAnalysisOrchestratorService."); return null; }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
    console.log(`[AIService] Google AI Model (${GEMINI_MODEL_NAME}) initialized.`);
    return model;
  } catch (e: any) { console.error(`[AIService] Failed to init Google AI (${GEMINI_MODEL_NAME}): ${e.message}`); return null; }
}
geminiModel = initializeGoogleAI();

export class AiAnalysisOrchestratorService {
  private notificationService: NotificationService;

  // Defined primary topics list
  private definedPrimaryTopics = [
    "Order Placement", "Order Status Inquiry", "Order Modification/Cancellation", "Quote Request",
    "Price Inquiry", "Product Availability Check", "Technical Support", "Product Specification Request",
    "Documentation Request (SDS/COA)", "Shipping/Delivery Issue", "Billing/Invoice Issue",
    "Return/Refund Request", "Account Setup/Modification", "Credit Application", "Payment Processing",
    "Account Inquiry", "Order Confirmation", "Payment Confirmation", "Shipping Update",
    "Abandoned Cart Alert", "Account Security Alert", "Vendor/Supplier Outreach", "Partnership Inquiry",
    "Service Solicitation", "Product Promotion", "General Inquiry", "Complaint/Feedback",
    "Regulatory Compliance", "Other: New Category"
  ];

  // Add credit application detection patterns
  private creditApplicationPatterns = {
    requestPatterns: [
      /credit\s+application/i,
      /apply\s+for\s+credit/i,
      /credit\s+terms/i,
      /credit\s+account/i,
      /net\s+\d+\s+terms/i,
      /payment\s+terms/i,
      /credit\s+line/i,
      /credit\s+limit/i,
      /credit\s+check/i,
      /credit\s+approval/i
    ],
    followUpPatterns: [
      /credit\s+application\s+status/i,
      /status\s+of\s+credit\s+application/i,
      /check\s+credit\s+application/i,
      /credit\s+application\s+update/i,
      /credit\s+application\s+follow\s+up/i
    ],
    otherCreditPatterns: [
      /credit\s+card/i,
      /credit\s+note/i,
      /credit\s+balance/i,
      /credit\s+refund/i,
      /credit\s+back/i,
      /credit\s+on\s+account/i
    ]
  };

  private isCreditApplicationRequest(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.creditApplicationPatterns.requestPatterns.some(pattern => pattern.test(lowerText)) &&
           !this.creditApplicationPatterns.followUpPatterns.some(pattern => pattern.test(lowerText)) &&
           !this.creditApplicationPatterns.otherCreditPatterns.some(pattern => pattern.test(lowerText));
  }

  private isCreditApplicationFollowUp(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.creditApplicationPatterns.followUpPatterns.some(pattern => pattern.test(lowerText));
  }

  constructor() {
    if (!geminiModel) {
      console.warn("[AIService] Gemini model not available during construction.");
    }
    this.notificationService = new NotificationService();
  }

  /**
   * Analyzes a single email using Gemini to extract structured insights.
   */
  public async analyzeEmail(email: RawEmailInput): Promise<EmailAnalysisData> {
    if (!geminiModel) {
      console.error("[AIService] Gemini model not initialized. Cannot analyze email.");
      return {
        emailId: email.id,
        conversationId: email.conversationId,
        receivedDateTime: email.receivedDateTime,
        subject: email.subject,
        senderEmail: email.senderEmail,
        bodyText: email.bodyText,
        primaryTopic: "Error: AI_Service_Unavailable",
        customerGoal: "N/A",
        extractedEntities: [],
        overallSentiment: null,
        estimatedComplexityToResolve: 'medium',
        automationPotentialScore: 0,
        keyInformationForResolution: [],
        suggestedNextActions: [`Investigate AI Service unavailability for ${email.id}`],
        rawSummary: "AI analysis service (Gemini) is not available.",
        aiAnalysisError: "Gemini model not initialized.",
        aiModelUsed: GEMINI_MODEL_NAME,
        aiAnalysisTimestamp: new Date().toISOString(),
      };
    }

    const prompt = `
Analyze the following email with depth and precision. Your main goal is to CLASSIFY it into a predefined BROAD PRIMARY TOPIC, then extract detailed supporting information for further analysis and action.

Email Subject:
"${email.subject}"

Email Body (plain text, first ~2500 characters):
"${email.bodyText.substring(0, 2500)}${email.bodyText.length > 2500 ? '...' : ''}"

Provide your analysis as a JSON object strictly adhering to the following TypeScript interface (provide ALL fields, use null or empty arrays where appropriate, do NOT omit fields):
interface GeminiOutput {
  primaryTopic: string; // **MANDATORY**: Choose from list: ${this.definedPrimaryTopics.map(t => `"${t}"`).join(', ')}
  secondaryTopic?: string;
  tertiaryTopic?: string;
  customerGoal: string;
  specificQuestionsAsked?: string[];
  problemReported?: { description: string; associatedProduct?: string; urgencyToCustomer: 'low' | 'medium' | 'high' | 'critical'; };
  extractedEntities: Array<{ type: string; value: string; context?: string; attributes?: Record<string, string | number | boolean> }>;
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  specificTones?: ('frustrated' | 'confused' | 'appreciative' | 'demanding' | 'urgent' | 'inquisitive')[];
  estimatedComplexityToResolve: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  potentialRootCauseCategory?: string;
  customerJourneyStageHint?: 'pre_sales_inquiry' | 'quote_negotiation' | 'order_placement' | 'payment_confirmation' | 'order_fulfillment_update' | 'delivery_coordination' | 'post_delivery_issue' | 'product_support_request' | 'return_or_refund_process' | 'billing_dispute' | 'account_update' | 'feedback_submission' | 'vendor_outreach_to_us' | 'automated_transactional_notice' | 'other_operational';
  multiIntentDetected?: boolean;
  automationPotentialScore: number; // 0.0 to 1.0
  keyInformationForResolution: string[];
  suggestedNextActions: string[];
  rawSummary: string;
}

Key Instructions for 'primaryTopic':
1. You MUST select one value from the provided list for 'primaryTopic'.
2. If using "Other: New Category", secondaryTopic should be "Proposed Category Name: [Your Suggestion]" and tertiaryTopic should be the rationale.
3. 'primaryTopic' is for BROAD categorization. 'rawSummary' is for THIS email.

Be extremely thorough in 'extractedEntities'. Ensure the JSON is perfectly formed. Do not add comments.
    `;

    const generationConfig: GenerationConfig = {
      responseMimeType: "application/json",
      temperature: 0.15,
      maxOutputTokens: 4096,
      topP: 0.8,
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    try {
      const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings,
      });
      const responseText = result.response.text();
      if (!responseText) { throw new Error("Empty AI response from Gemini."); }

      const parsedGeminiOutput = JSON.parse(responseText.trim());

      // Add credit application detection logic
      if (parsedGeminiOutput.primaryTopic === "Credit Application") {
        const isRequest = this.isCreditApplicationRequest(email.bodyText);
        const isFollowUp = this.isCreditApplicationFollowUp(email.bodyText);
        
        if (isRequest) {
          parsedGeminiOutput.suggestedNextActions.push("Send credit application form URL to customer");
          parsedGeminiOutput.keyInformationForResolution.push("Customer is requesting a new credit application");
          
          // Send credit application email
          try {
            await this.notificationService.handleCreditApplicationRequest(email.senderEmail);
            parsedGeminiOutput.suggestedNextActions.push("Credit application form URL has been sent to customer");
          } catch (error) {
            console.error(`Failed to send credit application email to ${email.senderEmail}:`, error);
            parsedGeminiOutput.suggestedNextActions.push("Failed to send credit application form URL - manual follow-up required");
          }
        } else if (isFollowUp) {
          parsedGeminiOutput.suggestedNextActions.push("Check status of existing credit application");
          parsedGeminiOutput.keyInformationForResolution.push("Customer is following up on an existing credit application");
        } else {
          parsedGeminiOutput.suggestedNextActions.push("Review email content for credit-related context");
          parsedGeminiOutput.keyInformationForResolution.push("Credit-related discussion detected but not a direct application request");
        }
      }

      // Code-based normalization for primaryTopic
      if (parsedGeminiOutput.primaryTopic === "Automated System Notification") {
        const lowerBody = email.bodyText.toLowerCase();
        const lowerSubject = email.subject.toLowerCase();
        if (lowerSubject.includes("abandoned cart") || lowerBody.includes("still in your cart")) {
          parsedGeminiOutput.primaryTopic = "Automated System Notification: Abandoned Cart";
        } else if (lowerSubject.includes("order confirmation") || lowerSubject.includes("your order #")) {
          parsedGeminiOutput.primaryTopic = "Automated System Notification: Order Confirmation";
        } else if (lowerSubject.includes("payment received") || lowerSubject.includes("payment successful")) {
          parsedGeminiOutput.primaryTopic = "Automated System Notification: Payment Received";
        } else if (lowerSubject.includes("shipping update") || lowerSubject.includes("shipped")) {
          parsedGeminiOutput.primaryTopic = "Automated System Notification: Shipping Update";
        }
      }

      return {
        emailId: email.id,
        conversationId: email.conversationId,
        receivedDateTime: email.receivedDateTime,
        subject: email.subject,
        senderEmail: email.senderEmail,
        bodyText: email.bodyText,
        ...parsedGeminiOutput,
        aiModelUsed: GEMINI_MODEL_NAME,
        aiAnalysisTimestamp: new Date().toISOString(),
      };

    } catch (error: any) {
      console.error(`[AIService] Gemini API/Parse Error for email ${email.id}: ${error.message}. Response snippet: ${error.response?.text()?.substring(0,200) || 'N/A'}`);
      return {
        emailId: email.id,
        conversationId: email.conversationId,
        receivedDateTime: email.receivedDateTime,
        subject: email.subject,
        senderEmail: email.senderEmail,
        bodyText: email.bodyText,
        primaryTopic: "Error: AI_API_Failure",
        customerGoal: "N/A",
        extractedEntities: [],
        overallSentiment: null,
        estimatedComplexityToResolve: 'high',
        automationPotentialScore: 0.0,
        keyInformationForResolution: [],
        suggestedNextActions: [`Investigate Gemini API error for ${email.id}`],
        rawSummary: `Gemini API call failed for this email. Error: ${error.message}`,
        aiAnalysisError: `Gemini API/Parse Error: ${error.message}`,
        aiModelUsed: GEMINI_MODEL_NAME,
        aiAnalysisTimestamp: new Date().toISOString(),
      };
    }
  }
} 