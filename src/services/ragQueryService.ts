import { db } from '@/db';
import { ragChunks } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq, and, inArray, sql, SQL } from 'drizzle-orm';
import OpenAI from 'openai';

// Initialize AI clients
const apiKey = process.env.GOOGLE_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
}
if (!openaiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
}

const genAI = new GoogleGenerativeAI(apiKey);
const openai = new OpenAI({ apiKey: openaiKey });
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

export interface RagFilters {
    source_type_in?: string[];
    customer_email_exact?: string;
    order_id_exact?: string;
    sku_in?: string[];
    tracking_number_exact?: string;
}

export interface RagQueryResult {
    supportingContexts: Array<{
        content: string;
        metadata: Record<string, any>;
        similarityScore: number;
    }>;
    llmSummary?: string;
    identifiedProductSku?: string;
}

export class RagQueryService {
    constructor() {
        console.log("[RagQueryService] Initialized");
    }

    /**
     * Query the RAG system with text and optional filters
     */
    async queryWithRag(
        queryText: string,
        customerContext?: { email?: string },
        filters?: RagFilters
    ): Promise<RagQueryResult> {
        try {
            // 1. Generate embedding for the query text
            const queryEmbeddingArray = await this.generateEmbedding(queryText);

            // Ensure the embedding is a flat array of numbers before stringifying
            if (!Array.isArray(queryEmbeddingArray) || !queryEmbeddingArray.every(n => typeof n === 'number' && isFinite(n))) {
                console.error('[RagQueryService] Generated embedding is invalid:', queryEmbeddingArray);
                throw new Error('Generated embedding is not a valid flat array of finite numbers.');
            }
            
            // Format the embedding array as a string literal for pgvector
            const queryEmbeddingStringForSql = `'[${queryEmbeddingArray.join(',')}]'`;

            // 2. Build the base select query
            const baseQuery = db.select({
                content: ragChunks.content,
                metadata: ragChunks.metadata,
                // Use sql.raw to pass the pre-formatted string literal for the vector
                similarity_score: sql<number>`1 - (${ragChunks.contentEmbedding} <=> ${sql.raw(queryEmbeddingStringForSql)}::vector)`
            })
            .from(ragChunks);

            // 3. Apply filters if provided
            const conditions: SQL[] = [];
            
            if (filters) {
                if (filters.source_type_in?.length) {
                    // Convert array to PostgreSQL array literal format
                    const pgArray = `{${filters.source_type_in.map(type => `"${type}"`).join(',')}}`;
                    conditions.push(sql`${ragChunks.metadata}->>'source_type' = ANY(${pgArray}::text[])`);
                }
                
                // Only apply customer email filter if no order ID is provided
                if (filters.customer_email_exact && !filters.order_id_exact) {
                    conditions.push(sql`${ragChunks.metadata}->>'customer_email' = ${filters.customer_email_exact}`);
                }
                
                if (filters.order_id_exact) {
                    // Search in both orderNumber and orderKey fields
                    conditions.push(sql`(${ragChunks.metadata}->>'orderNumber' = ${filters.order_id_exact} OR ${ragChunks.metadata}->>'orderKey' = ${filters.order_id_exact})`);
                }
                
                if (filters.sku_in?.length) {
                    // Assuming itemSkus is an array of strings in metadata
                    conditions.push(sql`${ragChunks.metadata}->'itemSkus' ?| ARRAY[${sql.join(filters.sku_in.map(sku => sql`${sku}`), sql`, `)}]`);
                }
                
                if (filters.tracking_number_exact) {
                    // Assuming trackingNumbers is an array of strings in metadata
                    conditions.push(sql`${ragChunks.metadata}->'trackingNumbers' ? ${filters.tracking_number_exact}`);
                }
            }

            // 4. Build the final query with all conditions
            const finalQuery = conditions.length > 0
                ? baseQuery.where(sql.join(conditions, sql` AND `))
                : baseQuery;

            // For debugging: Log the generated SQL
            const sqlStatement = finalQuery.toSQL();
            console.log('[RagQueryService] Generated SQL:', JSON.stringify(sqlStatement, null, 2));

            // 5. Execute the query with ordering and limit
            const results = await finalQuery
                .orderBy(sql`(1 - (${ragChunks.contentEmbedding} <=> ${sql.raw(queryEmbeddingStringForSql)}::vector)) DESC`)
                .limit(5);

            // 6. Process results
            if (results.length > 0) {
                const typedResults = results.map(r => ({
                    content: r.content as string,
                    metadata: r.metadata as Record<string, any>
                }));
                const llmResult = await this.processWithLLM(queryText, typedResults, customerContext);
                return {
                    supportingContexts: results.map(r => ({
                        content: r.content as string,
                        metadata: r.metadata as Record<string, any>,
                        similarityScore: r.similarity_score
                    })),
                    ...llmResult
                };
            }

            return {
                supportingContexts: []
            };
        } catch (error) {
            console.error("[RagQueryService] Error querying RAG system:", error);
            throw error; // Re-throw to be caught by the API route
        }
    }

    /**
     * Generate embedding for text using OpenAI's embedding model
     */
    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await openai.embeddings.create({
                model: "text-embedding-3-small", // Ensure this model outputs compatible dimensions (1536 for text-embedding-3-small)
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error("[RagQueryService] Error generating embedding:", error);
            throw error;
        }
    }

    /**
     * Process RAG results with LLM to extract key information
     */
    private async processWithLLM(
        originalQuery: string,
        ragResults: Array<{ content: string; metadata: Record<string, any> }>,
        customerContext?: { email?: string }
    ): Promise<{ llmSummary?: string; identifiedProductSku?: string }> {
        try {
            const prompt = `
                Analyze the following query and retrieved context to provide a helpful summary and extract key information.

                Original Query: "${originalQuery}"
                ${customerContext?.email ? `Customer Email: ${customerContext.email}` : ''}

                Retrieved Context:
                ${ragResults.map((r, i) => `
                Context ${i + 1}:
                Content: ${r.content}
                Metadata: ${JSON.stringify(r.metadata, null, 2)}
                `).join('\n')}

                Please provide:
                1. A concise summary of the most relevant information from the context that answers the query.
                2. If the query seems to be about a specific product, extract the most likely SKU from the metadata (if present).

                Respond ONLY in valid JSON format with no surrounding text or markdown:
                {
                    "summary": "your summary here",
                    "identifiedProductSku": "SKU if found, or null"
                }
            `;

            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 1024,
                    responseMimeType: "application/json", // Request JSON output
                }
            });
            
            const responseText = result.response.text();
            if (!responseText) {
                throw new Error("Empty response from LLM");
            }

            // The response should already be JSON if responseMimeType is honored
            const parsedResponse = JSON.parse(responseText);
            return {
                llmSummary: parsedResponse.summary,
                identifiedProductSku: parsedResponse.identifiedProductSku || undefined
            };
        } catch (error) {
            console.error("[RagQueryService] Error processing with LLM:", error);
            return {}; // Return empty or default on error
        }
    }
} 