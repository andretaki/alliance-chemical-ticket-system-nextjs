/**
 * Enhanced AI Service for Alliance Chemical Ticket System
 * Supercharged AI capabilities for intelligent automation
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';
import { getGoogleApiKey } from '@/lib/env';

interface ProductRecommendation {
  productId: string;
  productName: string;
  sku: string;
  confidence: number;
  reason: string;
  estimatedPrice: number;
  alternativeProducts?: ProductRecommendation[];
}

interface QuoteIntelligence {
  recommendedProducts: ProductRecommendation[];
  estimatedTotalValue: number;
  complexityScore: number;
  recommendedAction: 'draft_order' | 'qbo_estimate' | 'human_escalation';
  customerInsights: {
    buyingPatterns: string[];
    specialRequirements: string[];
    riskFactors: string[];
  };
  complianceAssessment: {
    hasHazmat: boolean;
    requiresSpecialHandling: boolean;
    shippingRestrictions: string[];
  };
}

interface TicketIntelligence {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedResolutionTime: string;
  recommendedAssignee: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  canAutoResolve: boolean;
  suggestedResponse: string;
  knowledgeBaseMatches: string[];
}

// Lazy initialization to avoid build-time errors
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new Error("Enhanced AI Service: GOOGLE_API_KEY is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  return _model;
}

export class EnhancedAiService {
  private readonly systemPrompt = `
You are an expert AI assistant for Alliance Chemical, a chemical industry company.
Your role is to provide intelligent analysis and recommendations for:
- Product recommendations based on customer inquiries
- Quote intelligence and complexity assessment
- Ticket categorization and routing
- Customer behavior analysis
- Risk assessment for compliance and safety
- Actionable business insights

Always prioritize safety, compliance, and customer satisfaction.
`;

  /**
   * Analyze customer inquiry and provide intelligent quote recommendations
   */
  async analyzeQuoteInquiry(
    customerEmail: string,
    inquiryText: string,
    customerHistory?: any[]
  ): Promise<QuoteIntelligence> {
    const prompt = `
Analyze this customer inquiry for Alliance Chemical and provide intelligent recommendations:

Customer Email: ${customerEmail}
Inquiry: ${inquiryText}
Customer History: ${customerHistory ? JSON.stringify(customerHistory, null, 2) : 'No history available'}

Provide a detailed analysis including:
1. Product recommendations with confidence scores
2. Estimated total value and complexity assessment
3. Recommended action (draft_order vs qbo_estimate vs human_escalation)
4. Customer insights and buying patterns
5. Risk assessment for compliance and shipping

Return as JSON matching the QuoteIntelligence interface.
`;

    try {
      const fullPrompt = `${this.systemPrompt}\n\n${prompt}`;
      const result = await getModel().generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();
      
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as QuoteIntelligence;
      }
      
      // Fallback response if no valid JSON found
      return this.createFallbackQuoteIntelligence();
    } catch (error) {
      console.error('AI Quote Analysis Error:', error);
      return this.createFallbackQuoteIntelligence();
    }
  }

  /**
   * Enhanced ticket analysis with intelligent routing
   */
  async analyzeTicket(
    subject: string,
    content: string,
    customerEmail: string,
    attachments?: string[]
  ): Promise<TicketIntelligence> {
    const prompt = `
Analyze this support ticket for Alliance Chemical and provide intelligent routing:

Subject: ${subject}
Content: ${content}
Customer: ${customerEmail}
Attachments: ${attachments?.join(', ') || 'None'}

Provide detailed analysis including:
1. Accurate categorization and urgency assessment
2. Estimated resolution time based on complexity
3. Recommended assignee based on expertise needed
4. Customer sentiment analysis
5. Auto-resolve capability assessment
6. Knowledge base matches for quick resolution

Return as JSON matching the TicketIntelligence interface.
`;

    try {
      const fullPrompt = `${this.systemPrompt}\n\n${prompt}`;
      const result = await getModel().generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as TicketIntelligence;
      }
      return this.createFallbackTicketIntelligence();
    } catch (error) {
      console.error('AI Ticket Analysis Error:', error);
      return this.createFallbackTicketIntelligence();
    }
  }

  /**
   * Generate intelligent customer insights
   */
  async generateCustomerInsights(customerEmail: string, ticketHistory: any[]): Promise<any> {
    try {
      const prompt = `
Analyze customer communication patterns and generate actionable insights:

Customer: ${customerEmail}
Ticket History: ${JSON.stringify(ticketHistory, null, 2)}

Provide insights on:
1. Communication preferences
2. Common issues and patterns
3. Satisfaction trends
4. Upselling opportunities
5. Risk factors

Return as structured JSON.
`;

      const fullPrompt = `${this.systemPrompt}\n\n${prompt}`;
      const result = await getModel().generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return this.createFallbackCustomerInsights();
    } catch (error) {
      console.error('AI Customer Insights Error:', error);
      return this.createFallbackCustomerInsights();
    }
  }

  /**
   * Create fallback quote intelligence when AI fails
   */
  private createFallbackQuoteIntelligence(): QuoteIntelligence {
    return {
      recommendedProducts: [],
      estimatedTotalValue: 0,
      complexityScore: 5,
      recommendedAction: 'human_escalation',
      customerInsights: {
        buyingPatterns: ['Standard chemical purchase'],
        specialRequirements: [],
        riskFactors: ['Manual review required']
      },
      complianceAssessment: {
        hasHazmat: false,
        requiresSpecialHandling: false,
        shippingRestrictions: []
      }
    };
  }

  /**
   * Create fallback ticket intelligence when AI fails
   */
  private createFallbackTicketIntelligence(): TicketIntelligence {
    return {
      category: 'General Inquiry',
      priority: 'medium',
      estimatedResolutionTime: '24 hours',
      recommendedAssignee: 'General Support',
      sentiment: 'neutral',
      canAutoResolve: false,
      suggestedResponse: 'Thank you for contacting Alliance Chemical. We have received your inquiry and will respond within 24 hours.',
      knowledgeBaseMatches: []
    };
  }

  /**
   * Create fallback customer insights when AI fails
   */
  private createFallbackCustomerInsights(): any {
    return {
      communicationPreferences: ['Email'],
      commonIssues: ['General inquiries'],
      satisfactionTrend: 'neutral',
      upsellOpportunities: [],
      riskFactors: []
    };
  }
}

// Export singleton instance
export const enhancedAiService = new EnhancedAiService();
export default enhancedAiService;