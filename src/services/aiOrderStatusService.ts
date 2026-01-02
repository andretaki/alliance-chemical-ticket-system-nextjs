import { GoogleGenerativeAI, GenerationConfig, HarmCategory, HarmBlockThreshold, type GenerativeModel } from '@google/generative-ai';
import { OrderTrackingInfo } from '@/lib/shipstationService';
import { getCarrierInfo, generateTrackingLink } from '@/lib/orderResponseService';
import { env, getGoogleApiKey } from '@/lib/env';

// Interface for AI-drafted order status response
export interface AIDraftedOrderStatus {
  draftMessage: string;
  detectedCarrier?: string;
  trackingNumber?: string;
  trackingLink?: string;
  isStalledTracking?: boolean;
  isDeliveryException?: boolean;
  exceptionDetails?: string;
  confidence: 'high' | 'medium' | 'low';
  rawOrderInfo?: OrderTrackingInfo; // Include for debugging/context
}

// Initialize Gemini Model for order status drafting
let geminiModel: GenerativeModel | null = null;

function initializeGeminiForOrderStatus(): GenerativeModel | null {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    console.error("CRITICAL: GOOGLE_API_KEY not set in aiOrderStatusService.");
    return null;
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL_NAME });
    console.log(`[AIOrderStatusService] Google AI Model (${env.GEMINI_MODEL_NAME}) initialized.`);
    return model;
  } catch (e: any) {
    console.error(`[AIOrderStatusService] Failed to init Google AI (${env.GEMINI_MODEL_NAME}): ${e.message}`);
    return null;
  }
}

geminiModel = initializeGeminiForOrderStatus();

const SHIPSTATION_CONFIG = {
  endpoint: 'https://ssapi.shipstation.com',
  key: env.SHIPSTATION_API_KEY || '',
  secret: env.SHIPSTATION_API_SECRET || ''
};

// Helper function to extract just the first name for greetings
function extractFirstName(customerName: string | null | undefined): string {
  if (!customerName) {
    return 'Customer';
  }
  
  // Handle common name formats
  if (customerName.includes(',')) {
    // "Last, First" format - take the part after the comma
    const parts = customerName.split(',');
    if (parts.length > 1) {
      return parts[1].trim();
    }
  }
  
  // Handle "First Last" format - take the first word
  const words = customerName.trim().split(/\s+/);
  return words[0];
}

export class AIOrderStatusService {
  constructor() {
    if (!geminiModel) {
      console.warn("[AIOrderStatusService] Gemini model not available during construction.");
    }
  }

  /**
   * Generates an AI-drafted order status response for customers
   */
  public async generateOrderStatusDraft(
    orderInfo: OrderTrackingInfo | { found: false; errorMessage?: string },
    customerName: string,
    customerOriginalQuery?: string
  ): Promise<AIDraftedOrderStatus> {
    if (!geminiModel) {
      console.error("[AIOrderStatusService] Gemini model not initialized.");
      return {
        draftMessage: "I apologize, but I'm unable to generate a status update at this moment. An agent will assist you shortly with your order inquiry.",
        confidence: 'low',
        rawOrderInfo: orderInfo as OrderTrackingInfo
      };
    }

    try {
      // Handle order not found case
      if (!orderInfo.found) {
        const notFoundDraft = await this.generateOrderNotFoundDraft(customerName, customerOriginalQuery, orderInfo.errorMessage);
        return {
          draftMessage: notFoundDraft,
          confidence: 'high',
          rawOrderInfo: orderInfo as OrderTrackingInfo
        };
      }

      // Extract key order details
      const orderStatus = orderInfo.orderStatus || 'unknown';
      const hasShipments = orderInfo.shipments && orderInfo.shipments.length > 0;
      const latestShipment = hasShipments && orderInfo.shipments ? orderInfo.shipments[0] : null;
      
      // Get carrier information and tracking link
      let carrierInfo = null;
      let trackingLink = '';
      let detectedCarrier = '';
      let trackingNumber = '';
      
      if (latestShipment) {
        carrierInfo = getCarrierInfo(latestShipment.carrier);
        trackingLink = generateTrackingLink(carrierInfo, latestShipment.trackingNumber);
        detectedCarrier = carrierInfo.name;
        trackingNumber = latestShipment.trackingNumber;
      }

      // Analyze for potential issues
      const analysisResults = this.analyzeOrderForIssues(orderInfo);
      
      // Build context for AI prompt
      const orderContext = this.buildOrderContext(orderInfo, carrierInfo, customerOriginalQuery);
      
      // Generate AI response
      const prompt = this.buildAIPrompt(customerName, orderContext, analysisResults);
      
      const generationConfig: GenerationConfig = {
        temperature: 0.3, // Lower temperature for more consistent responses
        maxOutputTokens: 1000,
        topP: 0.8,
      };

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings,
      });

      const responseText = result.response.text();
      if (!responseText) {
        throw new Error("Empty AI response from Gemini.");
      }

      // Clean up the response
      const draftMessage = this.cleanupAIDraft(responseText);
      
      // Determine confidence based on order status and analysis
      const confidence = this.calculateConfidence(orderInfo, analysisResults);

      return {
        draftMessage,
        detectedCarrier,
        trackingNumber,
        trackingLink,
        isStalledTracking: analysisResults.isStalledTracking,
        isDeliveryException: analysisResults.isDeliveryException,
        exceptionDetails: analysisResults.exceptionDetails,
        confidence,
        rawOrderInfo: orderInfo
      };

    } catch (error: any) {
      console.error(`[AIOrderStatusService] Error generating order status draft: ${error.message}`);
      return {
        draftMessage: `I'm having trouble accessing the latest order information right now. Let me look into this for you and I'll get back to you shortly with an update. Thank you for your patience.`,
        confidence: 'low',
        rawOrderInfo: orderInfo as OrderTrackingInfo
      };
    }
  }

  /**
   * Analyzes order for potential issues or special conditions
   */
  private analyzeOrderForIssues(orderInfo: OrderTrackingInfo): {
    isStalledTracking: boolean;
    isDeliveryException: boolean;
    exceptionDetails?: string;
    isLTLShipment: boolean;
    daysSinceShipped?: number;
  } {
    let isStalledTracking = false;
    let isDeliveryException = false;
    let exceptionDetails = '';
    let isLTLShipment = false;
    let daysSinceShipped = 0;

    if (orderInfo.shipments && orderInfo.shipments.length > 0) {
      const latestShipment = orderInfo.shipments[0];
      const carrierInfo = getCarrierInfo(latestShipment.carrier);
      isLTLShipment = carrierInfo.isLTL;

      // Calculate days since shipped
      if (latestShipment.shipDate) {
        const shipDate = new Date(latestShipment.shipDate);
        const now = new Date();
        daysSinceShipped = Math.floor((now.getTime() - shipDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Check for stalled tracking (basic heuristic)
      if (!isLTLShipment && daysSinceShipped > 7) {
        isStalledTracking = true;
      } else if (isLTLShipment && daysSinceShipped > 10) {
        isStalledTracking = true;
      }

      // Check for delivery exceptions (would need more sophisticated logic in production)
      if (orderInfo.errorMessage?.toLowerCase().includes('exception') || 
          orderInfo.errorMessage?.toLowerCase().includes('delivery attempt')) {
        isDeliveryException = true;
        exceptionDetails = orderInfo.errorMessage;
      }
    }

    return {
      isStalledTracking,
      isDeliveryException,
      exceptionDetails,
      isLTLShipment,
      daysSinceShipped
    };
  }

  /**
   * Builds context string for AI prompt
   */
  private buildOrderContext(
    orderInfo: OrderTrackingInfo, 
    carrierInfo: any, 
    customerQuery?: string
  ): string {
    let context = '';
    
    // Order status
    context += `Order Status: ${orderInfo.orderStatus}\n`;
    
    // Order date
    if (orderInfo.orderDate) {
      const orderDate = new Date(orderInfo.orderDate);
      context += `Order Date: ${orderDate.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })}\n`;
    }

    // Shipment information
    if (orderInfo.shipments && orderInfo.shipments.length > 0) {
      const shipment = orderInfo.shipments[0];
      const shipDate = new Date(shipment.shipDate);
      context += `Shipped: ${shipDate.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })}\n`;
      context += `Carrier: ${carrierInfo?.name || shipment.carrier}\n`;
      context += `Tracking Number: ${shipment.trackingNumber}\n`;
      if (carrierInfo?.isLTL) {
        context += `Shipment Type: LTL Freight (Less-than-Truckload)\n`;
      }
      if (shipment.estimatedDelivery) {
        context += `Estimated Delivery: ${shipment.estimatedDelivery}\n`;
      }
    }

    // Items (if available)
    if (orderInfo.items && orderInfo.items.length > 0) {
      context += `Items: ${orderInfo.items.map(item => `${item.name} (Qty: ${item.quantity})`).join(', ')}\n`;
    }

    // Customer's original query context
    if (customerQuery) {
      context += `\nCustomer's Original Inquiry Context:\n${customerQuery}\n`;
    }

    return context;
  }

  /**
   * Builds the AI prompt for generating order status response
   */
  private buildAIPrompt(
    customerName: string, 
    orderContext: string, 
    analysisResults: any
  ): string {
    const firstName = extractFirstName(customerName);
    return `You are a professional customer service representative for Alliance Chemical. Your task is to draft a helpful, informative, and appropriately toned email response about an order status inquiry.

CUSTOMER NAME: ${firstName}

ORDER INFORMATION:
${orderContext}

ANALYSIS FLAGS:
- Stalled Tracking: ${analysisResults.isStalledTracking ? 'YES' : 'NO'}
- Delivery Exception: ${analysisResults.isDeliveryException ? 'YES' : 'NO'}
- LTL Shipment: ${analysisResults.isLTLShipment ? 'YES' : 'NO'}
- Days Since Shipped: ${analysisResults.daysSinceShipped || 'N/A'}

INSTRUCTIONS:
1. Address the customer by their first name only (${firstName}) politely
2. Provide clear, accurate order status information
3. Include tracking details if shipped (tracking number and direct tracking link)
4. For LTL shipments: Explain that tracking updates may be less frequent and carrier will likely call to schedule delivery
5. If tracking appears stalled: Acknowledge this professionally, explain it can happen, suggest monitoring, and assure we're also watching
6. If delivery exception: Clearly explain the issue and suggest next steps
7. Match the tone to the customer's inquiry (professional but empathetic if they seem frustrated)
8. End with offer to help further
9. DO NOT include signature lines like "Best regards, Alliance Chemical" - the agent will add those
10. Keep the response concise but complete

Generate ONLY the draft message text - no additional formatting or explanations.`;
  }

  /**
   * Generates a draft for order not found scenarios
   */
  private async generateOrderNotFoundDraft(
    customerName: string, 
    customerQuery?: string, 
    errorMessage?: string
  ): Promise<string> {
    const firstName = extractFirstName(customerName);
    const prompt = `You are a customer service representative for Alliance Chemical. A customer named ${firstName} is inquiring about an order, but we cannot find the order in our system.

${customerQuery ? `Customer's inquiry context: ${customerQuery}` : ''}
${errorMessage ? `System error: ${errorMessage}` : ''}

Draft a professional, helpful response that:
1. Acknowledges their inquiry politely using their first name (${firstName}) only
2. Explains we're having trouble locating the order
3. Asks them to verify the order number or provide additional details
4. Offers alternative ways to help (phone number, email, order date, etc.)
5. Maintains a helpful, solution-oriented tone
6. DO NOT include signature lines

Generate ONLY the draft message text.`;

    try {
      const result = await geminiModel!.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      });

      return this.cleanupAIDraft(result.response.text() || 
        `Hi ${firstName}, I'm having trouble locating the order you're asking about. Could you please verify the order number or provide additional details like the order date or email used for the purchase? I'm here to help get this resolved for you.`);
    } catch (error) {
      return `Hi ${firstName}, I'm having trouble locating the order you're asking about. Could you please verify the order number or provide additional details like the order date or email used for the purchase? I'm here to help get this resolved for you.`;
    }
  }

  /**
   * Cleans up AI-generated draft text
   */
  private cleanupAIDraft(text: string): string {
    return text
      .trim()
      .replace(/^["']|["']$/g, '') // Remove quotes if AI wrapped the response
      .replace(/\n{3,}/g, '\n\n') // Clean up excessive line breaks
      .replace(/\s+/g, ' ') // Clean up excessive spaces
      .trim();
  }

  /**
   * Calculates confidence level based on order information completeness
   */
  private calculateConfidence(orderInfo: OrderTrackingInfo, analysisResults: any): 'high' | 'medium' | 'low' {
    if (!orderInfo.found) return 'medium';
    
    let score = 0;
    
    // Order status is clear
    if (orderInfo.orderStatus) score += 2;
    
    // Has shipment information
    if (orderInfo.shipments && orderInfo.shipments.length > 0) score += 2;
    
    // Has tracking number
    if (orderInfo.shipments?.[0]?.trackingNumber) score += 1;
    
    // No concerning flags
    if (!analysisResults.isStalledTracking && !analysisResults.isDeliveryException) score += 1;
    
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }
} 