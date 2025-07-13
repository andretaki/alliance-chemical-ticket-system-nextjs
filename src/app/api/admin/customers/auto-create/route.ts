import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-helpers';
import { db, tickets, users } from '@/lib/db';
import { and, isNotNull, gte, eq, sql, count } from 'drizzle-orm';
import { customerAutoCreateService } from '@/services/customerAutoCreateService';

// POST: Batch create customers from existing tickets
export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user?.id || !['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      createFromExisting = false, 
      limitToRecent = true, 
      daysBack = 30,
      dryRun = false 
    } = body;

    console.log(`[Admin CustomerAutoCreate] Starting ${dryRun ? 'dry run' : 'actual'} batch creation process`);

    if (!createFromExisting) {
      return NextResponse.json({ 
        error: 'This endpoint is for creating customers from existing tickets. Set createFromExisting=true.' 
      }, { status: 400 });
    }

    // Build query conditions
    const conditions = [isNotNull(tickets.senderEmail)];
    
    if (limitToRecent) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      conditions.push(gte(tickets.createdAt, cutoffDate));
    }

    // Fetch tickets with customer information
    const ticketsToProcess = await db.query.tickets.findMany({
      where: and(...conditions),
      columns: {
        id: true,
        senderEmail: true,
        senderName: true,
        senderPhone: true,
        sendercompany: true,
        externalMessageId: true,
        createdAt: true
      },
      orderBy: (tickets, { desc }) => [desc(tickets.createdAt)],
      limit: 500 // Safety limit
    });

    console.log(`[Admin CustomerAutoCreate] Found ${ticketsToProcess.length} tickets with customer emails`);

    if (dryRun) {
      // Return what would be processed without actually doing it
      const preview = ticketsToProcess.slice(0, 10).map(ticket => ({
        ticketId: ticket.id,
        email: ticket.senderEmail,
        name: ticket.senderName,
        phone: ticket.senderPhone,
        company: ticket.sendercompany,
        source: ticket.externalMessageId ? 'email' : 'ticket',
        createdAt: ticket.createdAt
      }));

      return NextResponse.json({
        dryRun: true,
        totalTickets: ticketsToProcess.length,
        preview,
        message: `Would process ${ticketsToProcess.length} tickets. Set dryRun=false to execute.`
      });
    }

    // Prepare customer data for batch creation
    const customersToCreate = ticketsToProcess.map(ticket => {
      let firstName: string | undefined;
      let lastName: string | undefined;
      
      if (ticket.senderName) {
        const nameParts = ticket.senderName.trim().split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ') || undefined;
      }

      return {
        email: ticket.senderEmail!,
        firstName,
        lastName,
        phone: ticket.senderPhone || undefined,
        company: ticket.sendercompany || undefined,
        ticketId: ticket.id,
        source: ticket.externalMessageId ? 'email' as const : 'ticket' as const
      };
    });

    // Execute batch creation
    const result = await customerAutoCreateService.batchCreateCustomers(customersToCreate);

    console.log(`[Admin CustomerAutoCreate] Batch creation completed: ${result.success} created, ${result.failed} failed, ${result.skipped} skipped`);

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: customersToCreate.length,
        customersCreated: result.success,
        customersFailed: result.failed,
        customersSkipped: result.skipped
      },
      details: result.results.slice(0, 20) // Return first 20 detailed results
    });

  } catch (error: any) {
    console.error('[Admin CustomerAutoCreate] Error in batch creation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create customers' },
      { status: 500 }
    );
  }
}

// GET: Get status and configuration
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isEnabled = customerAutoCreateService.isAutoCreateEnabled();
    
    // Get some stats about tickets with customer emails
    const totalTicketsWithEmailsResult = await db.select({ count: count() }).from(tickets).where(isNotNull(tickets.senderEmail));
    const totalTicketsWithEmails = totalTicketsWithEmailsResult[0]?.count || 0;
    
    // Get recent tickets (last 30 days) with emails
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTicketsWithEmailsResult = await db.select({ count: count() }).from(tickets).where(
      and(
        isNotNull(tickets.senderEmail),
        gte(tickets.createdAt, thirtyDaysAgo)
      )
    );
    const recentTicketsWithEmails = recentTicketsWithEmailsResult[0]?.count || 0;

    return NextResponse.json({
      autoCreateEnabled: isEnabled,
      statistics: {
        totalTicketsWithEmails,
        recentTicketsWithEmails,
        lastChecked: new Date().toISOString()
      },
      configuration: {
        enabledViaEnv: process.env.SHOPIFY_AUTO_CREATE_CUSTOMERS !== 'false'
      }
    });

  } catch (error: any) {
    console.error('[Admin CustomerAutoCreate] Error getting status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    );
  }
} 