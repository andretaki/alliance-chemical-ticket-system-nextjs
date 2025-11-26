/**
 * Environment Variable Validation & Type-Safe Access
 * Validates all required env vars at startup, fails fast if missing
 */

import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),

  // Microsoft Graph
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),

  // AI Services
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // Shopify
  SHOPIFY_STORE_URL: z.string().url().optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().optional(),

  // QuickBooks
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Vercel
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // App Config
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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
  shopify: !!env.SHOPIFY_STORE_URL && !!env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  quickbooks: !!env.QBO_CLIENT_ID && !!env.QBO_CLIENT_SECRET,
  email: !!env.RESEND_API_KEY,
  openai: !!env.OPENAI_API_KEY,
  google: !!env.GOOGLE_API_KEY,
  microsoft: !!env.MICROSOFT_CLIENT_ID && !!env.MICROSOFT_CLIENT_SECRET,
} as const;
