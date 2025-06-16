import { qboConfig } from './qboConfig';
import { shipstationConfig } from './shipstationConfig';

export interface AppConfig {
  shopify: {
    storeUrl: string;
    adminAccessToken: string;
    apiVersion: string;
  };
  qbo: typeof qboConfig;
  shipstation: typeof shipstationConfig;
  defaultCurrency: string;
  defaultLanguage: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  shipping: {
    defaultMethod: string;
    defaultDays: string;
    freeShippingThreshold: number; // USD
  };
  quotes: {
    defaultValidityDays: number;
    defaultProcessingTime: string;
  }
}

export const Config: AppConfig = {
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE || '',
    adminAccessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-04',
  },
  qbo: qboConfig,
  shipstation: shipstationConfig,
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  companyName: 'Alliance Chemical',
  companyEmail: 'sales@alliancechemical.com',
  companyPhone: '+1 (555) 123-4567',
  companyAddress: {
    street: '204 south edmond st',
    city: 'Taylor',
    state: 'TX',
    zip: '76574',
    country: 'USA'
  },
  shipping: {
    defaultMethod: 'Standard Ground',
    defaultDays: '1-4 business days',
    freeShippingThreshold: 500, // USD
  },
  quotes: {
    defaultValidityDays: 30,
    defaultProcessingTime: '1-2 business days',
  }
} as const; 