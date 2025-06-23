import { z } from 'zod';

// Schema for a single line item
export const lineItemSchema = z.object({
  numericVariantIdShopify: z.string().min(1, 'Product selection is required.'),
  quantity: z.number().min(1, 'Quantity must be at least 1.'),
  productDisplay: z.string().optional(),
  unitPrice: z.number().optional(),
  currencyCode: z.string().optional(),
});

// Schema for a shipping/billing address
export const addressSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  address1: z.string().min(1, 'Address is required.'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required.'),
  province: z.string().min(1, 'State/Province is required.'),
  country: z.string().min(1, 'Country is required.'),
  zip: z.string().min(1, 'ZIP/Postal code is required.'),
  company: z.string().optional(),
  phone: z.string().optional(),
});

// Main schema for the entire quote form
export const quoteFormSchema = z.object({
  customer: z.object({
    email: z.string().email('Invalid email address.').min(1, 'Email is required.'),
    firstName: z.string().min(1, 'First name is required.'),
    lastName: z.string().min(1, 'Last name is required.'),
    phone: z.string().optional(),
    company: z.string().optional(),
    shopifyCustomerId: z.string().optional(),
    source: z.string().optional(),
  }),
  lineItems: z.array(lineItemSchema).min(1, 'At least one product is required.'),
  shippingAddress: addressSchema,
  useSameAddressForBilling: z.boolean().default(true),
  billingAddress: addressSchema.optional(),
  quoteType: z.enum(['material_only', 'material_and_delivery']).default('material_and_delivery'),
  materialOnlyDisclaimer: z.string().optional(),
  deliveryTerms: z.string().optional(),
  note: z.string().optional(),
  sendShopifyInvoice: z.boolean().default(true),
  shippingLine: z.object({
    title: z.string(),
    price: z.string(),
  }).optional(),
});

// Type inference for the form data
export type QuoteFormData = z.infer<typeof quoteFormSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type Address = z.infer<typeof addressSchema>;

// Helper for creating a new line item
export const createNewLineItem = (): LineItem => ({
  numericVariantIdShopify: '',
  quantity: 1,
});

// Default values for the form
export const defaultValues: QuoteFormData = {
  customer: {
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    company: '',
  },
  lineItems: [createNewLineItem()],
  shippingAddress: {
    firstName: '',
    lastName: '',
    address1: '',
    city: '',
    country: 'United States',
    zip: '',
    province: '',
    company: '',
    phone: '',
  },
  useSameAddressForBilling: true,
  quoteType: 'material_and_delivery',
  sendShopifyInvoice: true,
  note: '',
};
