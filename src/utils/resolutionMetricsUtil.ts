/**
 * Utility functions for tracking resolution metrics
 */
import { db, tickets, ticketComments } from '@/lib/db';
import { eq, and, sql, gte, desc, count, lte } from 'drizzle-orm';
import { kv } from '@vercel/kv';

// KV storage keys
const RESOLUTION_METRICS_KEY = 'ticket:resolution:metrics';

interface ResolutionMetricsStore {
  totalResolved: number;
  totalAutoClosed: number;
  totalReopened: number;
  lastUpdated: string;
}

/**
 * Updates the metrics in KV storage
 */
export async function updateResolutionMetrics(): Promise<ResolutionMetricsStore> {
  try {
    // Get metrics for all time
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get total resolved tickets
    const totalResolvedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%' OR ${ticketComments.commentText} LIKE '%Resolution Recommendation%'`
      );
    
    const totalResolved = totalResolvedResult[0]?.count || 0;
    
    // Get auto-closed tickets
    const autoClosedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%'`
      );
    
    const totalAutoClosed = autoClosedResult[0]?.count || 0;
    
    // Get tickets reopened by customers
    const reopenedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(
        sql`${ticketComments.commentText} LIKE '%Ticket Reopened by Customer%'`
      );
    
    const totalReopened = reopenedResult[0]?.count || 0;
    
    // Store metrics in KV
    const metrics: ResolutionMetricsStore = {
      totalResolved,
      totalAutoClosed,
      totalReopened,
      lastUpdated: new Date().toISOString()
    };
    
    await kv.set(RESOLUTION_METRICS_KEY, metrics);
    
    return metrics;
  } catch (error) {
    console.error('Error updating resolution metrics:', error);
    throw error;
  }
}

/**
 * Gets the current stored metrics
 */
export async function getStoredResolutionMetrics(): Promise<ResolutionMetricsStore | null> {
  try {
    return await kv.get(RESOLUTION_METRICS_KEY);
  } catch (error) {
    console.error('Error getting stored resolution metrics:', error);
    return null;
  }
}

/**
 * Calculate reopen rate for a given period
 */
export async function calculateReopenRate(
  startDate: Date,
  endDate: Date = new Date()
): Promise<{ 
  reopenRate: number, 
  reopenCount: number, 
  autoCloseCount: number 
}> {
  try {
    const autoClosedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%'`,
        gte(ticketComments.createdAt, startDate),
        lte(ticketComments.createdAt, endDate)
      ));
    
    const autoCloseCount = autoClosedResult[0]?.count || 0;
    
    const reopenedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Reopened by Customer%'`,
        gte(ticketComments.createdAt, startDate),
        lte(ticketComments.createdAt, endDate)
      ));
    
    const reopenCount = reopenedResult[0]?.count || 0;
    const reopenRate = autoCloseCount > 0 ? (reopenCount / autoCloseCount) * 100 : 0;
    return { reopenRate, reopenCount, autoCloseCount };
  } catch (error) {
    console.error('Error calculating reopen rate:', error);
    throw error;
  }
}

/**
 * Find tickets that are frequently reopened
 * (might indicate issues with auto-closure criteria)
 */
export async function findFrequentlyReopenedTickets(
  minReopenCount: number = 2
): Promise<any[]> {
  try {
    // This query finds tickets with multiple reopen events
    const query = `
      SELECT 
        t.id,
        t.title,
        t.sender_email,
        COUNT(*) as reopen_count
      FROM 
        ticketing_prod.tickets t
      JOIN
        ticketing_prod.ticket_comments tc ON t.id = tc.ticket_id
      WHERE
        tc.comment_text LIKE '%Ticket Reopened by Customer%'
      GROUP BY
        t.id, t.title, t.sender_email
      HAVING
        COUNT(*) >= ${minReopenCount}
      ORDER BY
        reopen_count DESC
      LIMIT 20
    `;
    
    const results = await db.execute(sql.raw(query));
    
    return results;
  } catch (error) {
    console.error('Error finding frequently reopened tickets:', error);
    throw error;
  }
} 