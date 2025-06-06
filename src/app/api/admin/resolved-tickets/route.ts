import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db, tickets, ticketComments } from '@/lib/db';
import { eq, and, desc, sql, like } from 'drizzle-orm';
import { authOptions } from '@/lib/authOptions';

/**
 * GET handler to retrieve resolved tickets with pagination
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
    
    // Get pagination parameters
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Validate parameters
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 });
    }
    
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 });
    }
    
    const offset = (page - 1) * limit;
    
    // Find all tickets that were automatically closed
    // This implementation joins the tickets with their auto-close comments to get the resolution details
    const resolvedTicketsQuery = `
      WITH auto_close_comments AS (
        SELECT 
          tc.ticket_id,
          tc.comment_text,
          tc.created_at,
          CASE 
            WHEN tc.comment_text LIKE '%high%confidence%' THEN 'high'
            WHEN tc.comment_text LIKE '%medium%confidence%' THEN 'medium'
            ELSE 'low'
          END as confidence,
          CASE 
            WHEN tc.comment_text LIKE '%automatically closed%' THEN true
            ELSE false
          END as auto_close
        FROM 
          ticketing_prod.ticket_comments tc
        WHERE 
          tc.comment_text LIKE '%Ticket Auto-Closed%' OR
          tc.comment_text LIKE '%Resolution Recommendation%'
        ORDER BY 
          tc.created_at DESC
      )
      SELECT 
        t.id,
        t.title,
        t.sender_name,
        t.sender_email,
        t.updated_at as closed_at,
        ac.comment_text,
        ac.confidence,
        ac.auto_close,
        (
          SELECT COUNT(*)
          FROM ticketing_prod.tickets 
          WHERE status = 'closed' AND (
            EXISTS (
              SELECT 1 
              FROM ticketing_prod.ticket_comments 
              WHERE ticket_id = tickets.id AND (
                comment_text LIKE '%Ticket Auto-Closed%' OR
                comment_text LIKE '%Resolution Recommendation%'
              )
            )
          )
        ) as total_count
      FROM 
        ticketing_prod.tickets t
      JOIN 
        auto_close_comments ac ON t.id = ac.ticket_id
      WHERE 
        t.status = 'closed'
      ORDER BY 
        closed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const resolvedTickets = await db.execute(sql.raw(resolvedTicketsQuery));
    
    // Process results to extract resolution summary
    const formattedTickets = resolvedTickets.map(ticket => {
      // Extract resolution summary from comment text
      let resolutionSummary = '';
      const commentText = String(ticket.comment_text || '');
      
      if (commentText) {
        // Try to extract the resolution summary
        const resolutionMatch = /Resolution Summary\*\*:\s*(.*?)(?:\n|$)/i.exec(commentText);
        if (resolutionMatch && resolutionMatch[1]) {
          resolutionSummary = resolutionMatch[1].trim();
        }
      }
      
      return {
        id: ticket.id,
        title: ticket.title,
        senderName: ticket.sender_name,
        senderEmail: ticket.sender_email,
        closedAt: ticket.closed_at,
        resolutionSummary: resolutionSummary || 'No resolution summary available',
        confidence: ticket.confidence || 'low',
        autoClose: ticket.auto_close || false
      };
    });
    
    // Calculate total pages
    const totalCount = resolvedTickets.length > 0 ? parseInt(resolvedTickets[0].total_count as string, 10) : 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    return NextResponse.json({
      tickets: formattedTickets,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages
      },
      totalPages
    });
  } catch (error) {
    console.error('Error retrieving resolved tickets:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 