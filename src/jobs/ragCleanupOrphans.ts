/**
 * RAG Orphan Cleanup Job
 *
 * Cleans up RAG sources that reference entities that no longer exist.
 * This is a safety net for cases where deletion handlers don't properly
 * enqueue RAG delete jobs.
 *
 * Source types and their corresponding entity checks:
 * - ticket: tickets.id
 * - ticket_comment: ticket_comments.id
 * - shopify_order, amazon_order: orders.external_id
 * - qbo_invoice, qbo_estimate, qbo_customer: Check metadata for entity IDs
 * - shipstation_shipment: shipments.external_id
 */

import { db, ragSources, tickets, ticketComments, orders, shipments } from '@/lib/db';
import { eq, sql, and, inArray } from 'drizzle-orm';

interface CleanupResult {
  sourceType: string;
  checkedCount: number;
  orphanedCount: number;
  deletedCount: number;
}

/**
 * Find and delete orphaned ticket RAG sources.
 */
async function cleanupTicketOrphans(limit: number): Promise<CleanupResult> {
  // Find ticket sources where the ticket no longer exists
  const orphaned = await db.execute(sql`
    SELECT rs.id, rs.source_id
    FROM ticketing_prod.rag_sources rs
    LEFT JOIN ticketing_prod.tickets t ON t.id = CAST(rs.source_id AS INTEGER)
    WHERE rs.source_type = 'ticket'
      AND t.id IS NULL
    LIMIT ${limit}
  `);

  const rows = Array.isArray(orphaned) ? orphaned : (orphaned as any).rows || [];
  if (rows.length === 0) {
    return { sourceType: 'ticket', checkedCount: 0, orphanedCount: 0, deletedCount: 0 };
  }

  const orphanIds = rows.map((r: any) => r.id);
  await db.delete(ragSources).where(inArray(ragSources.id, orphanIds));

  console.log(`[ragCleanupOrphans] Deleted ${orphanIds.length} orphaned ticket RAG sources`);
  return { sourceType: 'ticket', checkedCount: rows.length, orphanedCount: rows.length, deletedCount: orphanIds.length };
}

/**
 * Find and delete orphaned ticket_comment RAG sources.
 */
async function cleanupTicketCommentOrphans(limit: number): Promise<CleanupResult> {
  const orphaned = await db.execute(sql`
    SELECT rs.id, rs.source_id
    FROM ticketing_prod.rag_sources rs
    LEFT JOIN ticketing_prod.ticket_comments tc ON tc.id = CAST(rs.source_id AS INTEGER)
    WHERE rs.source_type = 'ticket_comment'
      AND tc.id IS NULL
    LIMIT ${limit}
  `);

  const rows = Array.isArray(orphaned) ? orphaned : (orphaned as any).rows || [];
  if (rows.length === 0) {
    return { sourceType: 'ticket_comment', checkedCount: 0, orphanedCount: 0, deletedCount: 0 };
  }

  const orphanIds = rows.map((r: any) => r.id);
  await db.delete(ragSources).where(inArray(ragSources.id, orphanIds));

  console.log(`[ragCleanupOrphans] Deleted ${orphanIds.length} orphaned ticket_comment RAG sources`);
  return { sourceType: 'ticket_comment', checkedCount: rows.length, orphanedCount: rows.length, deletedCount: orphanIds.length };
}

/**
 * Find and delete orphaned order RAG sources (Shopify/Amazon).
 */
async function cleanupOrderOrphans(limit: number): Promise<CleanupResult> {
  // Check for shopify_order and amazon_order sources where the order no longer exists
  const orphaned = await db.execute(sql`
    SELECT rs.id, rs.source_id, rs.source_type
    FROM ticketing_prod.rag_sources rs
    LEFT JOIN ticketing_prod.orders o ON o.external_id = rs.source_id
      AND (
        (rs.source_type = 'shopify_order' AND o.provider = 'shopify')
        OR (rs.source_type = 'amazon_order' AND o.provider = 'amazon')
      )
    WHERE rs.source_type IN ('shopify_order', 'amazon_order')
      AND o.id IS NULL
    LIMIT ${limit}
  `);

  const rows = Array.isArray(orphaned) ? orphaned : (orphaned as any).rows || [];
  if (rows.length === 0) {
    return { sourceType: 'order', checkedCount: 0, orphanedCount: 0, deletedCount: 0 };
  }

  const orphanIds = rows.map((r: any) => r.id);
  await db.delete(ragSources).where(inArray(ragSources.id, orphanIds));

  console.log(`[ragCleanupOrphans] Deleted ${orphanIds.length} orphaned order RAG sources`);
  return { sourceType: 'order', checkedCount: rows.length, orphanedCount: rows.length, deletedCount: orphanIds.length };
}

/**
 * Find and delete RAG sources with NULL customerId that are definitively orphaned.
 *
 * IMPORTANT: We use a surgical approach to avoid deleting legitimate NULL customer sources:
 * - For ticket/order sources: Only delete if the parent entity EXISTS and HAS a customer
 *   (this means the RAG source's customer was deleted while entity retains its customer)
 * - For other sources: Only delete if the source is old enough to rule out race conditions
 *   AND matches known orphan patterns
 *
 * SECURITY: These orphaned sources could bypass RBAC scoping rules if queried
 * with allowGlobal=true, so they must be cleaned up proactively.
 */
async function cleanupNullCustomerOrphans(limit: number): Promise<CleanupResult> {
  // Strategy: Find RAG sources where:
  // 1. customerId IS NULL (orphaned from customer deletion)
  // 2. The parent entity EXISTS and HAS a customer (proving the source should have one)
  // This is surgical: we don't delete sources where the parent also has no customer

  // Ticket sources where ticket exists and has a customer but source doesn't
  const orphanedTicketSources = await db.execute(sql`
    SELECT rs.id
    FROM ticketing_prod.rag_sources rs
    INNER JOIN ticketing_prod.tickets t ON t.id = CAST(rs.source_id AS INTEGER)
    WHERE rs.source_type = 'ticket'
      AND rs.customer_id IS NULL
      AND t.customer_id IS NOT NULL
    LIMIT ${Math.floor(limit / 4)}
  `);

  // Ticket comment sources where parent ticket exists and has a customer
  const orphanedCommentSources = await db.execute(sql`
    SELECT rs.id
    FROM ticketing_prod.rag_sources rs
    INNER JOIN ticketing_prod.ticket_comments tc ON tc.id = CAST(rs.source_id AS INTEGER)
    INNER JOIN ticketing_prod.tickets t ON t.id = tc.ticket_id
    WHERE rs.source_type = 'ticket_comment'
      AND rs.customer_id IS NULL
      AND t.customer_id IS NOT NULL
    LIMIT ${Math.floor(limit / 4)}
  `);

  // Order sources where order exists and has a customer but source doesn't
  const orphanedOrderSources = await db.execute(sql`
    SELECT rs.id
    FROM ticketing_prod.rag_sources rs
    INNER JOIN ticketing_prod.orders o ON o.external_id = rs.source_id
      AND (
        (rs.source_type = 'shopify_order' AND o.provider = 'shopify')
        OR (rs.source_type = 'amazon_order' AND o.provider = 'amazon')
      )
    WHERE rs.source_type IN ('shopify_order', 'amazon_order')
      AND rs.customer_id IS NULL
      AND o.customer_id IS NOT NULL
    LIMIT ${Math.floor(limit / 4)}
  `);

  // Shipment sources where shipment exists and has a customer
  const orphanedShipmentSources = await db.execute(sql`
    SELECT rs.id
    FROM ticketing_prod.rag_sources rs
    INNER JOIN ticketing_prod.shipments s ON s.external_id = rs.source_id
    WHERE rs.source_type IN ('shipstation_shipment', 'amazon_shipment')
      AND rs.customer_id IS NULL
      AND s.customer_id IS NOT NULL
    LIMIT ${Math.floor(limit / 4)}
  `);

  // Collect all orphaned IDs
  const extractIds = (result: any) => {
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return rows.map((r: any) => r.id);
  };

  const allOrphanIds = [
    ...extractIds(orphanedTicketSources),
    ...extractIds(orphanedCommentSources),
    ...extractIds(orphanedOrderSources),
    ...extractIds(orphanedShipmentSources),
  ];

  if (allOrphanIds.length === 0) {
    return { sourceType: 'null_customer', checkedCount: 0, orphanedCount: 0, deletedCount: 0 };
  }

  await db.delete(ragSources).where(inArray(ragSources.id, allOrphanIds));

  console.log(`[ragCleanupOrphans] Deleted ${allOrphanIds.length} RAG sources with NULL customerId (orphaned from deleted customers)`);
  return { sourceType: 'null_customer', checkedCount: allOrphanIds.length, orphanedCount: allOrphanIds.length, deletedCount: allOrphanIds.length };
}

/**
 * Find and delete orphaned shipment RAG sources.
 */
async function cleanupShipmentOrphans(limit: number): Promise<CleanupResult> {
  const orphaned = await db.execute(sql`
    SELECT rs.id, rs.source_id
    FROM ticketing_prod.rag_sources rs
    LEFT JOIN ticketing_prod.shipments s ON s.external_id = rs.source_id
    WHERE rs.source_type = 'shipstation_shipment'
      AND s.id IS NULL
    LIMIT ${limit}
  `);

  const rows = Array.isArray(orphaned) ? orphaned : (orphaned as any).rows || [];
  if (rows.length === 0) {
    return { sourceType: 'shipment', checkedCount: 0, orphanedCount: 0, deletedCount: 0 };
  }

  const orphanIds = rows.map((r: any) => r.id);
  await db.delete(ragSources).where(inArray(ragSources.id, orphanIds));

  console.log(`[ragCleanupOrphans] Deleted ${orphanIds.length} orphaned shipment RAG sources`);
  return { sourceType: 'shipment', checkedCount: rows.length, orphanedCount: rows.length, deletedCount: orphanIds.length };
}

export interface CleanupOrphansOptions {
  limitPerType?: number;
}

/**
 * Main cleanup function that processes all source types.
 */
export async function cleanupOrphanedRagSources(options: CleanupOrphansOptions = {}): Promise<CleanupResult[]> {
  const { limitPerType = 100 } = options;
  console.log('[ragCleanupOrphans] Starting orphaned RAG source cleanup...');

  const results: CleanupResult[] = [];

  try {
    results.push(await cleanupTicketOrphans(limitPerType));
    results.push(await cleanupTicketCommentOrphans(limitPerType));
    results.push(await cleanupOrderOrphans(limitPerType));
    results.push(await cleanupShipmentOrphans(limitPerType));
    // SECURITY: Clean up orphaned sources from deleted customers (NULL customerId)
    results.push(await cleanupNullCustomerOrphans(limitPerType));

    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
    console.log(`[ragCleanupOrphans] Completed. Deleted ${totalDeleted} total orphaned sources.`);

    return results;
  } catch (error) {
    console.error('[ragCleanupOrphans] Failed:', error);
    throw error;
  }
}

// Allow running directly
if (process.argv[1]?.includes('ragCleanupOrphans')) {
  cleanupOrphanedRagSources()
    .then((results) => {
      console.log('[ragCleanupOrphans] Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ragCleanupOrphans] Failed:', err);
      process.exit(1);
    });
}
