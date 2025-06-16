export const shipstationConfig = {
  apiKey: process.env.SHIPSTATION_API_KEY || '',
  apiSecret: process.env.SHIPSTATION_API_SECRET || '',
  baseUrl: 'https://ssapi.shipstation.com/',
};

export const isShipstationConfigured = (): boolean => {
    return !!shipstationConfig.apiKey && !!shipstationConfig.apiSecret;
} 