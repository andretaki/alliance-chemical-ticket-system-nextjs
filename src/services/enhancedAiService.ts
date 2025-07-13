/**
 * Enhanced AI Service for Alliance Chemical Ticket System
 * Supercharged AI capabilities for intelligent automation
 */

import { openai } from '@/lib/aiService';
import type { SimpleQuoteEmailData } from '@/types/quoteInterfaces';

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
  complexity: 'simple' | 'complex' | 'requires_specialist';
  recommendedAction: 'create_draft_order' | 'create_qbo_estimate' | 'escalate_to_human';
  customerInsights: {
    buyingPattern: string;
    priceRange: string;
    urgency: 'low' | 'medium' | 'high';
    specialRequirements: string[];
  };
  riskAssessment: {
    creditRisk: 'low' | 'medium' | 'high';
    complianceRequirements: string[];
    shippingComplexity: 'standard' | 'hazmat' | 'international';
  };
}

interface TicketIntelligence {
  category: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  estimatedResolutionTime: number; // in hours
  recommendedAssignee: string | null;
  suggestedActions: string[];
  customerSentiment: 'positive' | 'neutral' | 'frustrated' | 'angry';
  autoResolveCapability: boolean;
  knowledgeBaseMatches: string[];
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
3. Recommended action (draft order vs QBO estimate vs human escalation)
4. Customer insights and buying patterns
5. Risk assessment for compliance and shipping

Return as JSON matching the QuoteIntelligence interface.
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}') as QuoteIntelligence;
    } catch (error) {
      console.error('AI Quote Analysis Error:', error);
      throw new Error('Failed to analyze quote inquiry');
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
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}') as TicketIntelligence;
    } catch (error) {
      console.error('AI Ticket Analysis Error:', error);
      throw new Error('Failed to analyze ticket');
    }
  }

  /**
   * Generate intelligent response suggestions
   */
  async generateResponseSuggestions(
    ticketContent: string,
    customerHistory: any[],
    urgency: string
  ): Promise<string[]> {
    const prompt = `
Generate 3 professional response suggestions for this Alliance Chemical support ticket:

Ticket Content: ${ticketContent}
Customer History: ${JSON.stringify(customerHistory, null, 2)}
Urgency: ${urgency}

Provide responses that are:
1. Professional and empathetic
2. Technically accurate for chemical industry
3. Action-oriented with clear next steps
4. Compliant with industry regulations
5. Personalized based on customer history

Return as array of response strings.
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4
      });

      const content = response.choices[0].message.content || '';
      return content.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error('AI Response Generation Error:', error);
      throw new Error('Failed to generate response suggestions');
    }
  }

  /**
   * Product matching with advanced ML
   */
  async findMatchingProducts(
    description: string,
    quantity?: string,
    specifications?: string[]
  ): Promise<ProductRecommendation[]> {
    const prompt = `
Find matching chemical products for this request at Alliance Chemical:

Description: ${description}
Quantity: ${quantity || 'Not specified'}
Specifications: ${specifications?.join(', ') || 'None provided'}

Search our chemical product catalog and provide:
1. Exact matches with high confidence
2. Alternative products that meet requirements
3. Estimated pricing based on market data
4. Safety and compliance considerations
5. Reason for each recommendation

Return as array of ProductRecommendation objects.
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.products || [];
    } catch (error) {
      console.error('AI Product Matching Error:', error);
      throw new Error('Failed to find matching products');
    }
  }

  /**
   * Business intelligence and insights
   */
  async generateBusinessInsights(
    ticketData: any[],
    customerData: any[],
    salesData: any[]
  ): Promise<{
    trends: string[];
    opportunities: string[];
    risks: string[];
    recommendations: string[];
  }> {
    const prompt = `
Analyze Alliance Chemical's business data and provide actionable insights:

Recent Tickets: ${JSON.stringify(ticketData.slice(0, 10), null, 2)}
Customer Data: ${JSON.stringify(customerData.slice(0, 10), null, 2)}
Sales Data: ${JSON.stringify(salesData.slice(0, 10), null, 2)}

Provide business intelligence including:
1. Emerging trends and patterns
2. Growth opportunities
3. Risk factors and mitigation strategies
4. Actionable recommendations for improvement

Focus on chemical industry specifics and regulatory considerations.
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('AI Business Insights Error:', error);
      throw new Error('Failed to generate business insights');
    }
  }

  /**
   * Compliance and safety analysis
   */
  async analyzeComplianceRequirements(
    productList: string[],
    destination: string,
    shippingMethod: string
  ): Promise<{
    requirements: string[];
    warnings: string[];
    documentation: string[];
    restrictions: string[];
  }> {
    const prompt = `
Analyze compliance requirements for Alliance Chemical shipment:

Products: ${productList.join(', ')}
Destination: ${destination}
Shipping Method: ${shippingMethod}

Provide comprehensive analysis including:
1. Regulatory requirements (DOT, EPA, OSHA, etc.)
2. Safety warnings and precautions
3. Required documentation and certifications
4. Shipping restrictions and regulations
5. International trade considerations if applicable

Focus on chemical industry compliance and safety standards.
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Very low temperature for compliance accuracy
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('AI Compliance Analysis Error:', error);
      throw new Error('Failed to analyze compliance requirements');
    }
  }
}

export const enhancedAiService = new EnhancedAiService();