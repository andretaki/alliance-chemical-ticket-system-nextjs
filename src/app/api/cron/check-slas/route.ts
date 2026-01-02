import { db, tickets, crmTasks } from '@/lib/db';
import { and, isNull, lte, eq, or, inArray } from 'drizzle-orm';
import { sendNotificationEmail } from '@/lib/email';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  try {
    const now = new Date();

    const ticketsToFlag = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        customerId: tickets.customerId,
        assigneeId: tickets.assigneeId,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.slaBreached, false),
          or(
            and(isNull(tickets.firstResponseAt), lte(tickets.firstResponseDueAt, now)),
            lte(tickets.resolutionDueAt, now)
          )
        )
      );

    if (ticketsToFlag.length === 0) {
      return apiSuccess({ breachedCount: 0, message: 'No SLA breaches found.' });
    }

    const breachedIds = ticketsToFlag.map((t) => t.id);

    // Update DB in one go
    await db
      .update(tickets)
      .set({ slaBreached: true, slaNotified: true })
      .where(inArray(tickets.id, breachedIds));

    // Create SLA_BREACH CRM tasks for each breached ticket
    const taskValues = ticketsToFlag.map((t) => ({
      customerId: t.customerId,
      ticketId: t.id,
      type: 'SLA_BREACH',
      reason: 'RESPONSE_TIME_EXCEEDED',
      status: 'open' as const,
      dueAt: new Date(),
      assignedToId: t.assigneeId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (taskValues.length > 0) {
      await db.insert(crmTasks).values(taskValues);
    }

    // Send a single summary notification to a manager
    const managerEmail = env.SLA_ALERT_EMAIL || 'manager@alliancechemical.com';
    const subject = `SLA Breach Alert: ${ticketsToFlag.length} Ticket(s) Affected`;
    const body = `<p>The following tickets have breached their SLA:</p>
                <ul>
                  ${ticketsToFlag.map((t) => `<li><a href="${env.NEXT_PUBLIC_APP_URL}/tickets/${t.id}">Ticket #${t.id}: ${t.title}</a></li>`).join('')}
                </ul>
                <p>Please review them immediately.</p>`;

    await sendNotificationEmail({
      recipientEmail: managerEmail,
      subject,
      htmlBody: body,
    });

    return apiSuccess({
      breachedCount: ticketsToFlag.length,
      breachedTicketIds: breachedIds,
    });
  } catch (err) {
    console.error('[Cron] SLA check failed:', err);
    return apiError('cron_failed', 'Failed to check SLAs', null, { status: 500 });
  }
} 