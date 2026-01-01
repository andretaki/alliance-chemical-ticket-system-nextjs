/**
 * QBO Customer Sync Job
 *
 * Fetches customers from QuickBooks Online and upserts them into the customers table.
 * Uses structured JSON cursor for incremental sync.
 */

import { db, customers, customerIdentities, ragSyncCursors } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { runQboQuery } from '@/lib/qboService';
import { integrations } from '@/lib/env';
import {
  identityService,
  createSyncMetrics,
  logSyncMetrics,
  type SyncMetrics,
} from '@/services/crm/identityService';

const CURSOR_KEY = 'qbo_customer' as const;
const BATCH_SIZE = 100;

interface QboCursor {
  lastUpdatedAt: string | null;
  lastSuccessAt: string | null;
  pagesSynced: number;
}

interface QboCustomerRaw {
  Id: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Balance?: number;
  MetaData?: { LastUpdatedTime?: string };
}

async function getCursor(): Promise<QboCursor> {
  const row = await db.query.ragSyncCursors.findFirst({
    where: eq(ragSyncCursors.sourceType, CURSOR_KEY),
  });

  if (row?.cursorValue && typeof row.cursorValue === 'object') {
    const cv = row.cursorValue as Record<string, unknown>;
    return {
      lastUpdatedAt: (cv.lastUpdatedAt as string) || null,
      lastSuccessAt: (cv.lastSuccessAt as string) || null,
      pagesSynced: (cv.pagesSynced as number) || 0,
    };
  }

  return { lastUpdatedAt: null, lastSuccessAt: null, pagesSynced: 0 };
}

async function updateCursor(cursor: QboCursor, itemsSynced: number): Promise<void> {
  await db.insert(ragSyncCursors)
    .values({
      sourceType: CURSOR_KEY,
      cursorValue: cursor,
      lastSuccessAt: new Date(),
      itemsSynced,
    })
    .onConflictDoUpdate({
      target: ragSyncCursors.sourceType,
      set: {
        cursorValue: cursor,
        lastSuccessAt: new Date(),
        itemsSynced: sql`${ragSyncCursors.itemsSynced} + ${itemsSynced}`,
      },
    });
}

async function fetchQboCustomers(sinceDate?: string | null): Promise<QboCustomerRaw[]> {
  let query = `SELECT Id, DisplayName, GivenName, FamilyName, CompanyName, PrimaryEmailAddr, PrimaryPhone, Balance, MetaData FROM Customer`;

  if (sinceDate) {
    query += ` WHERE MetaData.LastUpdatedTime > '${sinceDate}'`;
  }

  query += ` ORDERBY MetaData.LastUpdatedTime ASC MAXRESULTS ${BATCH_SIZE}`;

  const response = await runQboQuery<{ QueryResponse?: { Customer?: QboCustomerRaw[] } }>(query);
  return response?.QueryResponse?.Customer || [];
}

export async function syncQboCustomers(options: { fullSync?: boolean } = {}): Promise<SyncMetrics> {
  const metrics = createSyncMetrics();

  if (!integrations.quickbooks) {
    console.log('[syncQboCustomers] QBO integration not configured, skipping');
    return metrics;
  }

  console.log('[syncQboCustomers] Starting QBO customer sync...');

  const cursor = await getCursor();
  const sinceDate = options.fullSync ? null : cursor.lastUpdatedAt;
  let hasMore = true;
  let currentCursor = { ...cursor };
  let latestUpdatedAt: string | null = cursor.lastUpdatedAt;

  while (hasMore) {
    try {
      const qboCustomers = await fetchQboCustomers(options.fullSync ? null : latestUpdatedAt);
      metrics.fetched += qboCustomers.length;

      if (qboCustomers.length === 0) {
        hasMore = false;
        break;
      }

      for (const qboCustomer of qboCustomers) {
        try {
          const email = qboCustomer.PrimaryEmailAddr?.Address || null;
          const phone = qboCustomer.PrimaryPhone?.FreeFormNumber || null;
          const qboCustomerId = String(qboCustomer.Id);

          // Parse name components
          const firstName = qboCustomer.GivenName || null;
          const lastName = qboCustomer.FamilyName || null;
          const displayName = qboCustomer.DisplayName || '';
          const company = qboCustomer.CompanyName || null;

          // If no first/last name, try to parse from DisplayName
          let parsedFirstName = firstName;
          let parsedLastName = lastName;
          if (!firstName && !lastName && displayName) {
            const parts = displayName.split(' ');
            if (parts.length >= 2) {
              parsedFirstName = parts[0];
              parsedLastName = parts.slice(1).join(' ');
            } else {
              parsedFirstName = displayName;
            }
          }

          const result = await identityService.upsertCustomerWithMetrics({
            provider: 'qbo',
            externalId: qboCustomerId,
            email,
            phone,
            firstName: parsedFirstName,
            lastName: parsedLastName,
            company,
            identityType: 'qbo_customer_id',
            metadata: {
              qboCustomerId,
              displayName,
              balance: qboCustomer.Balance,
              lastUpdatedTime: qboCustomer.MetaData?.LastUpdatedTime,
            },
          });

          switch (result.action) {
            case 'created':
              metrics.created++;
              break;
            case 'updated':
              metrics.updated++;
              break;
            case 'linked':
              metrics.linked++;
              break;
            case 'ambiguous':
              metrics.ambiguous++;
              console.warn(`[syncQboCustomers] Ambiguous match for QBO customer ${qboCustomerId}`);
              break;
          }

          // Track latest updated time for cursor
          if (qboCustomer.MetaData?.LastUpdatedTime) {
            if (!latestUpdatedAt || qboCustomer.MetaData.LastUpdatedTime > latestUpdatedAt) {
              latestUpdatedAt = qboCustomer.MetaData.LastUpdatedTime;
            }
          }
        } catch (err) {
          metrics.errors++;
          console.error(`[syncQboCustomers] Error processing QBO customer ${qboCustomer.Id}:`, err);
        }
      }

      currentCursor.pagesSynced++;
      currentCursor.lastUpdatedAt = latestUpdatedAt;
      currentCursor.lastSuccessAt = new Date().toISOString();

      // If we got less than BATCH_SIZE, we're done
      if (qboCustomers.length < BATCH_SIZE) {
        hasMore = false;
      }

      // Save cursor after each batch
      await updateCursor(currentCursor, qboCustomers.length);

    } catch (err) {
      metrics.errors++;
      console.error('[syncQboCustomers] Error fetching QBO customers:', err);
      hasMore = false;
    }
  }

  logSyncMetrics('syncQboCustomers', metrics);
  return metrics;
}

// CLI runner
if (process.argv[1]?.includes('syncQboCustomers')) {
  const fullSync = process.argv.includes('--full');
  syncQboCustomers({ fullSync })
    .then((metrics) => {
      console.log('[syncQboCustomers] Done:', metrics);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[syncQboCustomers] Failed:', err);
      process.exit(1);
    });
}
