import QuickBooks from 'node-quickbooks';
import OAuthClient from 'intuit-oauth';
import { qboConfig } from '@/config/qboConfig';
import { getToken, setToken, QboToken, isTokenExpired } from './qboTokenStore';
import { db, qboCustomerSnapshots, qboEstimates, qboInvoices } from '@/lib/db';
import { withResilience } from '@/lib/resilience';
import {
    withTokenRefreshLock,
    ensureProviderLockEntry,
    getTokenFromLockTable,
} from './tokenRefreshLock';

// Resilience configuration for QuickBooks API
const QBO_TIMEOUT_MS = 30000; // 30 seconds

let oauthClient: OAuthClient | null = null;
let cachedQboToken: QboToken | null = null;

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

/**
 * Refresh QBO tokens with distributed locking to prevent race conditions
 * in multi-instance deployments.
 */
export const refreshTokens = async (): Promise<QboToken> => {
    return withTokenRefreshLock(
        'qbo',
        async () => {
            const oauthClient = getOAuthClient();
            const token = await getToken();
            if (!token) throw new Error('No token to refresh.');

            console.log('[QboService] Refreshing token with lock...');
            oauthClient.setToken(token as any);
            const authResponse = await oauthClient.refresh();
            const newToken = authResponse.getJson();
            await setToken({ ...newToken, realmId: oauthClient.getToken().realmId });

            const refreshedToken = await getToken();
            if (!refreshedToken) throw new Error('Failed to get token after refresh.');

            cachedQboToken = refreshedToken;
            console.log('[QboService] Token refreshed successfully');
            return refreshedToken;
        },
        {
            tokenExpiryCheck: (row: { access_token_expires_at: Date | string | null }) => {
                if (!row.access_token_expires_at) return true;
                const expiresAt = new Date(row.access_token_expires_at);
                const buffer = 5 * 60 * 1000; // 5 min buffer
                return expiresAt.getTime() - buffer < Date.now();
            },
            getTokenFromRow: (row: { metadata: QboToken | null }) => {
                if (!row.metadata || typeof row.metadata !== 'object') return null;
                const token = row.metadata as QboToken;
                if (!token.access_token) return null;
                const expiresAt = new Date(token.createdAt + (token.expires_in || 3600) * 1000);
                return { accessToken: token.access_token, expiresAt };
            },
            onTokenFromCache: (cached) => {
                // Another process refreshed the token, reconstruct QboToken from cached data
                // We'll need to fetch the full token from DB
                console.log('[QboService] Using token refreshed by another process');
                return getToken().then(t => {
                    if (!t) throw new Error('Failed to get token from cache');
                    cachedQboToken = t;
                    return t;
                });
            },
        }
    );
};

export const getQboClient = async (): Promise<QuickBooks> => {
    // Initialize provider lock entry if needed
    await ensureProviderLockEntry('qbo');

    // Check memory cache first
    if (cachedQboToken && !isTokenExpired(cachedQboToken)) {
        return createQboClient(cachedQboToken);
    }

    // Get token from DB
    let token = await getToken();
    if (!token) {
        throw new Error('QBO not connected. Please connect to QuickBooks.');
    }

    const oauthClient = getOAuthClient();
    oauthClient.setToken(token as any);

    // Check if token is expired (or close to expiring)
    if (isTokenExpired(token)) {
        console.log('[QboService] Token expired or nearing expiration, refreshing...');
        try {
            token = await refreshTokens();
        } catch (e) {
            console.error('[QboService] Failed to refresh token:', e);
            throw new Error('Your QuickBooks connection has expired. Please reconnect.');
        }
    }

    cachedQboToken = token;
    return createQboClient(token);
};

function createQboClient(token: QboToken): QuickBooks {
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
}

export interface QboCustomerBalance {
    qboCustomerId: string;
    balance: number;
    currency: string;
    terms?: string | null;
    lastInvoiceDate?: string | null;
    lastPaymentDate?: string | null;
}

export const runQboQuery = async <T = any>(query: string): Promise<T> => {
    const client = await getQboClient();

    return withResilience(
        () =>
            new Promise<T>((resolve, reject) => {
                (client as any).query(query, (err: any, data: T) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(data);
                });
            }),
        {
            timeout: QBO_TIMEOUT_MS,
            name: 'QuickBooks-Query',
            // No fallback for QBO queries - fail loudly so callers can handle
        }
    );
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

export interface QboInvoiceRecord {
    qboInvoiceId: string;
    qboCustomerId: string | null;
    customerId?: number | null;
    docNumber: string | null;
    status: string | null;
    totalAmount: string;
    balance: string;
    currency: string;
    txnDate: Date | null;
    dueDate: Date | null;
    lastUpdatedAt: Date;
    metadata: Record<string, unknown>;
}

export interface QboEstimateRecord {
    qboEstimateId: string;
    qboCustomerId: string | null;
    customerId?: number | null;
    docNumber: string | null;
    status: string | null;
    totalAmount: string;
    currency: string;
    txnDate: Date | null;
    expirationDate: Date | null;
    lastUpdatedAt: Date;
    metadata: Record<string, unknown>;
}

export const fetchQboInvoices = async (since?: Date): Promise<QboInvoiceRecord[]> => {
    const sinceClause = since ? ` WHERE MetaData.LastUpdatedTime > '${since.toISOString()}'` : '';
    const query = `SELECT Id, DocNumber, Balance, TotalAmt, TxnDate, DueDate, CustomerRef, CurrencyRef, PrivateNote, MetaData.LastUpdatedTime FROM Invoice${sinceClause}`;
    const response = await runQboQuery<any>(query);
    const invoices = response?.QueryResponse?.Invoice || [];

    return invoices.map((inv: any) => ({
        qboInvoiceId: String(inv.Id),
        qboCustomerId: inv.CustomerRef?.value ? String(inv.CustomerRef.value) : null,
        customerId: null,
        docNumber: inv.DocNumber ? String(inv.DocNumber) : null,
        status: inv.EmailStatus || inv.Status || null,
        totalAmount: String(inv.TotalAmt ?? '0'),
        balance: String(inv.Balance ?? '0'),
        currency: inv.CurrencyRef?.value || 'USD',
        txnDate: inv.TxnDate ? new Date(inv.TxnDate) : null,
        dueDate: inv.DueDate ? new Date(inv.DueDate) : null,
        lastUpdatedAt: inv.MetaData?.LastUpdatedTime ? new Date(inv.MetaData.LastUpdatedTime) : new Date(),
        metadata: inv,
    }));
};

export const fetchQboEstimates = async (since?: Date): Promise<QboEstimateRecord[]> => {
    const sinceClause = since ? ` WHERE MetaData.LastUpdatedTime > '${since.toISOString()}'` : '';
    const query = `SELECT Id, DocNumber, TotalAmt, TxnDate, ExpirationDate, CustomerRef, CurrencyRef, PrivateNote, MetaData.LastUpdatedTime, Status FROM Estimate${sinceClause}`;
    const response = await runQboQuery<any>(query);
    const estimates = response?.QueryResponse?.Estimate || [];

    return estimates.map((est: any) => ({
        qboEstimateId: String(est.Id),
        qboCustomerId: est.CustomerRef?.value ? String(est.CustomerRef.value) : null,
        customerId: null,
        docNumber: est.DocNumber ? String(est.DocNumber) : null,
        status: est.Status || null,
        totalAmount: String(est.TotalAmt ?? '0'),
        currency: est.CurrencyRef?.value || 'USD',
        txnDate: est.TxnDate ? new Date(est.TxnDate) : null,
        expirationDate: est.ExpirationDate ? new Date(est.ExpirationDate) : null,
        lastUpdatedAt: est.MetaData?.LastUpdatedTime ? new Date(est.MetaData.LastUpdatedTime) : new Date(),
        metadata: est,
    }));
};

export const upsertQboInvoices = async (records: QboInvoiceRecord[]) => {
    if (!records.length) return;
    for (const record of records) {
        await db.insert(qboInvoices).values({
            customerId: record.customerId ?? null,
            qboInvoiceId: record.qboInvoiceId,
            qboCustomerId: record.qboCustomerId,
            docNumber: record.docNumber,
            status: record.status,
            totalAmount: record.totalAmount,
            balance: record.balance,
            currency: record.currency,
            txnDate: record.txnDate,
            dueDate: record.dueDate,
            metadata: record.metadata,
            updatedAt: new Date(),
            createdAt: new Date(),
        }).onConflictDoUpdate({
            target: qboInvoices.qboInvoiceId,
            set: {
                customerId: record.customerId ?? null,
                qboCustomerId: record.qboCustomerId,
                docNumber: record.docNumber,
                status: record.status,
                totalAmount: record.totalAmount,
                balance: record.balance,
                currency: record.currency,
                txnDate: record.txnDate,
                dueDate: record.dueDate,
                metadata: record.metadata,
                updatedAt: new Date(),
            },
        });
    }
};

export const upsertQboEstimates = async (records: QboEstimateRecord[]) => {
    if (!records.length) return;
    for (const record of records) {
        await db.insert(qboEstimates).values({
            customerId: record.customerId ?? null,
            qboEstimateId: record.qboEstimateId,
            qboCustomerId: record.qboCustomerId,
            docNumber: record.docNumber,
            status: record.status,
            totalAmount: record.totalAmount,
            currency: record.currency,
            txnDate: record.txnDate,
            expirationDate: record.expirationDate,
            metadata: record.metadata,
            updatedAt: new Date(),
            createdAt: new Date(),
        }).onConflictDoUpdate({
            target: qboEstimates.qboEstimateId,
            set: {
                customerId: record.customerId ?? null,
                qboCustomerId: record.qboCustomerId,
                docNumber: record.docNumber,
                status: record.status,
                totalAmount: record.totalAmount,
                currency: record.currency,
                txnDate: record.txnDate,
                expirationDate: record.expirationDate,
                metadata: record.metadata,
                updatedAt: new Date(),
            },
        });
    }
};
