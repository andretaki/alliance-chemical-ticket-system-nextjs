import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { kv } from '@vercel/kv';
import { db } from '@/db';
import { tickets, ticketComments } from '@/db/schema';
import { count, eq, and, sql, desc, gte, lt, between } from 'drizzle-orm';
import { authOptions } from '@/lib/authOptions';

// KV storage key for last run time
const LAST_RESOLUTION_RUN_KEY = 'ticket:resolution:last_run';

/**
 * GET handler to retrieve resolution metrics
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin status
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Calculate metrics
    
    // Get the last 30 days for metrics calculations
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get total resolved tickets from comments
    const totalResolvedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%' OR ${ticketComments.commentText} LIKE '%Resolution Recommendation%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const totalResolved = totalResolvedResult[0]?.count || 0;
    
    // Get auto-closed tickets
    const autoClosedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const totalAutoClosed = autoClosedResult[0]?.count || 0;
    
    // Get follow-up recommendations
    const followUpResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Follow-Up Recommendation%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const totalFollowUp = followUpResult[0]?.count || 0;
    
    // Get tickets reopened by customers
    const reopenedResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Reopened by Customer%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const reopenedCount = reopenedResult[0]?.count || 0;
    
    // Get ticket resolution times
    const resolutionTimes = await db.execute(sql`
      WITH closed_tickets AS (
        SELECT 
          t.id,
          t.created_at as open_time,
          t.updated_at as close_time
        FROM 
          ${tickets} t
        WHERE 
          t.status = 'closed'
          AND t.updated_at >= ${thirtyDaysAgo}
      )
      SELECT 
        AVG(EXTRACT(EPOCH FROM (close_time - open_time)) / 86400) as avg_days
      FROM 
        closed_tickets
    `);
    
    const avgResolutionTime = resolutionTimes[0]?.avg_days || 0;
    
    // Calculate resolution rate (closed tickets / total tickets in period)
    const totalTicketsResult = await db
      .select({ count: count() })
      .from(tickets)
      .where(gte(tickets.createdAt, thirtyDaysAgo));
    
    const totalTickets = totalTicketsResult[0]?.count || 0;
    
    const closedTicketsResult = await db
      .select({ count: count() })
      .from(tickets)
      .where(and(
        eq(tickets.status, 'closed'),
        gte(tickets.createdAt, thirtyDaysAgo)
      ));
    
    const closedTickets = closedTicketsResult[0]?.count || 0;
    
    const resolutionRate = totalTickets > 0 ? closedTickets / totalTickets : 0;
    
    // Calculate auto-close rate (auto-closed / all closed)
    const autoCloseRate = closedTickets > 0 ? (totalAutoClosed / closedTickets) * 100 : 0;
    
    // Calculate reopen rate (reopened / auto-closed)
    const reopenRate = totalAutoClosed > 0 ? (reopenedCount / totalAutoClosed) * 100 : 0;
    
    // Get last run time from KV store
    const lastRunTime = await kv.get(LAST_RESOLUTION_RUN_KEY);
    
    return NextResponse.json({
      totalResolved,
      totalAutoClosed,
      totalFollowUp,
      reopenedCount,
      averageResolutionTime: avgResolutionTime,
      resolutionRate,
      autoCloseRate,
      reopenRate,
      lastRunTime
    });
  } catch (error) {
    console.error('Error retrieving resolution metrics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 