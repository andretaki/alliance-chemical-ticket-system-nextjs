/**
 * Types related to the ticket resolution system
 */

/**
 * Configuration for the ticket resolution system
 */
export interface ResolutionConfig {
  /** Whether to enable auto-closing of tickets */
  autoCloseEnabled: boolean;
  
  /** Number of days of inactivity required before considering a ticket for auto-resolution */
  inactivityDays: number;
  
  /** Confidence threshold required for auto-closing a ticket */
  confidenceThreshold: 'high' | 'medium' | 'low';
  
  /** Maximum number of tickets to process in a single batch */
  maxTicketsPerBatch: number;
  
  /** Whether to send notifications to customers when their tickets are auto-closed */
  sendCustomerNotification: boolean;
  
  /** Whether to include a survey link in the closure notification */
  includeSurveyLink: boolean;
  
  /** URL template for the survey link */
  surveyUrl: string;
  
  /** Whether to only auto-close tickets where the agent responded last (safety measure) */
  autoCloseOnlyIfAgentRespondedLast: boolean;
  
  /** Minimum number of conversation turns before AI analysis is performed */
  minimumConversationTurnsForAI: number;
  
  /** Number of days of inactivity after agent response required for high confidence auto-closure */
  inactivityDaysForConfidentClosure: number;
  
  /** Whether AI can automatically send follow-up questions to customers */
  enableAutoFollowUp: boolean;
  
  /** Whether to analyze tickets with low activity as well */
  analyzeLowActivityTickets: boolean;
}

/**
 * Default configuration for the resolution system
 */
export const DEFAULT_RESOLUTION_CONFIG: ResolutionConfig = {
  autoCloseEnabled: true,
  inactivityDays: 5,
  confidenceThreshold: 'high',
  maxTicketsPerBatch: 50,
  sendCustomerNotification: true,
  includeSurveyLink: false,
  surveyUrl: '',
  autoCloseOnlyIfAgentRespondedLast: true,
  minimumConversationTurnsForAI: 2,
  inactivityDaysForConfidentClosure: 3,
  enableAutoFollowUp: false,
  analyzeLowActivityTickets: false
};

/**
 * Analysis of a ticket's resolution status (enhanced with AI insights)
 */
export interface ResolutionAnalysis {
  /** Whether the ticket is considered resolved */
  isResolved: boolean;
  
  /** Summary of the resolution */
  resolutionSummary: string | null;
  
  /** AI confidence level of the analysis */
  confidence: 'high' | 'medium' | 'low';
  
  /** AI's detailed reason for the conclusion */
  reasonForConclusion: string;
  
  /** Whether the ticket should be automatically closed (derived from AI + config rules) */
  shouldAutoClose: boolean;
  
  /** AI's recommended action for the ticket */
  recommendedAction: 'close' | 'follow_up' | 'none';
  
  /** AI's suggested follow-up question if recommendedAction is 'follow_up' */
  followUpQuestion?: string | null;
  
  /** Additional context factors that influenced the AI's decision */
  analysisContext: {
    /** Whether the last message was from the customer */
    customerRespondedLast: boolean;
    /** Number of days since last agent response */
    daysSinceLastAgentResponse: number;
    /** Total conversation turns (customer + agent messages) */
    conversationTurns: number;
    /** Whether this ticket had multiple issues */
    hasMultipleIssues: boolean;
    /** Key topics/issues identified by AI */
    identifiedIssues: string[];
  };
  
  /** AI's assessment of customer satisfaction indicators */
  satisfactionIndicators: {
    /** Whether customer explicitly expressed satisfaction */
    explicitSatisfaction: boolean;
    /** Whether customer thanked the agent */
    expresstionOfGratitude: boolean;
    /** Any negative sentiment detected */
    negativeSentiment: boolean;
    /** Confidence in satisfaction assessment */
    satisfactionConfidence: 'high' | 'medium' | 'low';
  };
}

/**
 * Metrics for the resolution system (enhanced with AI-specific metrics)
 */
export interface ResolutionMetrics {
  /** Total number of resolved tickets */
  totalResolved: number;
  
  /** Total number of auto-closed tickets */
  totalAutoClosed: number;
  
  /** Total number of tickets with follow-up recommendations */
  totalFollowUp: number;
  
  /** Average time to resolution in days */
  averageResolutionTime: number;
  
  /** Percentage of tickets that are closed */
  resolutionRate: number;
  
  /** Timestamp of the last metrics update */
  lastRunTime: string | null;
  
  /** Number of reopened tickets */
  reopenedCount: number;
  
  /** Percentage of closed tickets that were auto-closed */
  autoCloseRate: number;
  
  /** Percentage of auto-closed tickets that were reopened */
  reopenRate: number;
  
  /** AI confidence distribution for auto-closed tickets */
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  
  /** Average number of conversation turns before AI closure */
  averageConversationTurns: number;
  
  /** Number of follow-up questions automatically sent */
  autoFollowUpsSent: number;
  
  /** Success rate of AI recommendations (tickets not reopened) */
  aiRecommendationAccuracy: number;
} 