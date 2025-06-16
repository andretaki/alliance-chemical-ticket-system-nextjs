declare module 'intuit-oauth' {
    class OAuthClient {
        constructor(config: any);
        authorizeUri(options: any): string;
        createToken(url: string): Promise<any>;
        setToken(token: any): void;
        refresh(): Promise<any>;
        getToken(): any;
    }
    export = OAuthClient;
}

declare module 'node-quickbooks' {
    class QuickBooks {
        constructor(
            consumerKey: string,
            consumerSecret: string,
            token: string,
            tokenSecret: boolean,
            realmId: string,
            useSandbox: boolean,
            debug: boolean,
            minorversion: number,
            oauthversion: '2.0',
            refreshToken: string
        );
    }
    export = QuickBooks;
} 