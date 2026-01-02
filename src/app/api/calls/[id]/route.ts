import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, calls } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { apiSuccess, apiError } from '@/lib/apiResponse';

const UpdateCallSchema = z.object({
  notes: z.string().optional(),
  ticketId: z.number().int().nullable().optional(),
  opportunityId: z.number().int().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const callId = parseInt(idParam, 10);
    if (isNaN(callId)) {
      return apiError('validation_error', 'Invalid call ID', null, { status: 400 });
    }

    const body = await req.json();
    const parsed = UpdateCallSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid payload', parsed.error.flatten(), { status: 400 });
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
      return apiError('not_found', 'Call not found', null, { status: 404 });
    }

    return apiSuccess({ call: updated });
  } catch (err) {
    console.error('[api/calls/[id]] error', err);
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
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
      return apiError('validation_error', 'Invalid call ID', null, { status: 400 });
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
      return apiError('not_found', 'Call not found', null, { status: 404 });
    }

    return apiSuccess({ call });
  } catch (err) {
    console.error('[api/calls/[id]] error', err);
    return apiError('internal_error', 'Internal server error', null, { status: 500 });
  }
}
