import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { getOpportunityById, updateOpportunity } from '@/services/opportunityService';
import { opportunityStageEnum } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/apiResponse';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  const id = Number((await params).id);
  if (Number.isNaN(id)) {
    return apiError('invalid_id', 'Invalid id', null, { status: 400 });
  }

  const opp = await getOpportunityById(id);
  if (!opp) {
    return apiError('not_found', 'Not found', null, { status: 404 });
  }
  return apiSuccess(opp);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  const id = Number((await params).id);
  if (Number.isNaN(id)) {
    return apiError('invalid_id', 'Invalid id', null, { status: 400 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid input', parsed.error.flatten().fieldErrors, { status: 400 });
  }

  try {
    const opp = await updateOpportunity(id, parsed.data);
    return apiSuccess({ opportunity: opp });
  } catch (err: any) {
    console.error(`[PUT /api/opportunities/${id}]`, err);
    const status = err?.message === 'Opportunity not found' ? 404 : 500;
    const code = status === 404 ? 'not_found' : 'internal_error';
    return apiError(code, err?.message || 'Failed to update opportunity', null, { status });
  }
}
