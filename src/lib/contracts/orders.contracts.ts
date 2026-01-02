import { z } from 'zod';

/**
 * Orders Contracts
 *
 * Shared types for multi-provider order data.
 */

// Provider enum (aligned with DB)
const ORDER_PROVIDERS = [
  'shopify',
  'qbo',
  'amazon',
  'manual',
  'self_reported',
  'klaviyo',
  'shipstation',
] as const;
export const OrderProviderSchema = z.enum(ORDER_PROVIDERS);
export type OrderProvider = z.infer<typeof OrderProviderSchema>;

// Order status enum (aligned with DB)
const ORDER_STATUSES = [
  'open',
  'closed',
  'cancelled',
  'fulfilled',
  'partial',
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Financial status enum (aligned with DB)
const FINANCIAL_STATUSES = [
  'paid',
  'partially_paid',
  'unpaid',
  'void',
] as const;
export const FinancialStatusSchema = z.enum(FINANCIAL_STATUSES);
export type FinancialStatus = z.infer<typeof FinancialStatusSchema>;

/**
 * OrderItem - A single line item in an order
 */
export const OrderItemSchema = z.object({
  id: z.number().optional(),
  sku: z.string().nullable(),
  title: z.string().nullable(),
  quantity: z.number(),
  price: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Order - A unified order from any provider
 */
export const OrderSchema = z.object({
  id: z.number(),
  provider: OrderProviderSchema,
  externalId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  status: OrderStatusSchema,
  financialStatus: FinancialStatusSchema,
  total: z.string().nullable(),
  currency: z.string().nullable(),
  placedAt: z.string().nullable(),
  dueAt: z.string().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  lateFlag: z.boolean().optional(),
  items: z.array(OrderItemSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type Order = z.infer<typeof OrderSchema>;

/**
 * Shipment - Tracking info for an order
 */
export const ShipmentSchema = z.object({
  id: z.number(),
  provider: z.string(),
  orderId: z.number().nullable(),
  trackingNumber: z.string().nullable(),
  carrierCode: z.string().nullable(),
  status: z.string().nullable(),
  shipDate: z.coerce.date().nullable(),
  estimatedDeliveryDate: z.coerce.date().nullable(),
  actualDeliveryDate: z.coerce.date().nullable(),
});

export type Shipment = z.infer<typeof ShipmentSchema>;

/**
 * FrequentProduct - Aggregated product purchase data
 */
export const FrequentProductSchema = z.object({
  sku: z.string().nullable(),
  title: z.string().nullable(),
  quantity: z.number(),
  lastOrderedAt: z.string().nullable().optional(),
});

export type FrequentProduct = z.infer<typeof FrequentProductSchema>;

/**
 * OrdersByProvider - Grouped order stats
 */
export const OrdersByProviderSchema = z.record(
  z.object({
    count: z.number(),
    total: z.string(),
    orders: z.array(z.object({
      id: z.number(),
      orderNumber: z.string().nullable(),
      total: z.string().nullable(),
      status: OrderStatusSchema,
      placedAt: z.string().nullable(),
    })),
  })
);

export type OrdersByProvider = z.infer<typeof OrdersByProviderSchema>;
