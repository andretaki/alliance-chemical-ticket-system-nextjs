import type { ExtractedEntityDetail } from '@/types/emailAnalysis';

export interface CustomerContact {
  name?: string;
  email: string;
  phone?: string;
  company?: string;
}

export interface ProductVariantData {
  id: string;
  variantIdShopify?: string;
  agentProductId: string;
  sku: string;
  variantTitle: string;
  displayName?: string;
  price: number;
  currency: string;
  inventoryQuantity?: number;
}

export interface ParentProductData {
  id: string;
  productIdShopify?: string;
  name: string;
  handleShopify?: string;
  pageUrl?: string;
  primaryImageUrl?: string;
  description?: string;
}

export interface PriceQuoteResult {
  productName: string;
  variantSku: string;
  requestedQuantity: number;
  quotedUnitPrice: number;
  quotedTotalPrice: number;
  currency: string;
  isStandardPrice: boolean;
  discountApplied?: string;
  notes?: string[];
}

export interface SimpleQuoteEmailDataItem {
  productName: string;
  sku: string;
  quantity: number;
  unitDescription: string;
  unitPrice: number;
  totalPrice: number;
  pageUrl?: string;
}

export interface SimpleQuoteEmailData {
  customer: CustomerContact;
  items: SimpleQuoteEmailDataItem[];
  subtotal: number;
  shippingInfo?: string;
  grandTotal: number;
  currency: string;
  quoteReference?: string;
  validityMessage: string;
  nextStepsMessage: string;
  originalEmailIdForThreading?: string;
}

export interface ComplexQuoteTicketData {
  originalEmailId: string;
  customer: CustomerContact;
  emailSubject: string;
  emailBodySummary: string;
  detectedRawProductRequests: string[];
  detectedRawQuantityRequests: string[];
  allExtractedEntities: ExtractedEntityDetail[];
  reasonForComplexity: string;
  isBulkOrder?: boolean;
  aiSentiment?: string | null;
  aiEstimatedComplexity?: string;
} 