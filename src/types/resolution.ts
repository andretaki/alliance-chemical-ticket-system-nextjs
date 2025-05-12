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
  surveyUrl: ''
};

/**
 * Analysis of a ticket's resolution status
 */
export interface ResolutionAnalysis {
  /** Whether the ticket is considered resolved */
  isResolved: boolean;
  
  /** Summary of the resolution */
  resolutionSummary: string | null;
  
  /** Confidence level of the analysis */
  confidence: 'high' | 'medium' | 'low';
  
  /** Reason for the conclusion */
  reasonForConclusion: string;
  
  /** Whether the ticket should be automatically closed */
  shouldAutoClose: boolean;
  
  /** Recommended action for the ticket */
  recommendedAction: 'close' | 'follow_up' | 'none';
  
  /** Suggested follow-up question if recommendedAction is 'follow_up' */
  followUpQuestion?: string;
  
  /** Expected next steps for the ticket */
  expectedNextSteps?: string;
}

/**
 * Metrics for the resolution system
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
} 