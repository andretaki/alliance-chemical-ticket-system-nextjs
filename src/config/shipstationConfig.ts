import { env, integrations } from '@/lib/env';

export const shipstationConfig = {
  apiKey: env.SHIPSTATION_API_KEY || '',
  apiSecret: env.SHIPSTATION_API_SECRET || '',
  baseUrl: 'https://ssapi.shipstation.com/',
};

export const isShipstationConfigured = (): boolean => {
    return integrations.shipstation;
} 