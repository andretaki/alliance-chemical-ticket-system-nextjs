import { db, customerIdentities } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { fetchQboCustomersWithBalances, upsertQboCustomerSnapshots, type QboSnapshotUpsert } from '@/lib/qboService';

/**
 * Sync QBO customer AR snapshots into local storage.
 * Intended to be triggered by a scheduler or manual run (e.g. `tsx src/jobs/syncQboCustomerSnapshots.ts`).
 */
export async function syncQboCustomerSnapshots() {
  console.log('[syncQboCustomerSnapshots] Starting QBO snapshot sync...');

  const qboCustomers = await fetchQboCustomersWithBalances();
  if (!qboCustomers.length) {
    console.log('[syncQboCustomerSnapshots] No QBO customers returned.');
    return;
  }

  const identities = await db.query.customerIdentities.findMany({
    where: eq(customerIdentities.provider, 'qbo'),
    columns: {
      id: true,
      externalId: true,
      customerId: true,
    },
  });

  const identityMap = new Map<string, number>();
  identities.forEach((i) => {
    if (i.externalId) {
      identityMap.set(i.externalId, i.customerId);
    }
  });

  const snapshots = qboCustomers
    .map<QboSnapshotUpsert | null>((c) => {
      const customerId = identityMap.get(c.qboCustomerId);
      if (!customerId) return null;
      return {
        customerId,
        qboCustomerId: c.qboCustomerId,
        terms: c.terms ?? null,
        balance: c.balance.toFixed(2),
        currency: c.currency || 'USD',
        lastInvoiceDate: c.lastInvoiceDate ? new Date(c.lastInvoiceDate) : null,
        lastPaymentDate: c.lastPaymentDate ? new Date(c.lastPaymentDate) : null,
        snapshotTakenAt: new Date(),
      };
    })
    .filter((s): s is QboSnapshotUpsert => Boolean(s));

  if (!snapshots.length) {
    console.log('[syncQboCustomerSnapshots] No linked customers to update.');
    return;
  }

  await upsertQboCustomerSnapshots(snapshots);

  console.log(`[syncQboCustomerSnapshots] Upserted ${snapshots.length} snapshots.`);
}

// Allow running directly with tsx/node
if (process.argv[1]?.includes('syncQboCustomerSnapshots')) {
  syncQboCustomerSnapshots().catch((err) => {
    console.error('[syncQboCustomerSnapshots] Failed:', err);
    process.exit(1);
  });
}
