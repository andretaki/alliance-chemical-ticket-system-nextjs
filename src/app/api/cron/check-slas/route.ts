import { NextResponse } from 'next/server';
import { db, tickets } from '@/lib/db';
import { and, isNull, lte, eq, or, inArray } from 'drizzle-orm';
import { sendNotificationEmail } from '@/lib/email'; // Assuming this exists

export async function GET(request: Request) {
  // Simple cron job secret validation
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  
  const ticketsToFlag = await db.select({
      id: tickets.id,
      title: tickets.title
  }).from(tickets).where(
    and(
      eq(tickets.slaBreached, false),
      or(
        and(isNull(tickets.firstResponseAt), lte(tickets.firstResponseDueAt, now)),
        lte(tickets.resolutionDueAt, now)
      )
    )
  );

  if (ticketsToFlag.length === 0) {
    return NextResponse.json({ success: true, message: 'No SLA breaches found.' });
  }

  const breachedIds = ticketsToFlag.map(t => t.id);

  // Update DB in one go
  await db.update(tickets)
    .set({ slaBreached: true, slaNotified: true }) // Also set notified to prevent re-alerting
    .where(inArray(tickets.id, breachedIds));
    
  // Send a single summary notification to a manager (more efficient than individual emails)
  const managerEmail = process.env.SLA_ALERT_EMAIL || 'manager@alliancechemical.com';
  const subject = `🚨 SLA Breach Alert: ${ticketsToFlag.length} Ticket(s) Affected`;
  const body = `<p>The following tickets have breached their SLA:</p>
                <ul>
                  ${ticketsToFlag.map(t => `<li><a href="${process.env.NEXT_PUBLIC_APP_URL}/tickets/${t.id}">Ticket #${t.id}: ${t.title}</a></li>`).join('')}
                </ul>
                <p>Please review them immediately.</p>`;

  await sendNotificationEmail({
    recipientEmail: managerEmail,
    subject,
    htmlBody: body,
  });

  return NextResponse.json({
    success: true,
    message: `Flagged ${ticketsToFlag.length} tickets for SLA breach and notified manager.`,
    breachedTicketIds: breachedIds,
  });
} 