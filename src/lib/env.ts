/**
 * Environment Variable Validation & Type-Safe Access
 * Validates all required env vars at startup, fails fast if missing
 */

import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth (optional since auth is bypassed for now)
  BETTER_AUTH_SECRET: z.string().min(32).default('development-secret-key-at-least-32-chars'),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // Microsoft Graph
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_GRAPH_TENANT_ID: z.string().optional(),
  MICROSOFT_GRAPH_CLIENT_ID: z.string().optional(),
  MICROSOFT_GRAPH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_GRAPH_WEBHOOK_SECRET: z.string().optional(),
  SHARED_MAILBOX_ADDRESS: z.string().email().optional(),

  // AI Services
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(), // Alternative Gemini key
  GEMINI_API_KEY: z.string().optional(), // Another alternative
  GROQ_API_KEY: z.string().optional(),
  GEMINI_MODEL_NAME: z.string().default('models/gemini-2.5-flash-preview-05-20'),
  RAG_EMBEDDING_PROVIDER: z.enum(['openai', 'gemini', 'mock']).optional(),
  RAG_EMBEDDING_MODEL: z.string().optional(),
  RAG_RERANK_ENABLED: z.string().optional(),

  // Shopify
  SHOPIFY_STORE_URL: z.string().url().optional(),
  SHOPIFY_STORE: z.string().optional(), // Legacy alias
  SHOPIFY_STORE_DOMAIN: z.string().optional(), // Another alias
  NEXT_PUBLIC_SHOPIFY_STORE_URL: z.string().optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_ACCESS_TOKEN: z.string().optional(), // Legacy alias
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().default('2024-04'),

  // ShipStation
  SHIPSTATION_API_KEY: z.string().optional(),
  SHIPSTATION_API_SECRET: z.string().optional(),

  // Amazon SP-API
  AMAZON_SP_CLIENT_ID: z.string().optional(),
  AMAZON_SP_CLIENT_SECRET: z.string().optional(),
  AMAZON_SP_REFRESH_TOKEN: z.string().optional(),
  AMAZON_SP_MARKETPLACE_ID: z.string().default('ATVPDKIKX0DER'), // US marketplace
  AMAZON_SP_SELLER_ID: z.string().optional(),

  // QuickBooks
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  QBO_REDIRECT_URI: z.string().url().optional(),
  QBO_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  // Email
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL: z.string().email().optional(),
  SLA_ALERT_EMAIL: z.string().email().optional(),
  ERROR_ALERT_THRESHOLD: z.string().default('3'),
  CC_EMAIL_ADDRESS: z.string().email().default('sales@alliancechemical.com'),
  SALES_TEAM_EMAIL: z.string().email().default('sales@alliancechemical.com'),

  // Credit Application
  CREDIT_APPLICATION_URL: z.string().url().optional(),
  CREDIT_APP_API_KEY: z.string().optional(),

  // Telephony (3CX)
  TELEPHONY_WEBHOOK_SECRET: z.string().optional(),

  // Vercel
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // App Config
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  DEBUG_SQL: z.string().optional(),
  INTERNAL_EMAIL_DOMAIN: z.string().default('alliancechemical.com'),
  SHOPIFY_AUTO_CREATE_CUSTOMERS: z.string().default('true'),

  // Security - REQUIRED in production
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment variables
 * Throws at module load time if validation fails
 */
export const env = (() => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .filter(e => e.message === 'Required')
        .map(e => e.path.join('.'));

      console.error('❌ Invalid environment variables:');
      console.error(error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n'));

      if (missing.length > 0) {
        console.error('\n💡 Missing required variables:', missing.join(', '));
      }
    }
    throw new Error('Environment validation failed');
  }
})();

/**
 * Check if a specific integration is configured
 */
export const integrations = {
  shopify: !!(env.SHOPIFY_STORE_URL || env.SHOPIFY_STORE) && !!(env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.SHOPIFY_ACCESS_TOKEN),
  quickbooks: !!env.QBO_CLIENT_ID && !!env.QBO_CLIENT_SECRET,
  email: !!env.RESEND_API_KEY,
  openai: !!env.OPENAI_API_KEY,
  google: !!(env.GOOGLE_API_KEY || env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY),
  microsoft: !!env.MICROSOFT_CLIENT_ID && !!env.MICROSOFT_CLIENT_SECRET,
  shipstation: !!env.SHIPSTATION_API_KEY && !!env.SHIPSTATION_API_SECRET,
  microsoftGraph: !!env.MICROSOFT_GRAPH_CLIENT_ID && !!env.MICROSOFT_GRAPH_CLIENT_SECRET,
  amazonSpApi: !!env.AMAZON_SP_CLIENT_ID && !!env.AMAZON_SP_CLIENT_SECRET && !!env.AMAZON_SP_REFRESH_TOKEN,
} as const;

/**
 * Helper to get Google/Gemini API key (checks multiple env var names)
 */
export function getGoogleApiKey(): string | undefined {
  return env.GOOGLE_API_KEY || env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
}

/**
 * Helper to get Shopify store URL (checks legacy alias)
 */
export function getShopifyStoreUrl(): string {
  return env.SHOPIFY_STORE_URL || env.SHOPIFY_STORE || '';
}

/**
 * Helper to get Shopify access token (checks legacy alias)
 */
export function getShopifyAccessToken(): string {
  return env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.SHOPIFY_ACCESS_TOKEN || '';
}
