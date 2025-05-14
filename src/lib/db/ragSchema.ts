import { pgTable, serial, integer, text, jsonb, varchar, timestamp, boolean, vector, bigint } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

// Explicitly define the 'rag_system' schema
export const ragSystemSchema = pgSchema('rag_system');

// Define tables within that schema
export const ragDocuments = ragSystemSchema.table('documents', {
    id: serial('id').primaryKey(),
    sourceIdentifier: varchar('source_identifier', { length: 512 }).notNull(),
    sourceType: varchar('source_type', { length: 50 }).notNull(),
    name: varchar('name', { length: 512 }).notNull(),
    type: varchar('type', { length: 100 }),
    size: integer('size'),
    numPages: integer('num_pages'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    lastModifiedAt: timestamp('last_modified_at', { withTimezone: true }).defaultNow().notNull(),
    processingStatus: varchar('processing_status', { length: 50 }).default('pending').notNull(),
    extractedMetadata: jsonb('extracted_metadata'),
    contentHash: varchar('content_hash', { length: 64 }),
    accessControlTags: jsonb('access_control_tags'),
    sourceUrl: text('source_url'),
    documentVersion: integer('document_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Forward declare the chunks table
let ragChunks: ReturnType<typeof ragSystemSchema.table>;

// Create the chunks table with self-reference
ragChunks = ragSystemSchema.table('chunks', {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').notNull().references(() => ragDocuments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    chunkHash: varchar('chunk_hash', { length: 64 }),
    metadata: jsonb('metadata').notNull(),
    chunkType: text('chunk_type').default('text').notNull(),
    wordCount: integer('word_count'),
    charCount: integer('char_count'),
    parentChunkId: integer('parent_chunk_id').references(() => ragChunks.id, { onDelete: 'set null' }),
    confidenceScore: integer('confidence_score').default(70),
    chunkLastModified: timestamp('chunk_last_modified', { withTimezone: true }).defaultNow().notNull(),
    chunkVersion: integer('chunk_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    contentEmbedding: vector('content_embedding', { dimensions: 1536 }).notNull(),
});

export { ragChunks };

export const shopifySyncProductsInRagSchema = ragSystemSchema.table('shopify_sync_products', {
    id: serial('id').primaryKey(),
    productId: bigint('product_id', { mode: 'number' }).unique().notNull(),
    title: text('title'),
    description: text('description'),
    variants: jsonb('variants'),
    syncDate: timestamp('sync_date', { mode: 'date' }).notNull(),
}); 