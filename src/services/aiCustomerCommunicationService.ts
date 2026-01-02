import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, GenerativeModel } from "@google/generative-ai";
import { env, getGoogleApiKey } from '@/lib/env';

// Lazy initialization to avoid build-time errors
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new Error("AI Customer Communication Service: GOOGLE_API_KEY is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({
    model: env.GEMINI_MODEL_NAME,
  });
  return _model;
}

export interface CustomerCommunicationSuggestion {
  welcomeEmail: {
    subject: string;
    body: string;
    personalizedGreeting: string;
  };
  followUpActions: string[];
  onboardingChecklist: string[];
  commonResponseTemplates: {
    quotingProcess: string;
    shippingInquiry: string;
    productAvailability: string;
    technicalSupport: string;
  };
  customerServiceTips: string[];
  estimatedCostSavings: {
    timeInMinutes: number;
    description: string;
  };
}

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  customerType: 'retail' | 'wholesale' | 'distributor';
  industry?: string;
  shippingAddress: {
    city: string;
    province: string;
    country: string;
  };
}

export class AICustomerCommunicationService {
  private generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.6, // Balanced for creativity and consistency
    maxOutputTokens: 3000,
    topP: 0.8,
    topK: 40,
  };

  private safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];

  public async generateCustomerCommunicationSuggestions(
    customerProfile: CustomerProfile
  ): Promise<CustomerCommunicationSuggestion | null> {
    const prompt = `
You are an expert customer communication specialist for Alliance Chemical, a chemical supply company. Generate personalized communication suggestions for a new customer.

Customer Profile:
- Name: ${customerProfile.firstName} ${customerProfile.lastName}
- Email: ${customerProfile.email}
- Company: ${customerProfile.company || 'Individual'}
- Customer Type: ${customerProfile.customerType}
- Location: ${customerProfile.shippingAddress.city}, ${customerProfile.shippingAddress.province}, ${customerProfile.shippingAddress.country}

Company Context:
- Alliance Chemical is a professional chemical supplier
- We serve retail, wholesale, and distributor customers
- We provide SDS documentation, COA certificates, and technical support
- We offer competitive pricing and reliable shipping
- We prioritize safety and regulatory compliance

Generate PROFESSIONAL, HELPFUL, and PERSONALIZED content that will:
1. Make the customer feel valued and welcomed
2. Set clear expectations about our services
3. Provide useful information they'll need
4. Save our team time by addressing common questions proactively

IMPORTANT GUIDELINES:
- Use professional but friendly tone
- Include specific details relevant to their customer type
- Make templates actionable and ready-to-use
- Focus on value-added information
- Keep emails concise but informative
- All content should be immediately usable without further editing

Response Format (JSON):
{
  "welcomeEmail": {
    "subject": "Welcome to Alliance Chemical - Your Account is Ready",
    "body": "Full email body with proper formatting and line breaks",
    "personalizedGreeting": "Personalized greeting line"
  },
  "followUpActions": [
    "List of 4-6 specific actions for our team to take",
    "Each action should be immediately actionable",
    "Focus on relationship building and value delivery"
  ],
  "onboardingChecklist": [
    "List of 5-7 items for customer onboarding",
    "Include both customer and internal tasks",
    "Prioritize high-impact activities"
  ],
  "commonResponseTemplates": {
    "quotingProcess": "Template for explaining our quoting process",
    "shippingInquiry": "Template for shipping and delivery information",
    "productAvailability": "Template for product availability inquiries",
    "technicalSupport": "Template for technical support requests"
  },
  "customerServiceTips": [
    "List of 3-5 specific tips for serving this customer type",
    "Include industry-specific considerations",
    "Focus on relationship building"
  ],
  "estimatedCostSavings": {
    "timeInMinutes": 45,
    "description": "Explanation of how these suggestions save time and money"
  }
}
`;

    try {
      console.log(`[AICustomerComm] Generating suggestions for ${customerProfile.firstName} ${customerProfile.lastName} (${customerProfile.customerType})`);
      
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: this.generationConfig,
        safetySettings: this.safetySettings,
      });

      const responseText = result.response.text();
      if (!responseText) {
        console.error("[AICustomerComm] Empty response from AI");
        return null;
      }

      const cleanedJson = responseText.replace(/^```json\s*|```$/g, '').trim();
      let parsedResult: CustomerCommunicationSuggestion;
      
      try {
        parsedResult = JSON.parse(cleanedJson);
      } catch (parseError) {
        console.error("[AICustomerComm] Failed to parse JSON:", parseError);
        console.error("[AICustomerComm] Raw response:", cleanedJson.substring(0, 500));
        return null;
      }

      // Validate the structure
      if (!this.validateSuggestionStructure(parsedResult)) {
        console.error("[AICustomerComm] Invalid suggestion structure:", parsedResult);
        return null;
      }

      console.log(`[AICustomerComm] Successfully generated suggestions for ${customerProfile.firstName} ${customerProfile.lastName}`);
      return parsedResult;

    } catch (error: any) {
      console.error("[AICustomerComm] Error generating suggestions:", error.message || error);
      return null;
    }
  }

  private validateSuggestionStructure(suggestion: any): boolean {
    return !!(
      suggestion &&
      suggestion.welcomeEmail &&
      typeof suggestion.welcomeEmail.subject === 'string' &&
      typeof suggestion.welcomeEmail.body === 'string' &&
      typeof suggestion.welcomeEmail.personalizedGreeting === 'string' &&
      Array.isArray(suggestion.followUpActions) &&
      Array.isArray(suggestion.onboardingChecklist) &&
      suggestion.commonResponseTemplates &&
      typeof suggestion.commonResponseTemplates.quotingProcess === 'string' &&
      typeof suggestion.commonResponseTemplates.shippingInquiry === 'string' &&
      typeof suggestion.commonResponseTemplates.productAvailability === 'string' &&
      typeof suggestion.commonResponseTemplates.technicalSupport === 'string' &&
      Array.isArray(suggestion.customerServiceTips) &&
      suggestion.estimatedCostSavings &&
      typeof suggestion.estimatedCostSavings.timeInMinutes === 'number' &&
      typeof suggestion.estimatedCostSavings.description === 'string'
    );
  }

  public async generateQuickWelcomeMessage(
    customerName: string,
    customerType: 'retail' | 'wholesale' | 'distributor'
  ): Promise<string | null> {
    const prompt = `
Generate a brief, professional welcome message for a new Alliance Chemical customer.

Customer: ${customerName}
Type: ${customerType}

Create a 2-sentence welcome message that:
1. Welcomes them personally
2. Mentions one key benefit relevant to their customer type

Keep it under 50 words and professional but friendly.
Return ONLY the welcome message text, no quotes or formatting.
`;

    try {
      const result = await getModel().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 100,
        },
        safetySettings: this.safetySettings,
      });

      const responseText = result.response.text();
      return responseText?.trim() || null;

    } catch (error: any) {
      console.error("[AICustomerComm] Error generating quick welcome:", error.message || error);
      return null;
    }
  }
}

// Export singleton instance
export const aiCustomerCommunicationService = new AICustomerCommunicationService(); 