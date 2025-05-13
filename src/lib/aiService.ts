import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from "@google/generative-ai";
import { ticketTypeEcommerceEnum, ticketPriorityEnum, ticketSentimentEnum } from '@/db/schema'; // Added sentiment enum

// --- Environment Variable Check ---
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: Missing GOOGLE_API_KEY environment variable. AI Service cannot start.");
    // In a real app, you might want to prevent the app from starting or disable AI features gracefully.
    // For now, we throw an error during initialization.
    throw new Error("AI Service configuration is incomplete. GOOGLE_API_KEY is missing.");
}

// --- Initialize Google AI Client ---
const genAI = new GoogleGenerativeAI(apiKey);

// --- Select the Gemini 2.0 Flash model ---
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
});

// --- Define Valid Options Based on Schema ---
// Pass these to the AI to guide its response
const validTicketTypes = ticketTypeEcommerceEnum.enumValues;
const validPriorities = ticketPriorityEnum.enumValues;
const validSentiments = ticketSentimentEnum.enumValues; // Add sentiment enum values

// --- NEW: Define Triage Classification Categories ---
type EmailCategory =
  | 'CUSTOMER_SUPPORT_REQUEST' // A direct request for help, question, or issue report from a likely customer.
  | 'CUSTOMER_REPLY'           // A reply from a customer to an existing thread (even if threading check missed it).
  | 'SYSTEM_NOTIFICATION'      // Automated email (order confirm, shipping, payment, abandoned cart, etc.).
  | 'MARKETING_PROMOTIONAL'    // Newsletters, ads, etc.
  | 'SPAM_PHISHING'            // Unsolicited junk or malicious email.
  | 'OUT_OF_OFFICE'            // Auto-reply OOO message.
  | 'PERSONAL_INTERNAL'        // Non-ticket related email from an internal employee.
  | 'VENDOR_BUSINESS'          // Communication from suppliers, partners, etc. (not direct customer support).
  | 'UNCLEAR_NEEDS_REVIEW';    // AI is uncertain, requires human review.

// --- NEW: Define the Structure for AI Triage Output ---
interface EmailTriageResult {
    classification: EmailCategory;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string; // Brief explanation for the classification.
    isLikelyAutomated: boolean; // Specific flag for automation detection.
}

// --- Define the Structure for AI Output ---
export interface EmailAnalysisResult {
    ticketType: typeof validTicketTypes[number] | 'Other'; // Allow 'Other' as fallback
    orderNumber: string | null;
    trackingNumber: string | null;
    lotNumber: string | null; // NEW: Added lot number field
    summary: string; // For ticket title
    ai_summary: string | null; // NEW: Potentially longer summary for details
    prioritySuggestion: typeof validPriorities[number]; // AI suggests priority
    sentiment: typeof validSentiments[number] | null; // UPDATED: Use enum values
    likelyCustomerRequest: boolean; // NEW: AI's assessment
    classificationReason?: string; // NEW: Brief reason for classification
    documentType: 'SDS' | 'COA' | 'COC' | 'OTHER' | null; // NEW: Specific document type requested
    documentRequestConfidence: 'high' | 'medium' | 'low' | null; // NEW: Confidence in document classification
    documentName: string | null; // NEW: Actual name of the requested document if not one of the standard types
    intent: 'order_status_inquiry' | 'tracking_request' | 'return_request' | 'order_issue' | 'documentation_request' | 'quote_request' | 'purchase_order_submission' | 'general_inquiry' | 'other' | null;
    suggestedRoleOrKeywords: string | null; // NEW: For assignee suggestion
}

// --- Configure Generation Settings ---
// Tell the model to respond in JSON format
const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.4, // Lower temperature for more consistent results
    maxOutputTokens: 1024, // Optimize for our use case
    topP: 0.8, // Add topP for better response quality
    topK: 40, // Add topK for better response quality
};

// --- Configure Safety Settings ---
// Adjust blocking thresholds based on your tolerance for potentially sensitive content
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- NEW: AI Triage Function ---
/**
 * Uses AI to classify the primary nature of an email.
 * Focuses on identifying if it's a customer support request vs. other types.
 */
export async function triageEmailWithAI(subject: string, bodyPreview: string, senderAddress: string): Promise<EmailTriageResult | null> {
    const validCategories = [
        'CUSTOMER_SUPPORT_REQUEST', 'CUSTOMER_REPLY', 'SYSTEM_NOTIFICATION',
        'MARKETING_PROMOTIONAL', 'SPAM_PHISHING', 'OUT_OF_OFFICE',
        'PERSONAL_INTERNAL', 'VENDOR_BUSINESS', 'UNCLEAR_NEEDS_REVIEW'
    ];

    const prompt = `
        Analyze the following email's metadata and preview to classify its primary purpose. Focus intensely on differentiating genuine customer support needs from automated system notifications, marketing, spam, or internal chatter.

        **Sender:** ${senderAddress}
        **Subject:** ${subject}
        **Body Preview (first ~300 chars):**
        ${bodyPreview.substring(0, 300)}...

        **Valid Classification Categories:** ${validCategories.join(', ')}

        **Your Task:**
        1.  Determine the most fitting **classification** from the valid categories. Be critical:
            *   **CUSTOMER_SUPPORT_REQUEST:** Only use if it clearly seems like a human customer asking a question, reporting a problem, or requesting a specific action related to their order/account/product *that requires a support response*.
            *   **CUSTOMER_REPLY:** Use if it looks like a direct reply in an ongoing conversation with a customer.
            *   **SYSTEM_NOTIFICATION:** Use for ANY automated email from e-commerce platforms (Shopify, Amazon), payment processors, shipping carriers, internal tools (like abandoned cart alerts), etc. Look for keywords like "Order Confirmation", "Shipping Update", "Refund Initiated", "Payment Received", "Abandoned Cart", "Welcome", "Verify Your Email".
            *   **MARKETING_PROMOTIONAL:** Newsletters, sales announcements, promotions.
            *   **SPAM_PHISHING:** Unsolicited commercial email, scams, suspicious links.
            *   **OUT_OF_OFFICE:** Automatic replies indicating absence.
            *   **PERSONAL_INTERNAL:** Casual chat or non-work topics from internal staff.
            *   **VENDOR_BUSINESS:** Emails from suppliers, B2B partners, service providers.
            *   **UNCLEAR_NEEDS_REVIEW:** Use ONLY if the content is too ambiguous or minimal to classify confidently.
        2.  Assess your **confidence** level ('high', 'medium', 'low'). Use 'low' if guessing.
        3.  Provide brief **reasoning** for your classification (1-2 sentences).
        4.  Explicitly state if the email is **isLikelyAutomated** (true/false). Be strict: most system notifications, marketing, OOO, and spam are automated.

        **Output Format:**
        Return **ONLY** a valid JSON object matching this structure:
        {
          "classification": "...",
          "confidence": "...",
          "reasoning": "...",
          "isLikelyAutomated": true | false
        }
    `;

    try {
        console.log(`AI Service (Triage): Sending request for sender: ${senderAddress}, subject: "${subject.substring(0, 50)}..."`);
        // Use slightly different generation config if needed for classification vs extraction
        const generationConfigTriage: GenerationConfig = {
            responseMimeType: "application/json",
            temperature: 0.3, // Lower temp for more deterministic classification
            maxOutputTokens: 512,
            topP: 0.8,
            topK: 40,
        };
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: generationConfigTriage,
            safetySettings,
        });

        const responseText = result.response.text();
        if (!responseText) {
             console.error("AI Service Error (Triage): Response was empty."); return null;
        }

        const cleanedJson = responseText.replace(/^```json\s*|```$/g, '').trim();
        let parsedResult: EmailTriageResult;
        try {
            parsedResult = JSON.parse(cleanedJson);
        } catch (parseError) {
            console.error("AI Service Error (Triage): Failed to parse JSON:", parseError, "\nText:", responseText); return null;
        }

        // Validate the parsed result
        if (!parsedResult ||
            !validCategories.includes(parsedResult.classification) ||
            !['high', 'medium', 'low'].includes(parsedResult.confidence) ||
            typeof parsedResult.reasoning !== 'string' ||
            typeof parsedResult.isLikelyAutomated !== 'boolean') {
            console.error("AI Service Error (Triage): Invalid structure in parsed JSON:", parsedResult); return null;
        }

        console.log("AI Service (Triage): Successfully parsed triage result:", parsedResult);
        return parsedResult;
    } catch (error: any) {
        console.error("AI Service Error (Triage): API call failed:", error.message || error);
        if (error.response?.promptFeedback) {
            console.error("AI Safety Feedback (Triage):", error.response.promptFeedback);
        }
        return null;
    }
}

/**
 * Analyzes email subject and body using Gemini 2.0 Flash to extract ticket information.
 * @param subject Email subject
 * @param body Email body (plain text preferred)
 * @returns A structured analysis result or null if analysis fails.
 */
export async function analyzeEmailContent(subject: string, body: string): Promise<EmailAnalysisResult | null> {
    // --- Construct the Updated Prompt ---
    const prompt = `
        Analyze the following e-commerce customer support email subject and body, known to be a likely customer request, to extract relevant information for a support ticket.

        **Valid Ticket Types:** ${validTicketTypes.join(', ')}, Other
        **Valid Priorities:** ${validPriorities.join(', ')}
        **Valid Sentiments:** ${validSentiments.join(', ')}
        **Valid Intents:** order_status_inquiry, tracking_request, return_request, order_issue, documentation_request, quote_request, purchase_order_submission, general_inquiry, other
        **Document Types:** SDS (Safety Data Sheet), COA (Certificate of Analysis), COC (Certificate of Conformity)

        **Email Subject:**
        ${subject}

        **Email Body:**
        ${body}

        **Instructions:**
        1.  Determine the primary **intent** from the valid list.
        2.  Determine the most appropriate **ticketType** from the valid list. If none fit well, use "General Inquiry".
        3.  Extract the customer's **orderNumber**. Be flexible (e.g., #12345, ORD-67890, PO 12345, 3693). Return null if none found.
        4.  Extract any **trackingNumber**. Return null if none found.
        5.  Extract any **lotNumber**. Look for patterns like LOT12345, Lot: ABCDE, L/N: ..., Lot Number: .... Return null if none found.
        6.  Generate a concise **summary** (max 60 characters) suitable for a ticket title.
        7.  Generate an **ai_summary** (max 150 characters) capturing the core request or issue described in the body, especially if the body is long. Return null if the body is very short or uninformative.
        8.  Suggest a **prioritySuggestion**. Default to "medium" if unsure. Use "high" for clear issues (damaged, missing item) or "urgent" if explicitly stated by the customer.
        9.  Analyze the overall customer **sentiment** ('positive', 'neutral', 'negative'). Return null if unclear.
        10. For documentation requests, determine the specific **documentType** (SDS, COA, COC):
            * SDS = Safety Data Sheet, MSDS, Material Safety Data Sheet, safety documentation
            * COA = Certificate of Analysis, Analysis Certificate, Lab Results, Test Results
            * COC = Certificate of Conformity, Certificate of Compliance, Conformity Certificate
            * For any other document type, set documentType to "OTHER" and extract the specific document name into documentName field
            * Provide your confidence level in this determination as "documentRequestConfidence" (high, medium, low)
        11. Identify keywords or the user role best suited to handle this request (e.g., 'shipping', 'billing', 'coa_request', 'sds_request', 'technical_support', 'sales'). Return this as **suggestedRoleOrKeywords** (string or null).

        **Output Format:**
        Return **ONLY** a valid JSON object matching this structure:
        {
          "intent": "...",
          "ticketType": "...",
          "orderNumber": "..." | null,
          "trackingNumber": "..." | null,
          "lotNumber": "..." | null,
          "summary": "...",
          "ai_summary": "..." | null,
          "prioritySuggestion": "...",
          "sentiment": "..." | null,
          "documentType": "SDS" | "COA" | "COC" | "OTHER" | null,
          "documentRequestConfidence": "high" | "medium" | "low" | null,
          "documentName": "..." | null,
          "suggestedRoleOrKeywords": "..." | null
        }
    `;

    try {
        console.log(`AI Service (Extract): Sending request for subject: "${subject.substring(0, 50)}..."`);
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
            safetySettings,
        });
        const responseText = result.response.text();
        if (!responseText) {
            console.error("AI Service Error (Extract): Response empty."); return null;
        }
        const cleanedJson = responseText.replace(/^```json\s*|```$/g, '').trim();
        let parsedResult: any;
        try {
            parsedResult = JSON.parse(cleanedJson);
        } catch (parseError) {
            console.error("AI Service Error (Extract): Failed to parse JSON:", parseError, "\nText:", responseText); return null;
        }

        // Basic validation and default setting for core fields
        if (!parsedResult || typeof parsedResult.summary !== 'string' || typeof parsedResult.prioritySuggestion !== 'string') {
            console.error("AI Service Error (Extract): Invalid structure in parsed JSON:", parsedResult);
             parsedResult = parsedResult || {}; // Ensure parsedResult is an object
             parsedResult.summary = parsedResult.summary || subject.substring(0, 60);
             parsedResult.prioritySuggestion = validPriorities.includes(parsedResult.prioritySuggestion) ? parsedResult.prioritySuggestion : 'medium';
             parsedResult.ticketType = validTicketTypes.includes(parsedResult.ticketType) ? parsedResult.ticketType : 'General Inquiry';
             parsedResult.ai_summary = parsedResult.ai_summary || null;
             parsedResult.sentiment = validSentiments.includes(parsedResult.sentiment) ? parsedResult.sentiment : null;
             parsedResult.suggestedRoleOrKeywords = parsedResult.suggestedRoleOrKeywords || null;
        }

        // Ensure sentiment is valid or null
        if (parsedResult.sentiment && !validSentiments.includes(parsedResult.sentiment)) {
            console.warn(`AI Service Warning (Extract): Invalid sentiment "${parsedResult.sentiment}", defaulting to null.`);
            parsedResult.sentiment = null;
        }
        
        // --- Add defaults/processing for other fields as before ---
        parsedResult.likelyCustomerRequest = true;
        parsedResult.classificationReason = "Classified as customer request by triage AI.";
        if (parsedResult.intent === 'documentation_request') {
            if (!parsedResult.documentType) parsedResult.documentType = null;
            if (!parsedResult.documentRequestConfidence) parsedResult.documentRequestConfidence = 'low';
            if (!parsedResult.documentName) parsedResult.documentName = null;
            if (!parsedResult.documentType && parsedResult.ticketType) {
                if (parsedResult.ticketType === 'SDS Request') { parsedResult.documentType = 'SDS'; parsedResult.documentRequestConfidence = 'high'; }
                else if (parsedResult.ticketType === 'COA Request') { parsedResult.documentType = 'COA'; parsedResult.documentRequestConfidence = 'high'; }
                else if (parsedResult.ticketType === 'COC Request') { parsedResult.documentType = 'COC'; parsedResult.documentRequestConfidence = 'high'; }
            }
        } else {
            parsedResult.documentType = null; parsedResult.documentRequestConfidence = null; parsedResult.documentName = null;
        }
        // --- End defaults/processing ---

        console.log("AI Service (Extract): Successfully parsed extraction:", parsedResult);
        return parsedResult as EmailAnalysisResult; // Cast back

    } catch (error: any) {
        console.error("AI Service Error (Extract): API call failed:", error.message || error);
        if (error.response?.promptFeedback) {
            console.error("AI Safety Feedback (Extract):", error.response.promptFeedback);
        }
        return null;
    }
} 