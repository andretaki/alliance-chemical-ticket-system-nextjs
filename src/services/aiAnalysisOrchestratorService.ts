import { EmailAnalysisData } from '@/types/emailAnalysis';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, type GenerativeModel } from '@google/generative-ai';
import { NotificationService } from './notificationService';
import { ProductService } from './productService';
import { OpenAI } from 'openai';
import { db, tickets, ticketComments } from '@/lib/db';
import { differenceInDays } from 'date-fns';
import { getOrderTrackingInfo } from '@/lib/shipstationService';
import { searchShipStationCustomerByEmail } from '@/lib/shipstationCustomerService';
import { ShopifyService } from './shopify/ShopifyService';

// Define the FORM_URL
const FORM_URL = process.env.CREDIT_APPLICATION_URL || "https://creditapp.alliancechemical.com";

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
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "models/gemini-2.5-flash-preview-05-20";

const carrierTrackingLinks: { [key: string]: string } = {
  ups: "https://www.ups.com/track?loc=en_US&requester=ST/&tracknum=",
  saia: "https://www.saia.com/track/results?pro=",
  xpo: "https://www.xpo.com/track/",
  arcb: "https://view.arcb.com/nlo/tools/tracking/", // For ABF
  sefl: "https://www.sefl.com/Tracing/index.jsp?trace=",
  // Add other carriers here as needed
};

function getTrackingLink(carrier: string, trackingNumber: string): string {
  const lowerCarrier = carrier.toLowerCase();
  for (const key in carrierTrackingLinks) {
    if (lowerCarrier.includes(key)) {
      return `${carrierTrackingLinks[key]}${trackingNumber}`;
    }
  }
  // Fallback for UPS tracking numbers specifically
  if (trackingNumber.startsWith('1Z')) {
    return `${carrierTrackingLinks['ups']}${trackingNumber}`;
  }
  return `(Tracking link for ${carrier} not available)`;
}

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
  private productService: ProductService;
  private shopifyService: ShopifyService;

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

  // Credit application detection patterns
  private creditApplicationPatterns = {
    requestPatterns: [
      /credit\s+application/i, /apply\s+for\s+credit/i, /credit\s+terms/i, /credit\s+account/i,
      /net\s+\d+\s+terms/i, /payment\s+terms/i, /credit\s+line/i, /credit\s+limit/i,
      /credit\s+check/i, /credit\s+approval/i
    ],
    followUpPatterns: [
      /credit\s+application\s+status/i, /status\s+of\s+credit\s+application/i,
      /check\s+credit\s+application/i, /credit\s+application\s+update/i,
      /credit\s+application\s+follow\s+up/i
    ],
    otherCreditPatterns: [ // Patterns to exclude to avoid false positives
      /credit\s+card/i, /credit\s+note/i, /credit\s+balance/i,
      /credit\s+refund/i, /credit\s+back/i, /credit\s+on\s+account/i
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
    this.productService = new ProductService();
    this.shopifyService = new ShopifyService();
  }

  /**
   * Analyzes a single email using Gemini to extract structured insights.
   */
  public async analyzeEmail(email: RawEmailInput): Promise<EmailAnalysisData> {
    if (!geminiModel) {
      console.error("[AIService] Gemini model not initialized. Cannot analyze email.");
      // Return a default error structure
      return {
        emailId: email.id, conversationId: email.conversationId, receivedDateTime: email.receivedDateTime,
        subject: email.subject, senderEmail: email.senderEmail, bodyText: email.bodyText,
        primaryTopic: "Error: AI_Service_Unavailable", customerGoal: "N/A", extractedEntities: [],
        overallSentiment: null, estimatedComplexityToResolve: 'medium', automationPotentialScore: 0,
        keyInformationForResolution: [], suggestedNextActions: [`Investigate AI Service unavailability for ${email.id}`],
        rawSummary: "AI analysis service (Gemini) is not available.", aiAnalysisError: "Gemini model not initialized.",
        aiModelUsed: GEMINI_MODEL_NAME, aiAnalysisTimestamp: new Date().toISOString(),
        suggestedAction: undefined,
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
  extractedEntities: Array<{
    type: string; // e.g., 'product', 'document_type', 'contact_person', 'company_name', 'order_number', 'shipping_address'
    value: string; // The extracted text
    context?: string; // Where it was found
    attributes?: {
      productGrade?: string; // If the product has a specific grade (e.g., 'ACS Grade', 'Technical Grade')
      partNumber?: string;
      quantity?: number;
      unit?: 'pail' | 'drum' | 'case' | 'bottle' | 'gallon';
    }
  }>;
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
  suggestedAction: "CREATE_QUOTE" | "CHECK_ORDER_STATUS" | "DOCUMENT_REQUEST" | "GENERAL_REPLY";
}

Key Instructions for 'primaryTopic':
1. You MUST select one value from the provided list for 'primaryTopic'.
2. If using "Other: New Category", secondaryTopic should be "Proposed Category Name: [Your Suggestion]" and tertiaryTopic should be the rationale.
3. 'primaryTopic' is for BROAD categorization. 'rawSummary' is for THIS email.

Key Instructions for 'extractedEntities':
1.  If you find a shipping address, set the type to 'shipping_address'.
2.  For 'product' types, be sure to extract 'quantity' and 'unit' (e.g., pail, drum, case) into the attributes if mentioned.
3.  Ensure the JSON is perfectly formed. Do not add comments.

**NEW INSTRUCTION:** Based on the customer's goal and extracted entities, determine the most logical next action for an agent.
Return this as 'suggestedAction' using ONLY one of these values: "CREATE_QUOTE", "CHECK_ORDER_STATUS", "DOCUMENT_REQUEST", "GENERAL_REPLY".
    `;

    const generationConfig: GenerationConfig = {
      responseMimeType: "application/json", temperature: 0.15, maxOutputTokens: 4096, topP: 0.8,
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
        generationConfig, safetySettings,
      });
      const responseText = result.response.text();
      if (!responseText) { throw new Error("Empty AI response from Gemini."); }

      const parsedGeminiOutput = JSON.parse(responseText.trim());

      // --- SDS/COA DOCUMENTATION REQUEST LOGIC ---
      if (parsedGeminiOutput.primaryTopic === "Documentation Request (SDS/COA)") {
        console.log(`[AIService] Email ${email.id} identified as Documentation Request. Attempting to find product and generate response.`);
        
        // Attempt to find a product name from the extracted entities
        const productEntity = parsedGeminiOutput.extractedEntities?.find((e: any) => e.type.toLowerCase().includes('product'));
        const productName = productEntity?.value;
        const productGrade = productEntity?.attributes?.productGrade;

        if (productName) {
          const sdsInfo = await this.productService.getSdsInfoForProduct(productName, productGrade);
          
          if (sdsInfo && sdsInfo.length > 0) {
            const gradeText = productGrade ? ` (Grade: ${productGrade})` : '';
            const intro = `The customer is requesting documentation for "${productName}"${gradeText}. I found the following Safety Data Sheet(s) (SDS):`;
            const sdsLinks = sdsInfo.map((info: { productTitle: string; sdsUrl: string; }) => `- ${info.productTitle}: ${info.sdsUrl}`).join('\n');
            const suggestedResponse = `Hello,\n\nThank you for contacting us. Here are the Safety Data Sheet(s) you requested for ${productName}${gradeText}:\n\n${sdsLinks}\n\nPlease let us know if you need anything else.\n\nBest regards,\nThe Alliance Chemical Team`;
            
            parsedGeminiOutput.keyInformationForResolution.push(intro);
            parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`);
            console.log(`[AIService] Successfully generated SDS response for ${productName} in email ${email.id}.`);
          } else {
            const gradeText = productGrade ? ` and grade "${productGrade}"` : '';
            console.log(`[AIService] Could not find SDS info for product "${productName}"${gradeText} in email ${email.id}.`);
            parsedGeminiOutput.suggestedNextActions.push(`Could not automatically locate SDS for product: "${productName}"${gradeText}. Please search manually.`);
          }
        } else {
          console.log(`[AIService] Documentation request identified, but no product name was extracted by the AI from email ${email.id}.`);
          parsedGeminiOutput.suggestedNextActions.push("AI identified a documentation request, but could not determine the product name. Please identify the product and find the SDS/COA manually.");
        }
      }

      // --- ORDER STATUS INQUIRY LOGIC ---
      else if (parsedGeminiOutput.primaryTopic === "Order Status Inquiry") {
        console.log(`[AIService] Email ${email.id} identified as Order Status Inquiry.`);
        const orderEntity = parsedGeminiOutput.extractedEntities?.find((e: any) => e.type.toLowerCase() === 'order_number');
        const orderNumber = orderEntity?.value?.replace('#', ''); // Clean up order number

        if (orderNumber) {
          const trackingInfo = await getOrderTrackingInfo(orderNumber);

          if (trackingInfo && trackingInfo.found && trackingInfo.shipments && trackingInfo.shipments.length > 0) {
            // Case 1: Tracking number exists
            const trackingLinks = trackingInfo.shipments
              .map(shipment => `Carrier: ${shipment.carrier}, Tracking #: ${shipment.trackingNumber}\nLink: ${getTrackingLink(shipment.carrier, shipment.trackingNumber)}`)
              .join('\n\n');

            const suggestedResponse = `Hello,\n\nThank you for your inquiry. Your order #${orderNumber} has shipped. Here is the tracking information:\n\n${trackingLinks}\n\nPlease let us know if you have any other questions.\n\nBest regards,\nThe Alliance Chemical Team`;
            
            parsedGeminiOutput.keyInformationForResolution.push(`Customer is asking for status of order #${orderNumber}. Tracking info was found.`);
            parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`);
          } else {
            // Case 2 or 3: No tracking number yet
            const orderDate = trackingInfo?.orderDate ? new Date(trackingInfo.orderDate) : new Date(); // Use today if date not found
            const daysSinceOrder = differenceInDays(new Date(), orderDate);

            if (daysSinceOrder < 2) {
              // Case 2: Less than 2 days old
              const suggestedResponse = `Hello,\n\nThank you for reaching out. We've received your order #${orderNumber}. It is currently being processed and is expected to ship shortly. You will receive an email with tracking information as soon as it's available.\n\nWe appreciate your patience.\n\nBest regards,\nThe Alliance Chemical Team`;
              parsedGeminiOutput.keyInformationForResolution.push(`Order #${orderNumber} was placed recently and has no tracking yet.`);
              parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`);
            } else {
              // Case 3: 2 or more days old
              const suggestedResponse = `Hello,\n\nThank you for contacting us about your order #${orderNumber}. We see that it has not yet shipped, and we are looking into the reason for the delay. We will get back to you with an update as soon as possible.\n\nWe apologize for the inconvenience.\n\nBest regards,\nThe Alliance Chemical Team`;
              parsedGeminiOutput.keyInformationForResolution.push(`Order #${orderNumber} is more than 2 days old and has no tracking. Needs investigation.`);
              parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`, `**Action Required:** Investigate delay for order #${orderNumber}.`);
            }
          }
        } else {
          console.log(`[AIService] Order status inquiry identified, but no order number was extracted from email ${email.id}.`);
          parsedGeminiOutput.suggestedNextActions.push("AI identified an order status inquiry, but could not determine the order number. Please ask the customer for the order number.");
        }
      }

      // --- QUOTE REQUEST LOGIC ---
      else if (parsedGeminiOutput.primaryTopic === "Quote Request") {
        console.log(`[AIService] Email ${email.id} identified as Quote Request. Checking for shipping address.`);
        
        let shippingAddress: any = null;

        // Step 1: Check for address in ShipStation history
        const customerInfo = await searchShipStationCustomerByEmail(email.senderEmail);
        if (customerInfo?.addresses?.shipping) {
          shippingAddress = {
            address1: customerInfo.addresses.shipping.address1,
            address2: customerInfo.addresses.shipping.address2,
            city: customerInfo.addresses.shipping.city,
            province: customerInfo.addresses.shipping.province,
            zip: customerInfo.addresses.shipping.zip,
            country: customerInfo.addresses.shipping.country,
            firstName: customerInfo.firstName,
            lastName: customerInfo.lastName,
            phone: customerInfo.phone,
            company: customerInfo.company,
          };
          console.log(`[AIService] Found address for ${email.senderEmail} in ShipStation history.`);
        }
        
        // Step 2: Check for address extracted directly from the email by the AI
        const addressEntity = parsedGeminiOutput.extractedEntities?.find((e: any) => e.type.toLowerCase() === 'shipping_address');
        if (addressEntity) {
          // A more robust solution would parse this address string, but for now we'll flag it.
          // For the purpose of this logic, we will assume if an address is extracted, we can proceed.
          // The actual address object from shipstation will be used if available.
          // If not, we will need to implement address parsing or pass the string.
          // For now, let's just use the existence of the entity as a signal.
          if (!shippingAddress) {
            // Placeholder: In a real scenario, you'd parse addressEntity.value
            // For now, we can't proceed without a structured address.
             console.log("[AIService] Address was found in email text, but parsing is not yet implemented. Cannot calculate rates.");
          }
        }

        if (shippingAddress) {
          // Address Found! Proceed with quote generation.
          console.log(`[AIService] Shipping address found for ${email.senderEmail}. Proceeding to calculate rates.`);
          const productEntities = parsedGeminiOutput.extractedEntities?.filter((e: any) => e.type.toLowerCase() === 'product');

          if (productEntities && productEntities.length > 0) {
            // Step 3: Find product variants
            const lineItems = [];
            for (const entity of productEntities) {
              // Combining value and grade for a more specific search
              const searchTerm = `${entity.value} ${entity.attributes?.productGrade || ''}`.trim();
              const searchResults = await this.productService.findVariantByName(searchTerm);

              if (searchResults.length > 0) {
                const variant = searchResults[0].variant;
                // Ensure we have a valid variant ID before adding
                if (variant.numericVariantIdShopify) {
                  lineItems.push({
                    numericVariantIdShopify: variant.numericVariantIdShopify,
                    quantity: entity.attributes?.quantity || 1,
                  });
                }
              }
            }

            if (lineItems.length > 0) {
              // Step 4: Calculate shipping rates
              try {
                const shippingRates = await this.shopifyService.calculateShippingRates(lineItems, shippingAddress);
                
                let responseText = `Hello,\n\nThank you for your quote request. Here are the available shipping options for your order:\n\n`;
                
                if (shippingRates && shippingRates.length > 0) {
                  shippingRates.forEach((rate: any) => {
                    responseText += `- ${rate.title}: $${parseFloat(rate.price.amount).toFixed(2)} ${rate.price.currencyCode}\n`;
                  });
                  responseText += `\nPlease let us know which option you'd like to proceed with.\n\nBest regards,\nThe Alliance Chemical Team`;
                } else {
                  responseText = `Hello,\n\nThank you for your quote request. We have the address on file, but we were unable to calculate shipping rates automatically. We will review your request and get back to you with a full quote shortly.\n\nBest regards,\nThe Alliance Chemical Team`;
                }

                parsedGeminiOutput.keyInformationForResolution.push(`Customer requested a quote. Shipping address was found. Shipping rates were calculated.`);
                parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${responseText}`);

              } catch (error: any) {
                console.error(`[AIService] Error calculating shipping rates for ${email.id}:`, error);
                parsedGeminiOutput.suggestedNextActions.push("Quote request identified with address, but an error occurred while calculating shipping rates. Please review manually.");
              }
            } else {
               parsedGeminiOutput.suggestedNextActions.push("AI could not find matching products for the quote request. Please review manually.");
            }

          } else {
            parsedGeminiOutput.suggestedNextActions.push("AI identified a quote request with an address, but could not extract any products. Please review manually.");
          }
          
        } else {
          // No Address Found. Ask the customer for it.
          console.log(`[AIService] No shipping address on file for ${email.senderEmail}. Generating request.`);
          
          const suggestedResponse = `Hello,\n\nThank you for your interest in our products. To provide you with an accurate quote that includes shipping, could you please reply with your full shipping address?\n\nWe look forward to hearing from you.\n\nBest regards,\nThe Alliance Chemical Team`;
          
          parsedGeminiOutput.keyInformationForResolution.push("Customer is requesting a quote, but no shipping address was found on file or in the email.");
          parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`);
        }
      }

      // --- CREDIT APPLICATION LOGIC MODIFICATION ---
      const emailTextForPatternMatching = `${email.subject} ${email.bodyText}`.toLowerCase();
      const isDirectCreditApplicationRequest = this.isCreditApplicationRequest(emailTextForPatternMatching);
      const isCreditApplicationFollowUp = this.isCreditApplicationFollowUp(emailTextForPatternMatching);

      // Ensure suggestedNextActions and keyInformationForResolution are initialized
      parsedGeminiOutput.suggestedNextActions = parsedGeminiOutput.suggestedNextActions || [];
      parsedGeminiOutput.keyInformationForResolution = parsedGeminiOutput.keyInformationForResolution || [];

      if (parsedGeminiOutput.primaryTopic === "Credit Application" || isDirectCreditApplicationRequest) {
        if (isDirectCreditApplicationRequest && parsedGeminiOutput.primaryTopic !== "Credit Application") {
            console.log(`[AIService] Pattern detected credit application for email ${email.id}, AI topic was: ${parsedGeminiOutput.primaryTopic}. Setting to 'Credit Application'.`);
            parsedGeminiOutput.primaryTopic = "Credit Application";
        }

        const suggestedResponse = `Hello,\n\nThank you for your interest in setting up a credit account with us. You can complete our credit application form at the link below. Our team will review your application and get back to you within 1-2 weeks.\n\n[Credit Application Form](${FORM_URL})\n\nIf you have any questions during the process, please feel free to email Andre@alliancechemical.com.\n\nBest regards,\nThe Alliance Chemical Team`;

        if (!parsedGeminiOutput.keyInformationForResolution.includes("Inquiry identified as a request to apply for credit.")) {
            parsedGeminiOutput.keyInformationForResolution.push("Inquiry identified as a request to apply for credit.");
        }
        
        parsedGeminiOutput.suggestedNextActions.push(`**Suggested AI Response:**\n\n${suggestedResponse}`);
        console.log(`[AIService] Email ${email.id} identified as credit application request. Suggestion added.`);
        
        // NOTE: The automatic sending `this.notificationService.handleCreditApplicationRequest(email.senderEmail);`
        // has been REMOVED to align with the requirement of "offering the suggestion in the ticket view".
        // The NotificationService still contains the method if manual triggering or other workflows need it.

      } else if (isCreditApplicationFollowUp) {
        // If it's a follow-up, ensure primaryTopic is Credit Application if AI missed it.
        if (parsedGeminiOutput.primaryTopic !== "Credit Application") {
             console.log(`[AIService] Pattern detected credit application FOLLOW-UP for email ${email.id}, AI topic was: ${parsedGeminiOutput.primaryTopic}. Setting to 'Credit Application'.`);
             parsedGeminiOutput.primaryTopic = "Credit Application";
        }
        const followUpSuggestion = "Customer is following up on an existing credit application. Check status.";
        if (!parsedGeminiOutput.suggestedNextActions.includes(followUpSuggestion)) {
            parsedGeminiOutput.suggestedNextActions.push(followUpSuggestion);
        }
        if (!parsedGeminiOutput.keyInformationForResolution.includes("Customer is following up on an existing credit application.")) {
             parsedGeminiOutput.keyInformationForResolution.push("Customer is following up on an existing credit application.");
        }
        console.log(`[AIService] Email ${email.id} identified as credit application follow-up.`);
      }
      // --- END CREDIT APPLICATION LOGIC MODIFICATION ---

      // Code-based normalization for primaryTopic (e.g., for Automated System Notifications)
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
        suggestedAction: parsedGeminiOutput.suggestedAction,
      };

    } catch (error: any) {
      console.error(`[AIService] Gemini API/Parse Error for email ${email.id}: ${error.message}. Response snippet: ${error.response?.text()?.substring(0,200) || 'N/A'}`);
      return {
        emailId: email.id, conversationId: email.conversationId, receivedDateTime: email.receivedDateTime,
        subject: email.subject, senderEmail: email.senderEmail, bodyText: email.bodyText,
        primaryTopic: "Error: AI_API_Failure", customerGoal: "N/A", extractedEntities: [],
        overallSentiment: null, estimatedComplexityToResolve: 'high', automationPotentialScore: 0.0,
        keyInformationForResolution: [], suggestedNextActions: [`Investigate Gemini API error for ${email.id}`],
        rawSummary: `Gemini API call failed for this email. Error: ${error.message}`,
        aiAnalysisError: `Gemini API/Parse Error: ${error.message}`,
        aiModelUsed: GEMINI_MODEL_NAME,
        aiAnalysisTimestamp: new Date().toISOString(),
        suggestedAction: undefined,
      };
    }
  }
} 