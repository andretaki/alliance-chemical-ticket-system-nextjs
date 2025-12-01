import type { ExtractedEntityDetail } from '@/types/quoteInterfaces';

export interface CustomerContact {
  name?: string;
  email: string;
  phone?: string;
  company?: string;
}

export interface ProductVariantData {
  id: string; // Internal DB ID
  variantIdShopify: string; // Shopify's GID for ProductVariant (e.g., "gid://shopify/ProductVariant/123")
  numericVariantIdShopify?: string; // Shopify's numeric ID for ProductVariant
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
  productIdShopify?: string; // Shopify's numeric ID for Product
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
  unitDescription: string; // e.g., 'gallon', 'drum', 'item'
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

// --- New Draft Order Interfaces ---

export interface DraftOrderAddressInput {
  address1: string;
  address2?: string;
  city: string;
  company?: string;
  country: string; // Full country name
  province?: string; // Full province/state name
  zip: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface DraftOrderCustomerInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  // Potentially existingShopifyCustomerId (GID) if known
}

export interface DraftOrderLineItemInput {
  numericVariantIdShopify: string; // Shopify's numeric ID for ProductVariant
  quantity: number;
  title?: string; // Optional: can be pre-filled for custom items
  price?: number; // Optional: for custom items or price overrides
  attributes?: Array<{ key: string; value: string }>; // Optional: for line item attributes
  customAttributes?: Array<{ key: string; value: string }>; // Optional: for custom attributes
  sellingPlanId?: string; // Optional: for subscription or special pricing plans
}

export interface AppDraftOrderInput {
  lineItems: DraftOrderLineItemInput[];
  customer?: DraftOrderCustomerInput;
  shopifyCustomerId?: string; // ID of existing Shopify customer if available
  shippingAddress?: DraftOrderAddressInput;
  billingAddress?: DraftOrderAddressInput;
  note?: string;
  email?: string; // Email to send Shopify draft order invoice to
  tags?: string[];
  quoteType?: 'material_only' | 'material_and_delivery';
  materialOnlyDisclaimer?: string;
  deliveryTerms?: string;
  customAttributes?: Array<{ key: string; value: string }>;
  shippingLine?: {
    title: string;
    price: number | string;
  };
}

export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

// This interface describes the INPUT to Shopify's DraftOrderInput.shippingLine
export interface ShopifyShippingLineInput {
  title: string;
  price: string; // Price is a Decimal (string) for input
}

export interface ShopifyShippingLine {
  title: string;
  price: string; // Scalar Money type from Shopify (e.g., "4.55")
  shippingRateHandle?: string;
}

export interface DraftOrderOutput {
  id: string; // Shopify GID
  legacyResourceId: string; // Shopify numeric ID
  name: string; // Draft order name (e.g., #D123)
  invoiceUrl?: string;
  status: string;
  totalPrice: number;
  currencyCode: string;
  subtotalPrice?: number;
  totalShippingPrice?: number;
  totalTax?: number;
  customer?: {
    id?: string; // Shopify Customer GID
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  lineItems: Array<{
    id: string; // Line item GID
    title: string;
    quantity: number;
    originalUnitPrice: number;
    variant?: {
      id: string; // Variant GID
      legacyResourceId: string; // Variant Numeric ID
      sku?: string;
      title?: string;
      image?: { url?: string; altText?: string };
    };
    product?: {
      id: string; // Product GID
      legacyResourceId: string; // Product Numeric ID
      title?: string;
    };
  }>;
  shippingLine?: {
    title: string;
    price: number;
  } | null;
  shippingAddress?: {
    firstName?: string; lastName?: string; address1?: string; address2?: string;
    city?: string; company?: string; phone?: string; zip?: string;
    provinceCode?: string; countryCode?: string;
  };
  appliedDiscount?: {
    title?: string;
    description?: string;
    value: number; // Assuming this is a numeric value after conversion
    valueType: string; // e.g., PERCENTAGE, FIXED_AMOUNT
  };
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  invoiceSentAt?: string;
  tags?: string[];
  customAttributes?: Array<{ key: string; value: string }>;
  email?: string;
  taxExempt?: boolean;
  billingAddress?: {
    firstName?: string; lastName?: string; address1?: string; address2?: string;
    city?: string; company?: string; phone?: string; zip?: string;
    provinceCode?: string; countryCode?: string;
  };
}

// Used for Shopify GraphQL response mapping
export interface ShopifyDraftOrderGQLResponse {
  id: string;
  legacyResourceId: string;
  name: string;
  invoiceUrl?: string;
  status: string; // DRAFT, OPEN, COMPLETED, CANCELLED
  totalPriceSet: { shopMoney: ShopifyMoney };
  totalShippingPriceSet?: { shopMoney: ShopifyMoney };
  subtotalPriceSet?: { shopMoney: ShopifyMoney };
  totalTaxSet?: { shopMoney: ShopifyMoney };
  customer?: { id: string; email?: string; firstName?: string; lastName?: string; phone?: string; defaultAddress?: { id?: string } };
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        originalUnitPriceSet: { shopMoney: ShopifyMoney };
        discountedUnitPriceSet?: { shopMoney: ShopifyMoney };
        totalDiscountSet?: { shopMoney: ShopifyMoney };
        taxLines?: Array<{ priceSet: { shopMoney: ShopifyMoney }; ratePercentage?: number; title?: string }>;
        variant?: { id: string; legacyResourceId: string; sku?: string; title?: string; image?: { url?: string; altText?: string } };
        product?: { id: string; legacyResourceId: string; title?: string };
      };
    }>;
  };
  shippingLine?: {
    title: string;
    price: string; // Scalar Money type
    shippingRateHandle?: string;
  } | null;
  shippingAddress?: {
    firstName?: string; lastName?: string; address1?: string; address2?: string;
    city?: string; company?: string; phone?: string; zip?: string;
    provinceCode?: string; countryCode?: string;
  };
  appliedDiscount?: {
    title?: string;
    description?: string;
    value: number | string; // Can be string for percentage
    valueType: string;
    amountSet: { shopMoney: ShopifyMoney };
  };
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  invoiceSentAt?: string;
  tags?: string[];
  customAttributes?: Array<{ key: string; value: string }>;
  email?: string;
  taxExempt?: boolean;
  currencyCode?: string;
  billingAddress?: {
    firstName?: string; lastName?: string; address1?: string; address2?: string;
    city?: string; company?: string; phone?: string; zip?: string;
    provinceCode?: string; countryCode?: string;
  };
} 