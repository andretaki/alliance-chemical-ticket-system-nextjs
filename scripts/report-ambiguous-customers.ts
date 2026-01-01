#!/usr/bin/env npx tsx
/**
 * Report Ambiguous Customer Matches
 *
 * Finds customers that share the same email or phone,
 * which indicates potential duplicates that need manual review.
 *
 * Usage:
 *   npx tsx scripts/report-ambiguous-customers.ts
 *   npx tsx scripts/report-ambiguous-customers.ts --json
 */

import { db } from '@/lib/db';
import { customers, customerIdentities, orders } from '@/db/schema';
import { eq, sql, and, isNotNull } from 'drizzle-orm';

interface AmbiguousMatch {
  type: 'email' | 'phone' | 'address_hash';
  value: string;
  customerIds: number[];
  customerNames: string[];
  orderCounts: number[];
  providers: string[];
}

async function findAmbiguousByEmail(): Promise<AmbiguousMatch[]> {
  // Find emails that appear on multiple customers
  const duplicateEmails = await db.execute<{ email: string; customer_ids: number[]; count: number }>(sql`
    SELECT
      LOWER(ci.email) as email,
      ARRAY_AGG(DISTINCT ci.customer_id) as customer_ids,
      COUNT(DISTINCT ci.customer_id) as count
    FROM ticketing_prod.customer_identities ci
    WHERE ci.email IS NOT NULL
    GROUP BY LOWER(ci.email)
    HAVING COUNT(DISTINCT ci.customer_id) > 1
    ORDER BY COUNT(DISTINCT ci.customer_id) DESC
    LIMIT 100
  `);

  const matches: AmbiguousMatch[] = [];

  for (const row of duplicateEmails.rows) {
    const customerIds = row.customer_ids;

    // Get customer details
    const customerDetails = await db.query.customers.findMany({
      where: sql`${customers.id} = ANY(${customerIds})`,
      columns: { id: true, firstName: true, lastName: true, primaryEmail: true },
    });

    // Get order counts
    const orderCounts = await Promise.all(
      customerIds.map(async (id: number) => {
        const result = await db.select({ count: sql<number>`COUNT(*)` })
          .from(orders)
          .where(eq(orders.customerId, id));
        return result[0]?.count || 0;
      })
    );

    // Get providers
    const identities = await db.query.customerIdentities.findMany({
      where: and(
        sql`${customerIdentities.customerId} = ANY(${customerIds})`,
        eq(customerIdentities.email, row.email)
      ),
      columns: { provider: true, customerId: true },
    });

    matches.push({
      type: 'email',
      value: row.email,
      customerIds,
      customerNames: customerDetails.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'),
      orderCounts,
      providers: [...new Set(identities.map(i => i.provider))],
    });
  }

  return matches;
}

async function findAmbiguousByPhone(): Promise<AmbiguousMatch[]> {
  // Find phones that appear on multiple customers
  const duplicatePhones = await db.execute<{ phone: string; customer_ids: number[]; count: number }>(sql`
    SELECT
      ci.phone,
      ARRAY_AGG(DISTINCT ci.customer_id) as customer_ids,
      COUNT(DISTINCT ci.customer_id) as count
    FROM ticketing_prod.customer_identities ci
    WHERE ci.phone IS NOT NULL AND ci.phone != ''
    GROUP BY ci.phone
    HAVING COUNT(DISTINCT ci.customer_id) > 1
    ORDER BY COUNT(DISTINCT ci.customer_id) DESC
    LIMIT 100
  `);

  const matches: AmbiguousMatch[] = [];

  for (const row of duplicatePhones.rows) {
    const customerIds = row.customer_ids;

    const customerDetails = await db.query.customers.findMany({
      where: sql`${customers.id} = ANY(${customerIds})`,
      columns: { id: true, firstName: true, lastName: true, primaryPhone: true },
    });

    const orderCounts = await Promise.all(
      customerIds.map(async (id: number) => {
        const result = await db.select({ count: sql<number>`COUNT(*)` })
          .from(orders)
          .where(eq(orders.customerId, id));
        return result[0]?.count || 0;
      })
    );

    const identities = await db.query.customerIdentities.findMany({
      where: and(
        sql`${customerIdentities.customerId} = ANY(${customerIds})`,
        eq(customerIdentities.phone, row.phone)
      ),
      columns: { provider: true, customerId: true },
    });

    matches.push({
      type: 'phone',
      value: row.phone,
      customerIds,
      customerNames: customerDetails.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'),
      orderCounts,
      providers: [...new Set(identities.map(i => i.provider))],
    });
  }

  return matches;
}

async function findAmbiguousByAddressHash(): Promise<AmbiguousMatch[]> {
  // Find address hashes that appear on multiple customers
  const duplicateHashes = await db.execute<{ hash: string; customer_ids: number[]; count: number }>(sql`
    SELECT
      SUBSTRING(ci.external_id FROM 14) as hash,
      ARRAY_AGG(DISTINCT ci.customer_id) as customer_ids,
      COUNT(DISTINCT ci.customer_id) as count
    FROM ticketing_prod.customer_identities ci
    WHERE ci.external_id LIKE 'address_hash:%'
    GROUP BY SUBSTRING(ci.external_id FROM 14)
    HAVING COUNT(DISTINCT ci.customer_id) > 1
    ORDER BY COUNT(DISTINCT ci.customer_id) DESC
    LIMIT 100
  `);

  const matches: AmbiguousMatch[] = [];

  for (const row of duplicateHashes.rows) {
    const customerIds = row.customer_ids;

    const customerDetails = await db.query.customers.findMany({
      where: sql`${customers.id} = ANY(${customerIds})`,
      columns: { id: true, firstName: true, lastName: true },
    });

    const orderCounts = await Promise.all(
      customerIds.map(async (id: number) => {
        const result = await db.select({ count: sql<number>`COUNT(*)` })
          .from(orders)
          .where(eq(orders.customerId, id));
        return result[0]?.count || 0;
      })
    );

    matches.push({
      type: 'address_hash',
      value: row.hash.substring(0, 12) + '...',
      customerIds,
      customerNames: customerDetails.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'),
      orderCounts,
      providers: ['amazon', 'shipstation'],
    });
  }

  return matches;
}

async function generateReport() {
  console.log('=== Ambiguous Customer Matches Report ===\n');

  const isJson = process.argv.includes('--json');

  const [emailMatches, phoneMatches, hashMatches] = await Promise.all([
    findAmbiguousByEmail(),
    findAmbiguousByPhone(),
    findAmbiguousByAddressHash(),
  ]);

  const allMatches = [...emailMatches, ...phoneMatches, ...hashMatches];

  if (isJson) {
    console.log(JSON.stringify({
      generated: new Date().toISOString(),
      summary: {
        emailDuplicates: emailMatches.length,
        phoneDuplicates: phoneMatches.length,
        addressHashDuplicates: hashMatches.length,
        total: allMatches.length,
      },
      matches: allMatches,
    }, null, 2));
    return;
  }

  console.log('Summary:');
  console.log(`  Email duplicates: ${emailMatches.length}`);
  console.log(`  Phone duplicates: ${phoneMatches.length}`);
  console.log(`  Address hash duplicates: ${hashMatches.length}`);
  console.log(`  Total: ${allMatches.length}\n`);

  if (emailMatches.length > 0) {
    console.log('--- Email Duplicates (customers sharing same email) ---');
    for (const match of emailMatches.slice(0, 20)) {
      console.log(`\n  Email: ${match.value}`);
      console.log(`  Customers: ${match.customerIds.join(', ')}`);
      console.log(`  Names: ${match.customerNames.join(' | ')}`);
      console.log(`  Orders: ${match.orderCounts.join(' | ')}`);
      console.log(`  Providers: ${match.providers.join(', ')}`);
    }
    if (emailMatches.length > 20) {
      console.log(`\n  ... and ${emailMatches.length - 20} more`);
    }
  }

  if (phoneMatches.length > 0) {
    console.log('\n--- Phone Duplicates (customers sharing same phone) ---');
    for (const match of phoneMatches.slice(0, 20)) {
      console.log(`\n  Phone: ${match.value}`);
      console.log(`  Customers: ${match.customerIds.join(', ')}`);
      console.log(`  Names: ${match.customerNames.join(' | ')}`);
      console.log(`  Orders: ${match.orderCounts.join(' | ')}`);
      console.log(`  Providers: ${match.providers.join(', ')}`);
    }
    if (phoneMatches.length > 20) {
      console.log(`\n  ... and ${phoneMatches.length - 20} more`);
    }
  }

  if (hashMatches.length > 0) {
    console.log('\n--- Address Hash Duplicates (customers at same address) ---');
    for (const match of hashMatches.slice(0, 20)) {
      console.log(`\n  Hash: ${match.value}`);
      console.log(`  Customers: ${match.customerIds.join(', ')}`);
      console.log(`  Names: ${match.customerNames.join(' | ')}`);
      console.log(`  Orders: ${match.orderCounts.join(' | ')}`);
    }
    if (hashMatches.length > 20) {
      console.log(`\n  ... and ${hashMatches.length - 20} more`);
    }
  }

  console.log('\n=== End of Report ===');
}

generateReport().catch((err) => {
  console.error('Failed to generate report:', err);
  process.exit(1);
});
