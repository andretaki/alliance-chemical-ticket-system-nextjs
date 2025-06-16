import { ticketPriorityEnum, ticketStatusEnum, ticketTypeEcommerceEnum, ticketSentimentEnum } from '@/db/schema';

// Email processing constants
export const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN || "alliancechemical.com";
export const DEFAULT_PRIORITY = ticketPriorityEnum.enumValues[1]; // 'medium'
export const DEFAULT_STATUS = ticketStatusEnum.enumValues[0];     // 'new'
export const OPEN_STATUS = ticketStatusEnum.enumValues[1];        // 'open' (Used when a reply comes in)
export const PENDING_CUSTOMER_STATUS = ticketStatusEnum.enumValues[3]; // 'pending_customer'
export const DEFAULT_TYPE = 'General Inquiry' as typeof ticketTypeEcommerceEnum.enumValues[number];
export const DEFAULT_SENTIMENT = ticketSentimentEnum.enumValues[1]; // 'neutral'

// Hard filter rules for email processing
export type HeaderRule = { type: 'header'; name: string; value: string };
export type SenderRule = { type: 'sender'; pattern: string };
export type SubjectRule = { type: 'subject'; pattern: string };
export type HardFilterRule = HeaderRule | SenderRule | SubjectRule;

export const HARD_FILTER_RULES: HardFilterRule[] = [
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

// Email keyword to assignee mappings
export const KEYWORD_ASSIGNEE_MAP: { [key: string]: string | string[] } = {
    'shipping': ['shipping@alliancechemical.com', 'logistics@alliancechemical.com'], 
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

// AI service configuration
export const AI_CONFIG = {
    // Classification categories
    EMAIL_CATEGORIES: [
        'CUSTOMER_SUPPORT_REQUEST', 'CUSTOMER_REPLY', 'SYSTEM_NOTIFICATION',
        'MARKETING_PROMOTIONAL', 'SPAM_PHISHING', 'OUT_OF_OFFICE',
        'PERSONAL_INTERNAL', 'VENDOR_BUSINESS', 'UNCLEAR_NEEDS_REVIEW'
    ] as const,
    
    // Valid intents for email analysis
    VALID_INTENTS: [
        'order_status_inquiry', 'tracking_request', 'return_request', 'order_issue',
        'documentation_request', 'quote_request', 'purchase_order_submission', 
        'general_inquiry', 'other'
    ] as const,
    
    // Document types
    DOCUMENT_TYPES: ['SDS', 'COA', 'COC', 'OTHER'] as const,
    
    // Confidence levels
    CONFIDENCE_LEVELS: ['high', 'medium', 'low'] as const
}; 