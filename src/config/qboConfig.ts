if (!process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'QBO credentials are not set in environment variables. QuickBooks integration will be disabled.'
    );
  }
}

export const qboConfig = {
  clientId: process.env.QBO_CLIENT_ID || '',
  clientSecret: process.env.QBO_CLIENT_SECRET || '',
  redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3000/api/qbo/auth/callback',
  environment: (process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production',
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
    return !!qboConfig.clientId && !!qboConfig.clientSecret;
} 