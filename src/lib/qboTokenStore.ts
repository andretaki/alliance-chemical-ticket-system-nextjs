/**
 * QuickBooks Token Store
 *
 * Uses PostgreSQL for token storage (suitable for multi-instance deployments).
 * Previously used file-based storage which doesn't work on Vercel.
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const PROVIDER = 'qbo';

// Helper to normalize db.execute results (handles both array and { rows: [] } formats)
function normalizeResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export interface QboToken {
    access_token: string;
    refresh_token: string;
    token_type: 'bearer';
    expires_in: number;
    x_refresh_token_expires_in: number;
    createdAt: number; // Timestamp of creation
    realmId: string;
}

/**
 * Get QBO token from database
 */
export const getToken = async (): Promise<QboToken | null> => {
    try {
        const result = await db.execute(sql`
            SELECT metadata FROM oauth_token_locks WHERE provider = ${PROVIDER}
        `);

        const rows = normalizeResult<{ metadata: QboToken | null }>(result);
        if (rows.length > 0) {
            const row = rows[0];
            if (row.metadata && typeof row.metadata === 'object' && 'access_token' in row.metadata) {
                return row.metadata as QboToken;
            }
        }
        return null;
    } catch (error) {
        console.error('[QboTokenStore] Error reading token:', error);
        return null;
    }
};

/**
 * Save QBO token to database
 */
export const setToken = async (token: object): Promise<void> => {
    try {
        const tokenData = {
            ...token,
            createdAt: Date.now(),
        } as QboToken;

        // Calculate expiry time
        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

        await db.execute(sql`
            INSERT INTO oauth_token_locks (provider, access_token, access_token_expires_at, metadata, created_at, updated_at)
            VALUES (${PROVIDER}, ${tokenData.access_token}, ${expiresAt}, ${JSON.stringify(tokenData)}::jsonb, NOW(), NOW())
            ON CONFLICT (provider) DO UPDATE SET
                access_token = ${tokenData.access_token},
                access_token_expires_at = ${expiresAt},
                metadata = ${JSON.stringify(tokenData)}::jsonb,
                last_refreshed_at = NOW(),
                updated_at = NOW()
        `);
    } catch (error) {
        console.error('[QboTokenStore] Failed to write token:', error);
        throw new Error('Could not save QBO token.');
    }
};

/**
 * Check if token is expired or nearing expiration
 */
export const isTokenExpired = (token: QboToken, bufferMs: number = 5 * 60 * 1000): boolean => {
    const tokenCreateTime = token.createdAt || 0;
    const expiresIn = (token.expires_in || 3600) * 1000; // in ms
    return Date.now() - tokenCreateTime > expiresIn - bufferMs;
};

/**
 * Clear stored token (for logout/disconnect)
 */
export const clearToken = async (): Promise<void> => {
    try {
        await db.execute(sql`
            UPDATE oauth_token_locks
            SET access_token = NULL, metadata = NULL, updated_at = NOW()
            WHERE provider = ${PROVIDER}
        `);
    } catch (error) {
        console.error('[QboTokenStore] Failed to clear token:', error);
    }
};
