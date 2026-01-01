import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, calls } from '@/lib/db';
import { eq } from 'drizzle-orm';

const UpdateCallSchema = z.object({
  notes: z.string().optional(),
  ticketId: z.number().int().nullable().optional(),
  opportunityId: z.number().int().nullable().optional(),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const callId = parseInt(idParam, 10);
    if (isNaN(callId)) {
      return json({ error: 'Invalid call ID' }, 400);
    }

    const body = await req.json();
    const parsed = UpdateCallSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes;
    }
    if (parsed.data.ticketId !== undefined) {
      updates.ticketId = parsed.data.ticketId;
    }
    if (parsed.data.opportunityId !== undefined) {
      updates.opportunityId = parsed.data.opportunityId;
    }

    const [updated] = await db
      .update(calls)
      .set(updates)
      .where(eq(calls.id, callId))
      .returning();

    if (!updated) {
      return json({ error: 'Call not found' }, 404);
    }

    return json({ ok: true, call: updated });
  } catch (err) {
    console.error('[api/calls/[id]] error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const callId = parseInt(idParam, 10);
    if (isNaN(callId)) {
      return json({ error: 'Invalid call ID' }, 400);
    }

    const call = await db.query.calls.findFirst({
      where: eq(calls.id, callId),
      with: {
        customer: true,
        contact: true,
        ticket: true,
        opportunity: true,
      },
    });

    if (!call) {
      return json({ error: 'Call not found' }, 404);
    }

    return json({ call });
  } catch (err) {
    console.error('[api/calls/[id]] error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}
