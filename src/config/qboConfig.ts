import { env, integrations } from '@/lib/env';

if (!integrations.quickbooks && env.NODE_ENV === 'production') {
  console.warn(
    'QBO credentials are not set in environment variables. QuickBooks integration will be disabled.'
  );
}

export const qboConfig = {
  clientId: env.QBO_CLIENT_ID || '',
  clientSecret: env.QBO_CLIENT_SECRET || '',
  redirectUri: env.QBO_REDIRECT_URI || 'http://localhost:3000/api/qbo/auth/callback',
  environment: env.QBO_ENVIRONMENT,
  scopes: [
    'com.intuit.quickbooks.accounting', // All accounting scopes
    'openid',
    'profile',
    'email',
    'phone',
    'address'
  ],
};

export const isQboConfigured = (): boolean => {
    return integrations.quickbooks;
} 