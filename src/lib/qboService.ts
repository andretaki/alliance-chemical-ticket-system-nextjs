import QuickBooks from 'node-quickbooks';
import OAuthClient from 'intuit-oauth';
import { qboConfig } from '@/config/qboConfig';
import { getToken, setToken, QboToken } from './qboTokenStore';
import { db, qboCustomerSnapshots } from '@/lib/db';

let oauthClient: OAuthClient | null = null;

const getOAuthClient = (): OAuthClient => {
    if (oauthClient) return oauthClient;
    oauthClient = new OAuthClient({
        clientId: qboConfig.clientId,
        clientSecret: qboConfig.clientSecret,
        environment: qboConfig.environment,
        redirectUri: qboConfig.redirectUri,
    });
    return oauthClient;
};

export const getAuthUri = (): string => {
    const oauthClient = getOAuthClient();
    return oauthClient.authorizeUri({
        scope: qboConfig.scopes,
        state: 'qbo-integration-request', // Can be used to prevent CSRF
    });
};

export const handleCallback = async (url: string): Promise<void> => {
    const oauthClient = getOAuthClient();
    try {
        const authResponse = await oauthClient.createToken(url);
        const token = authResponse.getJson();
        await setToken({ ...token, realmId: oauthClient.getToken().realmId });
    } catch (e) {
        console.error('The error message is :', e);
        throw new Error('Could not handle QBO callback.');
    }
};

export const refreshTokens = async (): Promise<QboToken> => {
    const oauthClient = getOAuthClient();
    try {
        const token = await getToken();
        if(!token) throw new Error('No token to refresh.');
        
        oauthClient.setToken(token as any); // Set old token
        const authResponse = await oauthClient.refresh();
        const newToken = authResponse.getJson();
        await setToken({ ...newToken, realmId: oauthClient.getToken().realmId });
        return (await getToken())!;
    } catch (e) {
        console.error('The error message is :', e);
        throw new Error('Could not refresh QBO tokens.');
    }
};

export const getQboClient = async (): Promise<QuickBooks> => {
    let token = await getToken();
    if (!token) {
        throw new Error('QBO not connected. Please connect to QuickBooks.');
    }

    const oauthClient = getOAuthClient();
    oauthClient.setToken(token as any);

    // Check if token is expired (or close to expiring)
    const tokenCreateTime = token.createdAt || 0;
    const expiresIn = (token.expires_in || 3600) * 1000; // in ms
    const buffer = 5 * 60 * 1000; // 5 minute buffer

    if (Date.now() - tokenCreateTime > expiresIn - buffer) {
        console.log('QBO token expired or nearing expiration, refreshing...');
        try {
            token = await refreshTokens();
        } catch (e) {
            console.error('Failed to refresh QBO token:', e);
            throw new Error('Your QuickBooks connection has expired. Please reconnect.');
        }
    }

    return new QuickBooks(
        qboConfig.clientId,
        qboConfig.clientSecret,
        token.access_token,
        false, // no token secret for OAuth 2.0
        token.realmId,
        qboConfig.environment === 'sandbox', // useSandbox
        false, // enable debugging
        4, // minorversion
        '2.0', // oauthversion
        token.refresh_token
    );
};

export interface QboCustomerBalance {
    qboCustomerId: string;
    balance: number;
    currency: string;
    terms?: string | null;
    lastInvoiceDate?: string | null;
    lastPaymentDate?: string | null;
}

const runQboQuery = async <T = any>(query: string): Promise<T> => {
    const client = await getQboClient();
    return new Promise<T>((resolve, reject) => {
        (client as any).query(query, (err: any, data: T) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(data);
        });
    });
};

/**
 * Fetch QBO customers with balance/terms for AR snapshotting.
 * Note: QuickBooks does not expose last invoice/payment dates directly on customer,
 * so those fields may be null in the snapshot.
 */
export const fetchQboCustomersWithBalances = async (): Promise<QboCustomerBalance[]> => {
    const query = "SELECT Id, DisplayName, Balance, CurrencyRef, SalesTermRef, MetaData.LastUpdatedTime FROM Customer";
    const response = await runQboQuery<any>(query);
    const customers = response?.QueryResponse?.Customer || [];

    return customers
        .filter((c: any) => c?.Id)
        .map((c: any) => ({
            qboCustomerId: String(c.Id),
            balance: Number(c.Balance || 0),
            currency: c.CurrencyRef?.value || 'USD',
            terms: c.SalesTermRef?.name || c.SalesTermRef?.value || null,
            lastInvoiceDate: null,
            lastPaymentDate: null,
        }));
};

export interface QboSnapshotUpsert {
    customerId: number;
    qboCustomerId: string;
    terms?: string | null;
    balance: string;
    currency: string;
    lastInvoiceDate?: Date | null;
    lastPaymentDate?: Date | null;
    snapshotTakenAt?: Date;
}

export const upsertQboCustomerSnapshots = async (snapshots: QboSnapshotUpsert[]) => {
    if (!snapshots.length) return;
    const now = new Date();
    for (const snap of snapshots) {
        await db.insert(qboCustomerSnapshots)
            .values({
                customerId: snap.customerId,
                qboCustomerId: snap.qboCustomerId,
                terms: snap.terms ?? null,
                balance: snap.balance,
                currency: snap.currency,
                lastInvoiceDate: snap.lastInvoiceDate ?? null,
                lastPaymentDate: snap.lastPaymentDate ?? null,
                snapshotTakenAt: snap.snapshotTakenAt ?? now,
            })
            .onConflictDoUpdate({
                target: qboCustomerSnapshots.customerId,
                set: {
                    qboCustomerId: snap.qboCustomerId,
                    terms: snap.terms ?? null,
                    balance: snap.balance,
                    currency: snap.currency,
                    lastInvoiceDate: snap.lastInvoiceDate ?? null,
                    lastPaymentDate: snap.lastPaymentDate ?? null,
                    snapshotTakenAt: snap.snapshotTakenAt ?? now,
                },
            });
    }
};
