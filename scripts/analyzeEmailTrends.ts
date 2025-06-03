// scripts/analyzeEmailTrends.ts
// AI-Driven Email Trend Analysis for Actionable Insights
// Fetches emails and performs an in-depth discovery analysis on a sample of
// external emails using Google's Gemini 2.5 Flash Preview model.
// The goal is to produce structured, actionable data to inform the design of
// human workflows, targeted automations, or specialized AI agents.

import 'dotenv/config';
import { subDays, formatISO, format } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import type { Message } from '@microsoft/microsoft-graph-types';

// Microsoft Graph Service
import * as graphService from '../src/lib/graphService.js';

// Microsoft Graph Client - we need to create our own instance since it's not exported
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';

// Google Generative AI SDK
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerationConfig,
  type GenerativeModel,
} from '@google/generative-ai';

// --- Configuration Constants ---
const SCRIPT_VERSION = "1.3.2_FlashActionableData";
const DAYS_TO_ANALYZE: number = parseInt(process.env.DAYS_TO_ANALYZE || '30', 10);
const MAX_EMAILS_TO_FETCH_PER_GRAPH_CALL: number = 50;
const MAX_TOTAL_EMAILS_TO_PROCESS: number = parseInt(process.env.MAX_TOTAL_EMAILS_TO_PROCESS || '2000', 10); // For ~1000+ external
const API_CONCURRENCY_LIMIT: number = parseInt(process.env.API_CONCURRENCY_LIMIT || '5', 10);
const DELAY_BETWEEN_GRAPH_API_CALLS_MS: number = 500;
const DELAY_BETWEEN_GEMINI_API_CALLS_MS: number = 800;
const INTERNAL_EMAIL_DOMAIN: string = process.env.INTERNAL_EMAIL_DOMAIN || 'yourcompany.com'; // SET THIS
const SHARED_MAILBOX_TO_ANALYZE: string | undefined = process.env.SHARED_MAILBOX_ADDRESS;
const DEEP_DISCOVERY_SAMPLE_SIZE: number = parseInt(process.env.DEEP_DISCOVERY_SAMPLE_SIZE || '100', 10);
const MAX_EXAMPLES_PER_DISCOVERED_TOPIC: number = 5;
const GEMINI_MODEL_NAME: string = process.env.GEMINI_MODEL_NAME || "models/gemini-2.5-flash-preview-05-20"; // Explicitly using Flash
const REPORTS_DIRECTORY = path.join(process.cwd(), 'reports', 'emailTrendsActionableData');

// Load Microsoft Graph configuration
const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
const userEmailForAnalysis = process.env.SHARED_MAILBOX_ADDRESS || '';

if (!tenantId || !clientId || !clientSecret || !userEmailForAnalysis) {
  throw new Error('Microsoft Graph configuration is incomplete. Check your .env file.');
}

// Create credential and graph client for this script
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
const graphClient = Client.init({
  authProvider: async (done) => {
    try {
      const token = await credential.getToken(['https://graph.microsoft.com/.default']);
      done(null, token.token);
    } catch (error) {
      done(error, null);
    }
  }
});

// --- Interfaces (same as v1.3.0 - ensures detailed extraction) ---
interface ExtractedEntityDetail {
  type: string; value: string; context?: string;
  attributes?: Record<string, string | number | boolean>;
}
interface DiscoveredEmailInsights {
  primaryTopic: string; secondaryTopic?: string; tertiaryTopic?: string;
  customerGoal: string; specificQuestionsAsked?: string[];
  problemReported?: { description: string; associatedProduct?: string; urgencyToCustomer: 'low' | 'medium' | 'high' | 'critical'; };
  extractedEntities: ExtractedEntityDetail[];
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
  error?: string;
}
interface AnalysisReportData {
  scriptVersion: string; analysisPeriod: { startDate: string; endDate: string };
  totalEmailsFetched: number; internalEmailsCount: number; externalEmailsCount: number;
  deepDiscoverySampleAnalyzedCount: number; aiErrorsDuringDiscovery: number;
  averageBodyLengthForDiscoverySample: number;
  emailVolumeStats: { byDay: Record<string, number>; byWeekday: Record<string, number>; byHourUTC: Record<number, number>; };
  primaryTopics: Record<string, number>; secondaryTopics: Record<string, number>; tertiaryTopics: Record<string, number>;
  customerGoals: Record<string, number>; sentiments: Record<string, number>; specificTones: Record<string, number>;
  complexitiesToResolve: Record<string, number>; rootCauseCategories: Record<string, number>;
  customerJourneyStages: Record<string, number>; automationPotentialDistribution: Record<string, number>;
  entityTypeCounts: Record<string, number>; // Counts by ExtractedEntityDetail.type
  examplesByPrimaryTopic: Record<string, Array<{ emailSubject: string; emailId?: string; insights: DiscoveredEmailInsights; }>>;
  newCategoryProposals?: Record<string, number>;
}

// --- Helper Functions ---
function stripHtml(html: string | null | undefined): string { /* ... same ... */ if (!html) return ''; return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim(); }
function delay(ms: number): Promise<void> { /* ... same ... */ return new Promise(resolve => setTimeout(resolve, ms)); }
function shuffleArray<T>(array: T[]): T[] { /* ... same ... */ const r = [...array]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

function initializeGoogleAI(): GenerativeModel | null { /* ... same ... */
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("CRITICAL: GOOGLE_API_KEY not set."); return null; }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
    console.log(`Google AI Model (${GEMINI_MODEL_NAME}) initialized.`);
    return model;
  } catch (e: any) { console.error(`Failed to init Google AI (${GEMINI_MODEL_NAME}): ${e.message}`); return null; }
}
const geminiModel = initializeGoogleAI();

// --- AI-Powered Deep Discovery Function (Focus on Primary Topic Generalization) ---
async function performEnhancedDiscoveryAnalysis(
  emailSubject: string,
  emailBodyText: string,
  emailId: string,
  reportData: AnalysisReportData
): Promise<DiscoveredEmailInsights> {
  if (!geminiModel) {
    return {
      primaryTopic: "AI_Discovery_Disabled_NoModel", customerGoal: "N/A",
      extractedEntities: [], overallSentiment: null, estimatedComplexityToResolve: 'medium',
      automationPotentialScore: 0, keyInformationForResolution: [], suggestedNextActions: [],
      rawSummary: "Gemini model not available.", error: "Gemini model not initialized."
    };
  }

  const definedPrimaryTopics = [
    // Sales & Orders (Core Business)
    "Order Placement",
    "Order Status Inquiry",
    "Order Modification/Cancellation",
    "Quote Request",
    "Price Inquiry",
    "Product Availability Check",
    
    // Customer Service & Support
    "Technical Support",
    "Product Specification Request",
    "Documentation Request (SDS/COA)",
    "Shipping/Delivery Issue",
    "Billing/Invoice Issue",
    "Return/Refund Request",
    
    // Account Management
    "Account Setup/Modification",
    "Credit Application",
    "Payment Processing",
    "Account Inquiry",
    
    // Automated Notifications
    "Order Confirmation",
    "Payment Confirmation",
    "Shipping Update",
    "Abandoned Cart Alert",
    "Account Security Alert",
    
    // Business Development
    "Vendor/Supplier Outreach",
    "Partnership Inquiry",
    "Service Solicitation",
    "Product Promotion",
    
    // Other
    "General Inquiry",
    "Complaint/Feedback",
    "Regulatory Compliance",
    "Other: New Category" // Special category for AI to propose new categories
  ];

  // The prompt is CRITICAL for getting good primaryTopic values.
  const prompt = `
    Analyze the following email with depth and precision. Your main goal is to CLASSIFY it into a predefined BROAD PRIMARY TOPIC, then extract detailed supporting information for further analysis and action.

    Email Subject:
    "${emailSubject}"

    Email Body (plain text, first ~2500 characters):
    "${emailBodyText.substring(0, 2500)}${emailBodyText.length > 2500 ? '...' : ''}"

    Provide your analysis as a JSON object strictly adhering to the following TypeScript interface:
    interface DiscoveredEmailInsights {
      primaryTopic: string;
        // **MANDATORY**: Choose the single most fitting primaryTopic from this EXACT list:
        //   ${definedPrimaryTopics.map(t => `"${t}"`).join(', \n//   ')}
        //   - For automated notifications, append the specific type (e.g., "Order Confirmation: #12345")
        //   - If the email doesn't fit any category well, use "Other: New Category" and:
        //     a) In secondaryTopic, propose a new category name that would better fit this type of email
        //     b) In tertiaryTopic, explain why this new category is needed
        //   - The 'primaryTopic' MUST be a GENERAL category, not a specific summary of this email

      secondaryTopic?: string;
        // Specific sub-theme or action WITHIN the primaryTopic
        // Examples:
        // - For "Order Status Inquiry": "Tracking Request", "Delivery Delay", "Missing Package"
        // - For "Quote Request": "Bulk Order", "Regular Supply", "One-time Purchase"
        // - For "Documentation Request": "SDS Needed", "COA Required", "ISO Certificate"
        // - For "Other: New Category": "Proposed Category Name: [Your Suggestion]"
        // This should be more specific to the email's content than primaryTopic

      tertiaryTopic?: string;
        // Most specific details (e.g., "Order #12345", "Product: Sodium Hypochlorite", "Amount: $1,234.56")
        // Include order numbers, specific products, monetary values, etc.
        // For "Other: New Category", explain why this new category is needed

      customerGoal: string; // Concisely, what does the CUSTOMER want to achieve? (e.g., "Get tracking for order 123", "Refund for broken item").

      // ... (rest of the DiscoveredEmailInsights interface fields as in v1.3.0/v1.3.1:
      // specificQuestionsAsked, problemReported, extractedEntities, overallSentiment, specificTones,
      // estimatedComplexityToResolve, potentialRootCauseCategory, customerJourneyStageHint,
      // multiIntentDetected, automationPotentialScore, keyInformationForResolution,
      // suggestedNextActions, rawSummary) ...
      // Make sure to define these fields fully in your actual prompt if you copy this snippet.
      // For brevity here, I'm focusing on the topic hierarchy.

      specificQuestionsAsked?: string[];
      problemReported?: { description: string; associatedProduct?: string; urgencyToCustomer: 'low' | 'medium' | 'high' | 'critical'; };
      extractedEntities: Array<{ type: string; value: string; context?: string; attributes?: Record<string, string | number | boolean> }>;
      overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
      specificTones?: ('frustrated' | 'confused' | 'appreciative' | 'demanding' | 'urgent' | 'inquisitive')[];
      estimatedComplexityToResolve: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
      potentialRootCauseCategory?: string;
      customerJourneyStageHint?: 'pre_sales_inquiry' | 'quote_negotiation' | 'order_placement' | 'payment_confirmation' | 'order_fulfillment_update' | 'delivery_coordination' | 'post_delivery_issue' | 'product_support_request' | 'return_or_refund_process' | 'billing_dispute' | 'account_update' | 'feedback_submission' | 'vendor_outreach_to_us' | 'automated_transactional_notice' | 'other_operational';
      multiIntentDetected?: boolean;
      automationPotentialScore: number; // 0.0 to 1.0
      keyInformationForResolution: string[];
      suggestedNextActions: string[];
      rawSummary: string; // THIS IS for the specific summary of THIS email.
    }

    Key Instructions for 'primaryTopic':
    1.  You MUST select one value from the provided list for 'primaryTopic'.
    2.  If the best fit is "Automated System Notification", ensure you append the specific type like ": Order Confirmation", ": Abandoned Cart", ": Shipping Update".
    3.  If using "Other Customer Request (Specify)", the 'secondaryTopic' field should clearly state the nature of this 'other' request.
    4.  'primaryTopic' is for BROAD categorization. 'rawSummary' is for the unique summary of THIS email. Do not confuse them.

    Be extremely thorough in 'extractedEntities'. For 'customerGoal', focus on the customer's desired outcome.
    Ensure the JSON is perfectly formed. Do not add comments outside the JSON.
    `;

  const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.15, // Very low temperature to force adherence to the primaryTopic list
    maxOutputTokens: 4096, // Allow for detailed entity extraction etc.
    topP: 0.8,
  };
  const safetySettings = [ /* ... same safety settings ... */
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
    if (!responseText) { throw new Error("Empty AI response."); }
    let parsedResult = JSON.parse(responseText.trim()) as DiscoveredEmailInsights;

    // Validation & Normalization of AI Output
    parsedResult.primaryTopic = parsedResult.primaryTopic || "Error: AI_Topic_Missing";
    // Check if the AI chose a valid primary topic or a valid "Automated System Notification: .*"
    const isValidPrimaryTopic = definedPrimaryTopics.some(definedTopic => {
        if (definedTopic === "Automated System Notification") {
            return parsedResult.primaryTopic.startsWith("Automated System Notification:");
        }
        return parsedResult.primaryTopic === definedTopic;
    });

    if (!isValidPrimaryTopic && !parsedResult.primaryTopic.startsWith("Error:")) {
        console.warn(`[DiscoveryAI-${emailId}] AI primaryTopic ('${parsedResult.primaryTopic}') not in defined list. Review prompt/output. Defaulting to 'Uncategorized/Spam'.`);
        // Optionally, force into a default or log for review.
        // For now, let's be strict to see how well the AI follows. If it struggles, we might map common deviations here.
        // Or, for this pass, let's keep what it gave and see the report.
        // parsedResult.primaryTopic = "Uncategorized/Spam"; // Example of forcing
    }


    parsedResult.customerGoal = parsedResult.customerGoal || "Goal not identified";
    parsedResult.extractedEntities = Array.isArray(parsedResult.extractedEntities) ? parsedResult.extractedEntities : [];
    parsedResult.overallSentiment = parsedResult.overallSentiment || null;
    parsedResult.estimatedComplexityToResolve = parsedResult.estimatedComplexityToResolve || 'medium';
    parsedResult.automationPotentialScore = typeof parsedResult.automationPotentialScore === 'number' && !isNaN(parsedResult.automationPotentialScore)
        ? Math.max(0, Math.min(1, parsedResult.automationPotentialScore)) : 0.0;
    parsedResult.keyInformationForResolution = Array.isArray(parsedResult.keyInformationForResolution) ? parsedResult.keyInformationForResolution : [];
    parsedResult.suggestedNextActions = Array.isArray(parsedResult.suggestedNextActions) ? parsedResult.suggestedNextActions : [];
    parsedResult.rawSummary = parsedResult.rawSummary || "Summary not generated.";
    // Ensure optional array fields are at least empty arrays if null/undefined for consistency
    parsedResult.secondaryTopic = parsedResult.secondaryTopic || undefined;
    parsedResult.tertiaryTopic = parsedResult.tertiaryTopic || undefined;
    parsedResult.specificQuestionsAsked = parsedResult.specificQuestionsAsked || [];
    parsedResult.problemReported = parsedResult.problemReported || undefined;
    parsedResult.specificTones = parsedResult.specificTones || [];
    parsedResult.potentialRootCauseCategory = parsedResult.potentialRootCauseCategory || undefined;
    parsedResult.customerJourneyStageHint = parsedResult.customerJourneyStageHint || undefined;

    // Add this after the AI response parsing but before returning the result
    if (parsedResult.primaryTopic === "Other: New Category") {
      console.log(`[DiscoveryAI-${emailId}] New category proposed: ${parsedResult.secondaryTopic}`);
      console.log(`[DiscoveryAI-${emailId}] Rationale: ${parsedResult.tertiaryTopic}`);
      
      // Track new category proposals in the report data
      if (!reportData.newCategoryProposals) {
        reportData.newCategoryProposals = {};
      }
      const proposedCategory = parsedResult.secondaryTopic?.replace("Proposed Category Name: ", "") || "Unnamed Category";
      reportData.newCategoryProposals[proposedCategory] = (reportData.newCategoryProposals[proposedCategory] || 0) + 1;
    }

    return parsedResult;

  } catch (error: any) {
    console.error(`[DiscoveryAI-${emailId}] Gemini API/Parse Error (prompt v1.3.2): ${error.message}. Response snippet: ${error.response?.text()?.substring(0,200) || 'N/A'}`);
    return { /* ... same error structure ... */
      primaryTopic: "Error: AI_Enhanced_API_Failure", customerGoal: "N/A", extractedEntities: [],
      overallSentiment: null, estimatedComplexityToResolve: 'medium', automationPotentialScore: 0.0,
      keyInformationForResolution: [], suggestedNextActions: [`Investigate API error for ${emailId}`],
      rawSummary: `Gemini API call failed. Error: ${error.message}`, error: `Gemini API/Parse Error: ${error.message}`
    };
  }
}

// --- Main Orchestration Function ---
async function analyzeEmailTrends(): Promise<void> {
  console.log(`Starting Email Trend Analysis Script v${SCRIPT_VERSION}`);
  const analysisStartTime = new Date();
  const reportDateRange = {
    startDate: subDays(analysisStartTime, DAYS_TO_ANALYZE),
    endDate: analysisStartTime,
  };

  if (!geminiModel) {
    console.error("CRITICAL: Gemini model not initialized. Aborting.");
    return;
  }

  const reportData: AnalysisReportData = { /* ... same initialization ... */
    scriptVersion: SCRIPT_VERSION,
    analysisPeriod: { startDate: formatISO(reportDateRange.startDate), endDate: formatISO(reportDateRange.endDate) },
    totalEmailsFetched: 0, internalEmailsCount: 0, externalEmailsCount: 0,
    deepDiscoverySampleAnalyzedCount: 0, aiErrorsDuringDiscovery: 0,
    averageBodyLengthForDiscoverySample: 0,
    emailVolumeStats: { byDay: {}, byWeekday: {}, byHourUTC: {} },
    primaryTopics: {}, secondaryTopics: {}, tertiaryTopics: {}, customerGoals: {},
    sentiments: {}, specificTones: {}, complexitiesToResolve: {}, rootCauseCategories: {},
    customerJourneyStages: {}, automationPotentialDistribution: {}, entityTypeCounts: {},
    examplesByPrimaryTopic: {},
    newCategoryProposals: {},
  };
  for (let h = 0; h < 24; h++) reportData.emailVolumeStats.byHourUTC[h] = 0;
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  weekdays.forEach(day => reportData.emailVolumeStats.byWeekday[day] = 0);


  // Step 1: Fetch Emails (same as v1.3.1)
  console.log(`Fetching up to ${MAX_TOTAL_EMAILS_TO_PROCESS} emails from ${formatISO(reportDateRange.startDate)} to ${formatISO(reportDateRange.endDate)}.`);
  let allFetchedEmails: Message[] = [];
  let graphApiNextLink: string | undefined;
  const mailUserToQuery = SHARED_MAILBOX_TO_ANALYZE || userEmailForAnalysis;
  let fetchAttempts = 0;
  const MAX_FETCH_ATTEMPTS = 3;

  do {
    const filterQuery = `receivedDateTime ge ${reportDateRange.startDate.toISOString()} and receivedDateTime le ${reportDateRange.endDate.toISOString()}`;
    const graphUrl = graphApiNextLink ||
      `/users/${mailUserToQuery}/mailFolders/inbox/messages` +
      `?$filter=${encodeURIComponent(filterQuery)}&$top=${MAX_EMAILS_TO_FETCH_PER_GRAPH_CALL}&$orderby=receivedDateTime desc` +
      `&$select=id,receivedDateTime,subject,sender,body,bodyPreview,conversationId`;

    try {
      const response: any = await graphClient.api(graphUrl).get();
      const batch: Message[] = response.value || [];
      graphApiNextLink = response['@odata.nextLink'];
      fetchAttempts = 0;

      if (batch.length === 0 && !graphApiNextLink) break;
      allFetchedEmails.push(...batch);
      reportData.totalEmailsFetched = allFetchedEmails.length;
      console.log(`Fetched ${batch.length} emails. Total: ${reportData.totalEmailsFetched}. Next: ${!!graphApiNextLink}`);

      if (reportData.totalEmailsFetched >= MAX_TOTAL_EMAILS_TO_PROCESS) {
        console.log(`Reached MAX_TOTAL_EMAILS_TO_PROCESS of ${MAX_TOTAL_EMAILS_TO_PROCESS}.`);
        break;
      }
      if (graphApiNextLink) await delay(DELAY_BETWEEN_GRAPH_API_CALLS_MS);

    } catch (error: any) {
      fetchAttempts++;
      console.error(`Error fetching emails (Graph Attempt ${fetchAttempts}/${MAX_FETCH_ATTEMPTS}): ${error.message}`);
      if (error.statusCode === 401 || error.statusCode === 403) { console.error("Graph API Auth Error. Halting."); break; }
      if (fetchAttempts >= MAX_FETCH_ATTEMPTS) { console.error("Max fetch attempts. Halting."); break; }
      await delay(DELAY_BETWEEN_GRAPH_API_CALLS_MS * (fetchAttempts + 1));
    }
  } while (graphApiNextLink);

  if (allFetchedEmails.length === 0) { console.log("No emails fetched. Exiting."); return; }


  // Step 2: Segregate Internal/External & Populate Volume Stats (same as v1.3.1)
  const externalEmails: Message[] = [];
  allFetchedEmails.forEach(email => {
    const senderAddress = email.sender?.emailAddress?.address || '';
     if (senderAddress.toLowerCase().endsWith('@alliancechemical.com')) {
      reportData.internalEmailsCount++;
      return;
    }
    if (INTERNAL_EMAIL_DOMAIN && senderAddress.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN.toLowerCase()}`)) {
      reportData.internalEmailsCount++;
    } else {
      reportData.externalEmailsCount++;
      externalEmails.push(email);
    }
    if (email.receivedDateTime) {
      try {
        const dt = new Date(email.receivedDateTime);
        reportData.emailVolumeStats.byDay[format(dt, 'yyyy-MM-dd')] = (reportData.emailVolumeStats.byDay[format(dt, 'yyyy-MM-dd')] || 0) + 1;
        reportData.emailVolumeStats.byWeekday[weekdays[dt.getDay()]]++;
        reportData.emailVolumeStats.byHourUTC[dt.getUTCHours()]++;
      } catch (e) { /* ignore */ }
    }
  });
  console.log(`Processed ${reportData.totalEmailsFetched} emails: ${reportData.externalEmailsCount} external, ${reportData.internalEmailsCount} internal.`);

  const actualSampleSize = Math.min(externalEmails.length, DEEP_DISCOVERY_SAMPLE_SIZE);
  if (actualSampleSize === 0 && externalEmails.length > 0) {
      console.warn(`Sample size is 0, but ${externalEmails.length} external emails exist. Check DEEP_DISCOVERY_SAMPLE_SIZE.`);
  } else if (externalEmails.length < DEEP_DISCOVERY_SAMPLE_SIZE && externalEmails.length > 0) {
    console.warn(`External emails (${externalEmails.length}) < target sample (${DEEP_DISCOVERY_SAMPLE_SIZE}). Analyzing all ${actualSampleSize}.`);
  }

  // Step 3: Enhanced Deep Discovery Analysis on Sample
  // Normalization for primaryTopic will happen *inside* this loop after AI response.
  const discoverySample = shuffleArray(externalEmails).slice(0, actualSampleSize);
  if (discoverySample.length > 0) {
    console.log(`Starting enhanced deep discovery for ${discoverySample.length} external emails... (Model: ${GEMINI_MODEL_NAME})`);
    const discoveryLimiter = pLimit(API_CONCURRENCY_LIMIT);
    let totalBodyLengthInSample = 0;

    const discoveryTasks = discoverySample.map(email =>
      discoveryLimiter(async () => {
        await delay(DELAY_BETWEEN_GEMINI_API_CALLS_MS);
        const subject = email.subject ?? 'No Subject';
        const bodyText = stripHtml(email.body?.content ?? email.bodyPreview);
        const emailId = email.id || `rand-${Math.random().toString(16).slice(2)}`;

        const insights = await performEnhancedDiscoveryAnalysis(subject, bodyText, emailId, reportData);
        reportData.deepDiscoverySampleAnalyzedCount++;
        totalBodyLengthInSample += bodyText.length;

        // ** Code-based Normalization for primaryTopic (especially for Automated System Notifications) **
        if (insights && !insights.error && insights.primaryTopic === "Automated System Notification") {
            const lowerBody = bodyText.toLowerCase();
            const lowerSubject = subject.toLowerCase();
            if (lowerSubject.includes("abandoned cart") || lowerBody.includes("still in your cart") || lowerBody.includes("left something in your cart")) {
                insights.primaryTopic = "Automated System Notification: Abandoned Cart";
            } else if (lowerSubject.includes("order confirmation") || lowerSubject.includes("your order #") || lowerSubject.includes("order confirmed")) {
                insights.primaryTopic = "Automated System Notification: Order Confirmation";
            } else if (lowerSubject.includes("payment received") || lowerSubject.includes("payment successful")) {
                insights.primaryTopic = "Automated System Notification: Payment Received";
            } else if (lowerSubject.includes("shipping update") || lowerSubject.includes("shipped") || lowerSubject.includes("out for delivery")) {
                insights.primaryTopic = "Automated System Notification: Shipping Update";
            } else if (lowerSubject.includes("refund initiated") || lowerSubject.includes("refund processed")) {
                insights.primaryTopic = "Automated System Notification: Refund Processed";
            } else if (lowerSubject.includes("welcome to") || lowerSubject.includes("verify your email")) {
                insights.primaryTopic = "Automated System Notification: Account/Welcome";
            }
            // Add more specific rules for other automated notifications if needed
        }


        if (insights.error) {
          reportData.aiErrorsDuringDiscovery++;
          const errorKey = insights.primaryTopic || "Unknown_AI_Error";
          reportData.primaryTopics[errorKey] = (reportData.primaryTopics[errorKey] || 0) + 1;
        } else {
          const primaryTopicKey = insights.primaryTopic || "Undefined_Primary_Topic";
          reportData.primaryTopics[primaryTopicKey] = (reportData.primaryTopics[primaryTopicKey] || 0) + 1;

          // Aggregation for other fields from insights (same as v1.3.1)
          if(insights.secondaryTopic) reportData.secondaryTopics[insights.secondaryTopic] = (reportData.secondaryTopics[insights.secondaryTopic] || 0) + 1;
          if(insights.tertiaryTopic) reportData.tertiaryTopics[insights.tertiaryTopic] = (reportData.tertiaryTopics[insights.tertiaryTopic] || 0) + 1;
          if(insights.customerGoal) reportData.customerGoals[insights.customerGoal] = (reportData.customerGoals[insights.customerGoal] || 0) + 1;
          if(insights.overallSentiment) reportData.sentiments[insights.overallSentiment] = (reportData.sentiments[insights.overallSentiment] || 0) + 1;
          insights.specificTones?.forEach(tone => reportData.specificTones[tone] = (reportData.specificTones[tone] || 0) + 1);
          if(insights.estimatedComplexityToResolve) reportData.complexitiesToResolve[insights.estimatedComplexityToResolve] = (reportData.complexitiesToResolve[insights.estimatedComplexityToResolve] || 0) + 1;
          if(insights.potentialRootCauseCategory) reportData.rootCauseCategories[insights.potentialRootCauseCategory] = (reportData.rootCauseCategories[insights.potentialRootCauseCategory] || 0) + 1;
          if(insights.customerJourneyStageHint) reportData.customerJourneyStages[insights.customerJourneyStageHint] = (reportData.customerJourneyStages[insights.customerJourneyStageHint] || 0) + 1;

          const automationScoreBin = Math.max(0, Math.min(1, Math.round(insights.automationPotentialScore * 10) / 10));
          const automationBinKey = `Score: ${automationScoreBin.toFixed(1)}`;
          reportData.automationPotentialDistribution[automationBinKey] = (reportData.automationPotentialDistribution[automationBinKey] || 0) + 1;

          insights.extractedEntities.forEach(entity => {
            if(entity && entity.type) reportData.entityTypeCounts[entity.type] = (reportData.entityTypeCounts[entity.type] || 0) + 1;
          });
        }

        const topicKeyForExample = insights.primaryTopic || "ErrorTopic";
        if (!reportData.examplesByPrimaryTopic[topicKeyForExample]) reportData.examplesByPrimaryTopic[topicKeyForExample] = [];
        if (reportData.examplesByPrimaryTopic[topicKeyForExample].length < MAX_EXAMPLES_PER_DISCOVERED_TOPIC) {
          reportData.examplesByPrimaryTopic[topicKeyForExample].push({ emailSubject: subject, emailId: email.id, insights });
        }
        if (reportData.deepDiscoverySampleAnalyzedCount % Math.max(1, Math.floor(actualSampleSize / 10)) === 0) {
          console.log(`  Enhanced Discovery: ${reportData.deepDiscoverySampleAnalyzedCount} / ${actualSampleSize} emails processed...`);
        }
      })
    );
    await Promise.all(discoveryTasks);
    reportData.averageBodyLengthForDiscoverySample = reportData.deepDiscoverySampleAnalyzedCount > 0
      ? totalBodyLengthInSample / reportData.deepDiscoverySampleAnalyzedCount : 0;
    console.log("Enhanced deep discovery analysis complete.");
  } else {
    console.log("No external emails available for deep discovery sample.");
  }

  // Step 4: Generate and Save Reports (same as v1.3.1)
  console.log("Generating enhanced analysis reports...");
  if (!fs.existsSync(REPORTS_DIRECTORY)) fs.mkdirSync(REPORTS_DIRECTORY, { recursive: true });

  const timestamp = format(analysisStartTime, 'yyyyMMdd-HHmmss');
  const htmlReportContent = generateEnhancedHtmlReport(reportData);
  const htmlReportPath = path.join(REPORTS_DIRECTORY, `EmailDeepDive-Report-${timestamp}.html`);
  fs.writeFileSync(htmlReportPath, htmlReportContent, 'utf8');
  console.log(`HTML report saved to: ${htmlReportPath}`);

  const jsonReportPath = path.join(REPORTS_DIRECTORY, `EmailDeepDive-Data-${timestamp}.json`);
  fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2), 'utf8');
  console.log(`JSON data saved to: ${jsonReportPath}`);

  console.log(`Email Trend Analysis Script v${SCRIPT_VERSION} finished successfully.`);
}

// --- HTML Report Generation Function (generateEnhancedHtmlReport - same as v1.3.0) ---
// This should still be largely compatible.
function generateEnhancedHtmlReport(data: AnalysisReportData): string {
  const {
    scriptVersion, analysisPeriod, totalEmailsFetched, internalEmailsCount, externalEmailsCount,
    deepDiscoverySampleAnalyzedCount, aiErrorsDuringDiscovery, averageBodyLengthForDiscoverySample,
    emailVolumeStats, primaryTopics, secondaryTopics, tertiaryTopics, customerGoals, sentiments,
    specificTones, complexitiesToResolve, rootCauseCategories, customerJourneyStages,
    automationPotentialDistribution, entityTypeCounts, examplesByPrimaryTopic
  } = data;

  const formatPercentage = (count: number, total: number): string =>
    total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0.0%';

  const renderKeyValueTable = (title: string, record: Record<string, number>, totalForPercentage: number = deepDiscoverySampleAnalyzedCount): string => {
    if (!record || Object.keys(record).length === 0) return `<p>No data for ${title}.</p>`;
    const sortedEntries = Object.entries(record).sort(([, a], [, b]) => b - a);
    let rowsHtml = '';
    for (const [key, count] of sortedEntries) {
      rowsHtml += `<tr><td>${stripHtml(key)}</td><td>${count}</td><td>${formatPercentage(count, totalForPercentage)}</td></tr>`;
    }
    return `<div class="report-table-container"><h4>${title}</h4><table class="data-table"><thead><tr><th>Item</th><th>Count</th><th>% of Sample</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  };

   const renderEntitySummaryTable = (title: string, entityData: Record<string, number>): string => {
    if (!entityData || Object.keys(entityData).length === 0) return `<p>No data for ${title}.</p>`;
    const sortedEntries = Object.entries(entityData).sort(([,a],[,b]) => b-a);
    let rowsHtml = sortedEntries.map(([type, count]) => `<tr><td>${stripHtml(type)}</td><td>${count}</td></tr>`).join('');
     return `<div class="report-table-container"><h4>${title}</h4><table class="data-table"><thead><tr><th>Entity Type</th><th>Total Mentions</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  }

  // The HTML structure remains the same as version 1.3.1
  // It will display the data based on the AnalysisReportData structure
  return `
<!DOCTYPE html><html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Email Deep Dive Analysis Report v${scriptVersion}</title>
    <style>
        body{font-family:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:0;background-color:#f0f2f5;color:#333;line-height:1.6}
        .container{max-width:1600px;margin:20px auto;padding:30px;background-color:#fff;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.1)}
        header{text-align:center;margin-bottom:35px;padding-bottom:25px;border-bottom:3px solid #3498db}
        header h1{color:#2c3e50;margin:0 0 12px 0;font-size:2.4em}header p{color:#555;font-size:0.95em;margin:6px 0}
        .section{margin-bottom:40px;padding:25px;background-color:#f9fafb;border:1px solid #dee2e6;border-radius:8px}
        .section h2{color:#34495e;margin-top:0;padding-bottom:12px;border-bottom:2px solid #dde2e6;font-size:1.8em}
        .grid-container{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:25px;margin-top:25px}
        .card{background-color:#fff;padding:20px;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,0.07);border-left:5px solid #3498db}
        .card-title{font-size:1.15em;font-weight:600;color:#34495e;margin-bottom:10px}
        .card-value{font-size:2.2em;font-weight:700;color:#3498db}
        .report-table-container{margin-top:20px;overflow-x:auto}
        .data-table{width:100%;border-collapse:collapse;margin-top:12px;background-color:#fff}
        .data-table th,.data-table td{border:1px solid:#d0d7de;padding:10px 14px;text-align:left;font-size:0.9em;word-break:break-word}
        .data-table th{background-color:#f1f5f9;font-weight:600;color:#1e293b}
        .data-table tr:nth-child(even){background-color:#f8fafc}.data-table tr:hover{background-color:#eef2f7}
        .examples-section .card{margin-bottom:25px;border-left-color:#2ecc71}
        .example-subject{font-weight:bold;margin-bottom:6px;color:#2c3e50}
        .example-details{font-size:0.88em;color:#555;margin-bottom:10px}
        .example-ai-output{background-color:#f0f8ff;border:1px solid #cce4ff;padding:12px;margin-top:10px;border-radius:5px;white-space:pre-wrap;font-family:Consolas,'Courier New',monospace;font-size:0.88em;max-height:300px;overflow-y:auto}
        .chart-container{margin-top:25px;padding:20px;background-color:#fff;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,0.07)}
        .tabs{display:flex;flex-wrap:wrap;margin-bottom:-1px;border-bottom:1px solid #d0d7de}
        .tab{padding:12px 18px;cursor:pointer;background-color:#f1f5f9;border:1px solid #d0d7de;border-bottom:none;margin-right:6px;border-radius:5px 5px 0 0;font-weight:500;color:#34495e}
        .tab.active{background-color:#fff;border-bottom:1px solid #fff;position:relative;top:1px;color:#3498db}
        .tab-content{display:none;padding:25px;border:1px solid #d0d7de;border-top:none;border-radius:0 0 5px 5px}
        .tab-content.active{display:block}
        details{margin-bottom:12px;background-color:#fff;border:1px solid #d0d7de;border-radius:4px}
        summary{cursor:pointer;font-weight:bold;padding:10px;background-color:#f1f5f9;border-radius:4px 4px 0 0}
        details div{padding:10px}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body><div class="container">
    <header><h1>AI Email Deep Dive Analysis Report</h1>
        <p>Analysis Period: ${analysisPeriod.startDate} to ${analysisPeriod.endDate}</p>
        <p>Report Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss zzz')} | Script Version: ${scriptVersion}</p>
    </header>
    <section class="section"><h2>Overall Statistics</h2><div class="grid-container">
        <div class="card"><div class="card-title">Total Emails Fetched</div><div class="card-value">${totalEmailsFetched}</div></div>
        <div class="card"><div class="card-title">External Emails</div><div class="card-value">${externalEmailsCount}</div></div>
        <div class="card"><div class="card-title">Internal Emails</div><div class="card-value">${internalEmailsCount}</div></div>
        <div class="card"><div class="card-title">Deep Dive Sample Size</div><div class="card-value">${deepDiscoverySampleAnalyzedCount}</div></div>
        <div class="card"><div class="card-title">AI Errors (Deep Dive)</div><div class="card-value" style="color:${aiErrorsDuringDiscovery > 0 ? '#e74c3c' : '#2ecc71'};">${aiErrorsDuringDiscovery}</div></div>
        <div class="card"><div class="card-title">Avg. Body Length (Sample)</div><div class="card-value">${averageBodyLengthForDiscoverySample.toFixed(0)} chars</div></div>
    </div></section>
    <section class="section"><h2>Enhanced Deep Discovery Insights (Sample of ${deepDiscoverySampleAnalyzedCount} emails)</h2>
        <p>Analyzed by Gemini (${GEMINI_MODEL_NAME}). All percentages are relative to the deep dive sample size.</p>
        <div class="grid-container">
            ${renderKeyValueTable("Discovered Primary Topics", primaryTopics)}
            ${renderKeyValueTable("Discovered Secondary Topics", secondaryTopics)}
            ${renderKeyValueTable("Discovered Tertiary Topics", tertiaryTopics)}
            ${renderKeyValueTable("Customer Goals", customerGoals)}
            ${renderKeyValueTable("Overall Sentiments", sentiments)}
            ${renderKeyValueTable("Specific Tones", specificTones)}
            ${renderKeyValueTable("Estimated Complexities to Resolve", complexitiesToResolve)}
            ${renderKeyValueTable("Potential Root Cause Categories", rootCauseCategories)}
            ${renderKeyValueTable("Customer Journey Stages", customerJourneyStages)}
            ${renderKeyValueTable("Automation Potential Scores (Binned)", automationPotentialDistribution)}
        </div>
        ${renderEntitySummaryTable("Mentioned Entity Types (from Deep Dive)", entityTypeCounts)}
    </section>
    <section class="section examples-section"><h2>Examples by Discovered Primary Topic</h2><div class="tabs">
        ${Object.keys(examplesByPrimaryTopic).sort((a,b) => (examplesByPrimaryTopic[b]?.length || 0) - (examplesByPrimaryTopic[a]?.length || 0)).map((topic, index) => `
            <div class="tab ${index === 0 ? 'active' : ''}" onclick="openTab(event, 'topic-${index}')">${stripHtml(topic)} (${examplesByPrimaryTopic[topic].length})</div>`).join('')}
    </div>
    ${Object.entries(examplesByPrimaryTopic).sort(([,a],[,b]) => (b?.length || 0) - (a?.length || 0)).map(([topic, examples], index) => `
        <div id="topic-${index}" class="tab-content ${index === 0 ? 'active' : ''}"><h3>Topic: ${stripHtml(topic)}</h3>
        ${examples.map(ex => `<div class="card">
            <p class="example-subject">Subject: ${stripHtml(ex.emailSubject)}</p>
            <p class="example-details">Email ID: ${ex.emailId || 'N/A'}</p>
            <details><summary>View Full AI Insights & Email Summary</summary>
                <div><strong>AI Summary:</strong> ${stripHtml(ex.insights.rawSummary)}</div>
                <div class="example-ai-output"><strong>Full AI Insights:</strong><pre>${JSON.stringify(ex.insights, null, 2)}</pre></div>
            </details></div>`).join('')}
        </div>`).join('')}
    </section>
    <section class="section"><h2>Email Volume Analysis (All Fetched Emails)</h2><div class="grid-container">
        <div class="chart-container"><h4>Emails per Day</h4><canvas id="dailyVolumeChart"></canvas></div>
        <div class="chart-container"><h4>Emails by Weekday</h4><canvas id="weekdayChart"></canvas></div>
    </div><div class="chart-container" style="margin-top:20px;"><h4>Emails by Hour (UTC)</h4><canvas id="hourlyChart"></canvas></div></section>
</div>
<script>
    function openTab(evt, tabName){let i,tabcontent,tablinks;tabcontent=document.getElementsByClassName("tab-content");for(i=0;i<tabcontent.length;i++){tabcontent[i].style.display="none";tabcontent[i].classList.remove("active")}tablinks=document.getElementsByClassName("tab");for(i=0;i<tablinks.length;i++){tablinks[i].classList.remove("active")}const targetElement=document.getElementById(tabName);if(targetElement){targetElement.style.display="block";targetElement.classList.add("active")}if(evt&&evt.currentTarget){evt.currentTarget.classList.add("active")}}
    document.addEventListener('DOMContentLoaded',()=>{const chartConfig=(type,data,label,labelsOrUseDataKeys=!0,dataObject=null)=>{const chartData=dataObject?Object.values(dataObject):data;const chartLabels=labelsOrUseDataKeys===!0&&dataObject?Object.keys(dataObject):(Array.isArray(labelsOrUseDataKeys)?labelsOrUseDataKeys:[]);const bgColors=['#3498db','#2ecc71','#f1c40f','#e74c3c','#9b59b6','#34495e','#1abc9c','#d35400','#8e44ad','#2c3e50', '#c0392b', '#16a085'];return{type:type,data:{labels:chartLabels,datasets:[{label:label,data:chartData,borderWidth:1,backgroundColor:(type==='pie'||type==='doughnut')?bgColors.slice(0, chartLabels.length):'#3498db'}]},options:{responsive:!0,maintainAspectRatio:!0,scales:(type!=='pie'&&type!=='doughnut')?{y:{beginAtZero:!0}}:{},plugins:{legend:{position:'top'}}}};
    const dailyVolumeData=${JSON.stringify(emailVolumeStats.byDay)};if(document.getElementById('dailyVolumeChart')&&Object.keys(dailyVolumeData).length>0){new Chart(document.getElementById('dailyVolumeChart'),chartConfig('bar',null,'Emails per Day',!0,dailyVolumeData))}
    const weekdayData=${JSON.stringify(emailVolumeStats.byWeekday)};if(document.getElementById('weekdayChart')&&Object.values(weekdayData).some(v=>v>0)){const weekdayOrder=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];const sortedWeekdayDataObject={};weekdayOrder.forEach(day=>{if(weekdayData[day]!==undefined)sortedWeekdayDataObject[day]=weekdayData[day]});new Chart(document.getElementById('weekdayChart'),chartConfig('pie',null,'Emails by Weekday',!0,sortedWeekdayDataObject))}
    const hourlyData=${JSON.stringify(emailVolumeStats.byHourUTC)};if(document.getElementById('hourlyChart')&&Object.values(hourlyData).some(v=>v>0)){const hourlyLabels=Object.keys(hourlyData).map(h=>\`\${String(h).padStart(2,'0')}:00 UTC\`);new Chart(document.getElementById('hourlyChart'),chartConfig('line',Object.values(hourlyData),'Emails by Hour (UTC)',hourlyLabels))}
    const firstTab=document.querySelector('.tab');if(firstTab)firstTab.click();else{const firstTabContent=document.querySelector('.tab-content');if(firstTabContent)firstTabContent.classList.add('active')}});
</script>
</body></html>`;
}

// --- Script Execution ---
analyzeEmailTrends().catch(error => {
  console.error("Unhandled error in script execution:", error);
  process.exit(1);
});