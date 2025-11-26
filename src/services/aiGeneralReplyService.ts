import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerativeModel } from "@google/generative-ai";
import type { Ticket, TicketComment } from '@/types/ticket';

// --- Lazy initialization to avoid build-time errors ---
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
    if (_model) return _model;

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("AI General Reply Service: GOOGLE_API_KEY is missing.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    _model = genAI.getGenerativeModel({
        model: "models/gemini-2.5-flash-preview-05-20",
    });
    return _model;
}

// --- Local Helper Function ---
function extractFirstName(customerName: string | null | undefined): string {
  if (!customerName) {
    return 'Customer';
  }
  if (customerName.includes(',')) {
    const parts = customerName.split(',');
    if (parts.length > 1) {
      const firstName = parts[1].trim();
      if (firstName) return firstName;
    }
  }
  const words = customerName.trim().split(/\s+/);
  return words[0] || 'Customer';
}

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
];

type ReplyIntent = 
  | 'PRODUCT_AVAILABILITY_INQUIRY'
  | 'TECHNICAL_SUPPORT_REQUEST'
  | 'BILLING_INQUIRY'
  | 'DAMAGED_OR_INCORRECT_ORDER'
  | 'GENERAL_INQUIRY';

// Regex to quickly screen out simple, non-substantive messages
const NON_SUBSTANTIVE_REGEX = /^(thanks?|thank you|ok|okay|got it|sounds good|perfect|great|awesome|cool|received|no problem|you're welcome|k|kk)\.?!*\s*$/i;

export class AIGeneralReplyService {

  /**
   * Checks if a customer's message is substantive enough to warrant a detailed reply.
   * @param commentText The text of the customer's comment.
   * @returns {Promise<boolean>} True if the message is substantive, false otherwise.
   */
  public async isSubstantive(commentText: string | null): Promise<boolean> {
    if (!commentText || commentText.trim().length < 3 || commentText.trim().length > 1000) {
      return true;
    }

    if (NON_SUBSTANTIVE_REGEX.test(commentText.trim())) {
      console.log(`[AIGeneralReply] Comment classified as non-substantive by regex: "${commentText}"`);
      return false;
    }

    const prompt = `
You are a text analysis expert. Is the following customer message a simple pleasantry (like "thank you", "ok", "sounds good") or does it contain a real question, a new piece of information, or a request that requires a response?

Respond with only "Yes" if it requires a response, or "No" if it is just a simple pleasantry.

Message: "${commentText}"

Response:`;

    try {
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings,
        generationConfig: { temperature: 0.1, maxOutputTokens: 5 }
      });
      const responseText = result.response.text().trim().toLowerCase();
      const isSubstantive = responseText.includes('yes');
      console.log(`[AIGeneralReply] AI substance check for "${commentText}": ${isSubstantive}`);
      return isSubstantive;
    } catch (error) {
      console.error("[AIGeneralReply] Error in AI substance check. Assuming substantive to be safe.", error);
      return true;
    }
  }

  public async generateReply(ticket: Ticket, lastCustomerComment: TicketComment): Promise<string | null> {
    const customerName = ticket.senderName || 'Valued Customer';
    const commentText = lastCustomerComment.commentText || ticket.description || '';

    if (!commentText) {
      console.error(`[AIGeneralReply] No text to analyze for ticket ${ticket.id}`);
      return null;
    }

    const intent = await this.determineIntent(commentText);
    console.log(`[AIGeneralReply] Intent for ticket ${ticket.id} determined as: ${intent}`);

    switch (intent) {
      case 'PRODUCT_AVAILABILITY_INQUIRY':
        return this.generateProductAvailabilityResponse(customerName, commentText);
      
      case 'TECHNICAL_SUPPORT_REQUEST':
        return this.generateTechnicalSupportResponse(customerName, commentText);

      case 'DAMAGED_OR_INCORRECT_ORDER':
        const hasAttachments = (ticket.attachments || []).some(a => a.commentId === lastCustomerComment.id) || (ticket.attachments || []).some(a => !a.commentId);
        return this.generateDamagedOrderResponse(customerName, commentText, hasAttachments);

      case 'BILLING_INQUIRY':
         return this.generateBillingInquiryResponse(customerName, commentText);

      case 'GENERAL_INQUIRY':
      default:
        return this.generateGeneralInquiryResponse(customerName, commentText);
    }
  }

  private async determineIntent(commentText: string): Promise<ReplyIntent> {
    const prompt = `
You are an expert at classifying customer support requests. Analyze the following message and classify it into ONE of the following categories. Respond with ONLY the category name.

Categories:
- PRODUCT_AVAILABILITY_INQUIRY: Questions about whether a product is in stock, lead times, or availability.
- TECHNICAL_SUPPORT_REQUEST: Requests for technical help, product specifications, or issues with how a product works.
- BILLING_INQUIRY: Questions about an invoice, payment, or charges.
- DAMAGED_OR_INCORRECT_ORDER: Reports of receiving a damaged, broken, or incorrect item.
- GENERAL_INQUIRY: If it does not fit any of the above categories.

Customer Message:
"${commentText.substring(0, 500)}"

Category:`;

    try {
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings,
      });
      const responseText = result.response.text()?.trim();

      if (responseText && ['PRODUCT_AVAILABILITY_INQUIRY', 'TECHNICAL_SUPPORT_REQUEST', 'BILLING_INQUIRY', 'DAMAGED_OR_INCORRECT_ORDER', 'GENERAL_INQUIRY'].includes(responseText)) {
        return responseText as ReplyIntent;
      }

      console.warn(`[AIGeneralReply] Could not determine a specific intent. Defaulting to GENERAL_INQUIRY. Raw response: "${responseText}"`);
      return 'GENERAL_INQUIRY';

    } catch (error: any) {
      console.error("[AIGeneralReply] Error determining intent:", error.message || error);
      return 'GENERAL_INQUIRY';
    }
  }

  // --- Response Generation for Each Intent ---

  private async generateProductAvailabilityResponse(customerName: string, commentText: string): Promise<string> {
    const prompt = `
You are a friendly and professional customer service agent for Alliance Chemical.
The customer is asking about product availability.

**Key Information to Include:**
- The product they are asking about IS IN STOCK.
- The standard handling time is 1-2 business days before shipment.

**Your Task:**
Draft a professional and helpful reply that:
1. Addresses the customer by their first name (${extractFirstName(customerName)}).
2. Confirms the product is in stock.
3. Informs them about the 1-2 business day handling time.
4. Asks if they would like you to prepare a formal quote for them.

Customer's message for context: "${commentText}"

Drafted Reply:`;
    return this.executePrompt(prompt);
  }

  private async generateTechnicalSupportResponse(customerName: string, commentText: string): Promise<string> {
    const prompt = `
You are an empathetic and professional customer service agent for Alliance Chemical.
The customer is reporting a technical issue or has a technical question.

**Your Task:**
Draft an empathetic reply that:
1. Addresses the customer by their first name (${extractFirstName(customerName)}).
2. Acknowledges their issue and thanks them for bringing it to your attention.
3. Informs them that you are escalating their request to the technical support team.
4. Assures them that a specialist will review their case and get back to them shortly.

Customer's message for context: "${commentText}"

Drafted Reply:`;
    return this.executePrompt(prompt);
  }
  
  private async generateDamagedOrderResponse(customerName: string, commentText: string, hasAttachments: boolean): Promise<string> {
    const photoInstruction = hasAttachments
      ? "Thank them for providing photos and mention that you are reviewing them."
      : "Kindly ask them to provide photos of the product they received, the packaging, and the shipping label. Explain that this will help you resolve the issue as quickly as possible.";

    const prompt = `
You are an empathetic and highly professional customer service agent for Alliance Chemical, specializing in resolving order issues.
The customer is reporting that they received a damaged or incorrect order.

**Your Task:**
Draft a very empathetic and helpful reply that:
1. Addresses the customer by their first name (${extractFirstName(customerName)}).
2. Sincerely apologizes for the problem with their order.
3. ${photoInstruction}
4. Reassures them that you will work to resolve this for them promptly.

Customer's message for context: "${commentText}"

Drafted Reply:`;
    return this.executePrompt(prompt);
  }

  private async generateBillingInquiryResponse(customerName: string, commentText: string): Promise<string> {
    const prompt = `
You are a professional and reassuring customer service agent for Alliance Chemical.
The customer has an inquiry about billing.

**Your Task:**
Draft a professional reply that:
1. Addresses the customer by their first name (${extractFirstName(customerName)}).
2. Acknowledges their billing inquiry.
3. If they mentioned an invoice number, confirm you are reviewing it.
4. Assures them that you are looking into the matter and will provide an update shortly.

Customer's message for context: "${commentText}"

Drafted Reply:`;
    return this.executePrompt(prompt);
  }
  
  private async generateGeneralInquiryResponse(customerName: string, commentText: string): Promise<string> {
    const prompt = `
You are a helpful and professional customer service agent for Alliance Chemical.
The customer has a general question.

**Your Task:**
Draft a professional and friendly reply that:
1. Addresses the customer by their first name (${extractFirstName(customerName)}).
2. Acknowledges their question.
3. Lets them know you are looking into their request and will get back to them as soon as possible.

Customer's message for context: "${commentText}"

Drafted Reply:`;
    return this.executePrompt(prompt);
  }

  private async executePrompt(prompt: string): Promise<string> {
    try {
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 500,
        }
      });
      return result.response.text()?.trim() || "I'm sorry, I couldn't draft a reply at this moment. Please try again.";
    } catch (error: any) {
      console.error(`[AIGeneralReply] Error executing prompt:`, error.message || error);
      return "There was an issue generating an AI reply. Please contact support if this continues.";
    }
  }
}

export const aiGeneralReplyService = new AIGeneralReplyService(); 