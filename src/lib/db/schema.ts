import { pgTable, serial, varchar, text, timestamp, integer, decimal, boolean, jsonb, bigint } from 'drizzle-orm/pg-core';

// Product tables
export const agentProducts = pgTable('agent_products', {
  id: serial('id').primaryKey(),
  productIdShopify: bigint('product_id_shopify', { mode: 'number' }).unique(),
  name: varchar('name', { length: 512 }).notNull(),
  handleShopify: varchar('handle_shopify', { length: 512 }),
  description: text('description'),
  primaryImageUrl: text('primary_image_url'),
  pageUrl: text('page_url'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const agentProductVariants = pgTable('agent_product_variants', {
  id: serial('id').primaryKey(),
  agentProductId: integer('agent_product_id').notNull().references(() => agentProducts.id, { onDelete: 'cascade' }),
  variantIdShopify: bigint('variant_id_shopify', { mode: 'number' }).unique(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  variantTitle: varchar('variant_title', { length: 512 }).notNull(),
  displayName: varchar('display_name', { length: 512 }),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  inventoryQuantity: integer('inventory_quantity'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Optional: Price tier table for volume discounts
export const priceTiers = pgTable('price_tiers', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id').notNull().references(() => agentProductVariants.id, { onDelete: 'cascade' }),
  minQuantity: integer('min_quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  description: varchar('description', { length: 512 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}); 