import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { kv } from '@vercel/kv';
import { db } from '@/lib/db';
import { tickets, ticketComments } from '@/db/schema';
import { count, eq, and, sql, desc, gte, lt, between } from 'drizzle-orm';

// KV storage key for last run time
const LAST_RESOLUTION_RUN_KEY = 'ticket:resolution:last_run';

/**
 * GET handler to retrieve resolution metrics
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and admin status
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
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
    
    // Get AI confidence distribution for auto-closed tickets
    const highConfidenceResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%' AND ${ticketComments.commentText} LIKE '%Confidence**: high%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const mediumConfidenceResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%' AND ${ticketComments.commentText} LIKE '%Confidence**: medium%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const lowConfidenceResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Ticket Auto-Closed%' AND ${ticketComments.commentText} LIKE '%Confidence**: low%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const confidenceDistribution = {
      high: highConfidenceResult[0]?.count || 0,
      medium: mediumConfidenceResult[0]?.count || 0,
      low: lowConfidenceResult[0]?.count || 0
    };
    
    // Get auto follow-up statistics
    const autoFollowUpResult = await db
      .select({ count: count() })
      .from(ticketComments)
      .where(and(
        sql`${ticketComments.commentText} LIKE '%Auto Follow-Up Sent%'`,
        gte(ticketComments.createdAt, thirtyDaysAgo)
      ));
    
    const autoFollowUpsSent = autoFollowUpResult[0]?.count || 0;
    
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
    
    // Calculate average conversation turns for auto-closed tickets
    // This requires a more complex query to analyze the conversation history
    const conversationTurnsQuery = await db.execute(sql`
      WITH auto_closed_tickets AS (
        SELECT DISTINCT tc.ticket_id
        FROM ${ticketComments} tc
        WHERE tc.comment_text LIKE '%Ticket Auto-Closed%'
          AND tc.created_at >= ${thirtyDaysAgo}
      ),
      conversation_analysis AS (
        SELECT 
          ac.ticket_id,
          COUNT(CASE WHEN tc2.is_from_customer = true THEN 1 END) as customer_messages,
          COUNT(CASE WHEN tc2.is_from_customer = false AND tc2.is_internal_note = false THEN 1 END) as agent_messages
        FROM auto_closed_tickets ac
        LEFT JOIN ${ticketComments} tc2 ON ac.ticket_id = tc2.ticket_id
        WHERE tc2.is_internal_note = false
        GROUP BY ac.ticket_id
      )
      SELECT AVG(customer_messages + agent_messages) as avg_turns
      FROM conversation_analysis
      WHERE customer_messages > 0 AND agent_messages > 0
    `);
    
    const averageConversationTurns = conversationTurnsQuery[0]?.avg_turns || 0;
    
    // Calculate AI recommendation accuracy (auto-closed tickets that weren't reopened)
    const aiRecommendationAccuracy = totalAutoClosed > 0 ? 
      ((totalAutoClosed - reopenedCount) / totalAutoClosed) * 100 : 100;
    
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
      confidenceDistribution,
      averageConversationTurns,
      autoFollowUpsSent,
      aiRecommendationAccuracy,
      lastRunTime
    });
  } catch (error) {
    console.error('Error retrieving resolution metrics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 