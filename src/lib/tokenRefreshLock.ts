/**
 * Token Refresh Locking Utility
 *
 * Prevents race conditions when multiple instances try to refresh OAuth tokens
 * simultaneously. Uses PostgreSQL's FOR UPDATE SKIP LOCKED for distributed locking.
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const LOCK_TIMEOUT_MS = 30000; // 30 seconds max wait
const LOCK_CHECK_INTERVAL_MS = 100; // Check every 100ms

// Helper to normalize db.execute results (handles both array and { rows: [] } formats)
function normalizeResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

interface LockStatus {
  acquired: boolean;
  refreshInProgress: boolean;
  currentToken?: {
    accessToken: string;
    expiresAt: Date;
  };
}

/**
 * Attempt to acquire a lock for token refresh.
 * Uses optimistic locking with a refresh_lock_until timestamp.
 *
 * Returns the current token if another process already refreshed it,
 * or acquires the lock if we need to refresh.
 */
export async function acquireTokenRefreshLock(
  provider: 'amazon_sp' | 'qbo',
  tokenExpiryCheck: (row: any) => boolean,
  getTokenFromRow: (row: any) => { accessToken: string; expiresAt: Date } | null
): Promise<LockStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
    try {
      // Use a transaction with FOR UPDATE SKIP LOCKED to acquire lock
      const result = await db.execute(sql`
        UPDATE oauth_token_locks
        SET
          refresh_lock_until = NOW() + INTERVAL '30 seconds',
          refresh_started_at = NOW(),
          lock_holder_id = gen_random_uuid()::text
        WHERE provider = ${provider}
          AND (refresh_lock_until IS NULL OR refresh_lock_until < NOW())
        RETURNING *
      `);

      const rows = normalizeResult<Record<string, unknown>>(result);
      if (rows.length > 0) {
        // We acquired the lock
        const row = rows[0];

        // Double-check if token is still valid (another process might have just refreshed)
        if (!tokenExpiryCheck(row)) {
          const token = getTokenFromRow(row);
          if (token) {
            // Token is still valid, release lock and return
            await releaseTokenRefreshLock(provider);
            return { acquired: false, refreshInProgress: false, currentToken: token };
          }
        }

        return { acquired: true, refreshInProgress: false };
      }

      // Lock is held by another process - wait and check if they finished
      await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL_MS));

      // Check if token was refreshed while we were waiting
      const checkResult = await db.execute(sql`
        SELECT * FROM oauth_token_locks WHERE provider = ${provider}
      `);

      const checkRows = normalizeResult<Record<string, unknown>>(checkResult);
      if (checkRows.length > 0) {
        const row = checkRows[0];
        if (!tokenExpiryCheck(row)) {
          const token = getTokenFromRow(row);
          if (token) {
            return { acquired: false, refreshInProgress: false, currentToken: token };
          }
        }
      }

    } catch (error) {
      console.error(`[TokenRefreshLock] Error acquiring lock for ${provider}:`, error);
      await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL_MS));
    }
  }

  // Timeout - force acquire the lock (clear stale lock)
  console.warn(`[TokenRefreshLock] Lock timeout for ${provider}, forcing lock acquisition`);

  try {
    await db.execute(sql`
      UPDATE oauth_token_locks
      SET
        refresh_lock_until = NOW() + INTERVAL '30 seconds',
        refresh_started_at = NOW(),
        lock_holder_id = gen_random_uuid()::text
      WHERE provider = ${provider}
    `);
    return { acquired: true, refreshInProgress: false };
  } catch (error) {
    console.error(`[TokenRefreshLock] Failed to force lock for ${provider}:`, error);
    throw new Error(`Failed to acquire token refresh lock for ${provider}`);
  }
}

/**
 * Release the token refresh lock after successful refresh
 */
export async function releaseTokenRefreshLock(provider: 'amazon_sp' | 'qbo'): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE oauth_token_locks
      SET
        refresh_lock_until = NULL,
        lock_holder_id = NULL
      WHERE provider = ${provider}
    `);
  } catch (error) {
    console.error(`[TokenRefreshLock] Error releasing lock for ${provider}:`, error);
  }
}

/**
 * Update token in the lock table after successful refresh
 */
export async function updateTokenAfterRefresh(
  provider: 'amazon_sp' | 'qbo',
  accessToken: string,
  expiresAt: Date,
  additionalData?: Record<string, unknown>
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE oauth_token_locks
      SET
        access_token = ${accessToken},
        access_token_expires_at = ${expiresAt},
        refresh_lock_until = NULL,
        lock_holder_id = NULL,
        last_refreshed_at = NOW(),
        metadata = ${additionalData ? JSON.stringify(additionalData) : null}::jsonb
      WHERE provider = ${provider}
    `);
  } catch (error) {
    console.error(`[TokenRefreshLock] Error updating token for ${provider}:`, error);
    throw error;
  }
}

/**
 * Initialize provider entry in lock table if not exists
 */
export async function ensureProviderLockEntry(provider: 'amazon_sp' | 'qbo'): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO oauth_token_locks (provider, created_at, updated_at)
      VALUES (${provider}, NOW(), NOW())
      ON CONFLICT (provider) DO NOTHING
    `);
  } catch (error) {
    console.error(`[TokenRefreshLock] Error ensuring provider entry for ${provider}:`, error);
  }
}

/**
 * Get current token from lock table
 */
export async function getTokenFromLockTable(
  provider: 'amazon_sp' | 'qbo'
): Promise<{ accessToken: string; expiresAt: Date; metadata?: Record<string, unknown> } | null> {
  try {
    const result = await db.execute(sql`
      SELECT access_token, access_token_expires_at, metadata
      FROM oauth_token_locks
      WHERE provider = ${provider}
        AND access_token IS NOT NULL
        AND access_token_expires_at > NOW()
    `);

    const rows = normalizeResult<{
      access_token: string;
      access_token_expires_at: string | Date;
      metadata?: Record<string, unknown>;
    }>(result);

    if (rows.length > 0) {
      const row = rows[0];
      return {
        accessToken: row.access_token,
        expiresAt: new Date(row.access_token_expires_at),
        metadata: row.metadata,
      };
    }
    return null;
  } catch (error) {
    console.error(`[TokenRefreshLock] Error getting token for ${provider}:`, error);
    return null;
  }
}

/**
 * Wrapper function for token refresh with locking
 * This is the main entry point for safe token refresh
 */
export async function withTokenRefreshLock<T>(
  provider: 'amazon_sp' | 'qbo',
  refreshFn: () => Promise<T>,
  options: {
    tokenExpiryCheck: (row: any) => boolean;
    getTokenFromRow: (row: any) => { accessToken: string; expiresAt: Date } | null;
    onTokenFromCache?: (token: { accessToken: string; expiresAt: Date }) => T | Promise<T>;
  }
): Promise<T> {
  // Ensure provider entry exists
  await ensureProviderLockEntry(provider);

  const lockStatus = await acquireTokenRefreshLock(
    provider,
    options.tokenExpiryCheck,
    options.getTokenFromRow
  );

  if (!lockStatus.acquired && lockStatus.currentToken && options.onTokenFromCache) {
    // Another process refreshed the token, use it
    return await options.onTokenFromCache(lockStatus.currentToken);
  }

  try {
    // We have the lock, perform the refresh
    return await refreshFn();
  } finally {
    // Always release the lock
    await releaseTokenRefreshLock(provider);
  }
}
