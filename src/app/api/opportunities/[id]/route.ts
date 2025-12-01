import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { getOpportunityById, updateOpportunity } from '@/services/opportunityService';
import { opportunityStageEnum } from '@/lib/db';

const UpdateSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().nullable().optional(),
  stage: z.enum(opportunityStageEnum.enumValues).optional(),
  source: z.string().max(64).nullable().optional(),
  division: z.string().max(32).nullable().optional(),
  estimatedValue: z.string().nullable().optional(),
  currency: z.string().max(8).optional(),
  ownerId: z.string().nullable().optional(),
  contactId: z.number().nullable().optional(),
  shopifyDraftOrderId: z.string().nullable().optional(),
  qboEstimateId: z.string().nullable().optional(),
  lostReason: z.string().nullable().optional(),
});

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getServerSession();
  if (error || !session?.user) return json({ error: 'Unauthorized' }, 401);

  const id = Number((await params).id);
  if (Number.isNaN(id)) return json({ error: 'Invalid id' }, 400);

  const opp = await getOpportunityById(id);
  if (!opp) return json({ error: 'Not found' }, 404);
  return json(opp);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { session, error } = await getServerSession();
  if (error || !session?.user) return json({ error: 'Unauthorized' }, 401);

  const id = Number((await params).id);
  if (Number.isNaN(id)) return json({ error: 'Invalid id' }, 400);

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);

  try {
    const opp = await updateOpportunity(id, parsed.data);
    return json({ opportunity: opp });
  } catch (err: any) {
    console.error(`[PUT /api/opportunities/${id}]`, err);
    return json({ error: err?.message || 'Failed to update opportunity' }, err?.message === 'Opportunity not found' ? 404 : 500);
  }
}
