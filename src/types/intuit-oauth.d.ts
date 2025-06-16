declare module 'intuit-oauth' {
  class OAuthClient {
    constructor(config: {
      clientId: string;
      clientSecret: string;
      environment: 'sandbox' | 'production';
      redirectUri: string;
    });
    authorizeUri(options: { scope: string[]; state?: string }): string;
    createToken(uri: string): Promise<{
      getJson: () => any;
    }>;
    refresh(): Promise<{
      getJson: () => any;
    }>;
    setToken(token: any): void;
    getToken(): any;
    isAccessTokenValid(): boolean;
    validateIdToken(): Promise<any>;
    makeApiCall(options: any): Promise<any>;
    static scopes: {
      Accounting: string;
      OpenId: string;
      Profile: string;
      Email: string;
      Phone: string;
      Address: string;
    };
    refreshUsingToken(refreshToken: string): Promise<any>;
    revoke(params?: any): Promise<any>;
    getUserInfo(): Promise<any>;
  }
  export default OAuthClient;
} 