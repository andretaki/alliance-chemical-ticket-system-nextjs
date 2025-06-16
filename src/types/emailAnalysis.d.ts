export interface ExtractedEntityDetail {
  type: string;
  value: string;
  context?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface EmailAnalysisData {
  emailId: string; // Graph Message ID
  conversationId?: string;
  receivedDateTime: string; // ISO string
  subject: string;
  senderEmail: string;
  senderName?: string;
  bodyText: string; // Stripped HTML body
  bodyPreview?: string;

  // Fields from Gemini Analysis
  primaryTopic: string;
  secondaryTopic?: string;
  tertiaryTopic?: string;
  customerGoal: string;
  specificQuestionsAsked?: string[];
  problemReported?: {
    description: string;
    associatedProduct?: string;
    urgencyToCustomer: 'low' | 'medium' | 'high' | 'critical';
  };
  extractedEntities: ExtractedEntityDetail[];
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  specificTones?: ('frustrated' | 'confused' | 'appreciative' | 'demanding' | 'urgent' | 'inquisitive')[];
  estimatedComplexityToResolve: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  potentialRootCauseCategory?: string;
  customerJourneyStageHint?: 'pre_sales_inquiry' | 'quote_negotiation' | 'order_placement' | 'payment_confirmation' | 'order_fulfillment_update' | 'delivery_coordination' | 'post_delivery_issue' | 'product_support_request' | 'return_or_refund_process' | 'billing_dispute' | 'account_update' | 'feedback_submission' | 'vendor_outreach_to_us' | 'automated_transactional_notice' | 'other_operational';
  multiIntentDetected?: boolean;
  automationPotentialScore: number; // 0.0 to 1.0
  keyInformationForResolution: string[];
  suggestedNextActions: string[];
  rawSummary: string; // AI's summary of THIS specific email
  suggestedAction?: "CREATE_QUOTE" | "CHECK_ORDER_STATUS" | "DOCUMENT_REQUEST" | "GENERAL_REPLY";
  aiModelUsed?: string; // e.g., "models/gemini-2.5-flash-preview-05-20"
  aiAnalysisTimestamp?: string; // ISO string
  aiAnalysisError?: string; // If Gemini call failed for this email
} 