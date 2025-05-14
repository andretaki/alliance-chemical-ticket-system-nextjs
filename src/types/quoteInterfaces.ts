import type { ExtractedEntityDetail } from './emailAnalysis';

export interface QuoteRequest {
  emailId: string;
  receivedDateTime: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  bodyText: string;
  extractedEntities: ExtractedEntityDetail[];
  customerGoal: string;
  specificQuestionsAsked?: string[];
  estimatedComplexityToResolve: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  automationPotentialScore: number; // 0.0 to 1.0
  keyInformationForResolution: string[];
  suggestedNextActions: string[];
  rawSummary: string;
}

export interface QuoteResponse {
  quoteId: string;
  requestEmailId: string;
  generatedDateTime: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  validUntil: string;
  totalAmount: number;
  currency: string;
  lineItems: QuoteLineItem[];
  shippingAddress?: Address;
  billingAddress?: Address;
  paymentTerms?: string;
  notes?: string;
  attachments?: string[]; // URLs to attached documents
}

export interface QuoteLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  specifications?: Record<string, string>;
}

export interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

// New interfaces for pricing service
export interface ProductDetails {
  id: string;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  availableUnits: string[];
  baseUnitPrice: number;
  currency: string;
  pageUrl?: string;
  priceTiers?: PriceTier[];
  isHazardous?: boolean;
  leadTimeDays?: number;
}

export interface PriceTier {
  minQuantity: number;
  unitPrice: number;
  description?: string;
}

export interface CustomerContact {
  id?: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  address?: Address;
  customerType?: 'retail' | 'wholesale' | 'distributor';
  specialPricing?: boolean;
}

export interface PriceQuoteInput {
  productId: string;
  quantity: number;
  unit: string;
  customer?: CustomerContact;
}

export interface PriceQuoteOutput {
  productId: string;
  productName: string;
  requestedQuantity: number;
  requestedUnit: string;
  quotedUnitPrice: number;
  quotedTotalPrice: number;
  currency: string;
  isStandardPrice: boolean;
  discountApplied?: string;
  notes: string[];
}

export interface ComplexQuoteTicketData {
  originalEmailId: string;
  customer: CustomerContact;
  emailSubject: string;
  reasonForComplexity: string;
  detectedProductsText: string[];
  emailBodySummary: string;
  extractedEntities: ExtractedEntityDetail[];
  customerGoal: string;
  specificQuestionsAsked?: string[];
  estimatedComplexityToResolve: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  automationPotentialScore: number;
  keyInformationForResolution: string[];
  suggestedNextActions: string[];
  rawSummary: string;
}

export interface SimpleQuoteEmailData {
  quoteId?: string;
  customer: CustomerContact;
  items: Array<{
    productName: string;
    sku?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    currency: string;
    pageUrl?: string;
  }>;
  subtotal: number;
  grandTotal: number;
  currency: string;
  shippingInfo?: string;
  validityMessage: string;
  nextStepsMessage: string;
} 