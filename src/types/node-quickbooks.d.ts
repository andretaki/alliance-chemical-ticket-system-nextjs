declare module 'node-quickbooks' {
  class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      token: string,
      tokenSecret: boolean, // This is 'false' for OAuth 2.0
      realmId: string,
      useSandbox: boolean,
      debug: boolean,
      minorversion: string | number | null,
      oauthversion: '2.0',
      refreshToken: string
    );

    // This is a generic signature to allow any method to be called
    [key: string]: any;
  }
  export default QuickBooks;
} 