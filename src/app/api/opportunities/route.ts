import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { rateLimiters } from '@/lib/rateLimiting';
import { createOpportunity, listOpportunities } from '@/services/opportunityService';
import { opportunityStageEnum } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/apiResponse';

const CreateSchema = z.object({
  customerId: z.number(),
  contactId: z.number().nullable().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  stage: z.enum(opportunityStageEnum.enumValues).optional(),
  source: z.string().max(64).nullable().optional(),
  division: z.string().max(32).nullable().optional(),
  estimatedValue: z.string().nullable().optional(),
  currency: z.string().max(8).optional(),
  ownerId: z.string().nullable().optional(),
  shopifyDraftOrderId: z.string().nullable().optional(),
  qboEstimateId: z.string().nullable().optional(),
  lostReason: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage') || undefined;
  const ownerId = url.searchParams.get('ownerId') || undefined;
  const division = url.searchParams.get('division') || undefined;
  const customerId = url.searchParams.get('customerId');
  const search = url.searchParams.get('search') || undefined;

  const opportunities = await listOpportunities({
    stage,
    ownerId,
    division,
    customerId: customerId ? Number(customerId) : undefined,
    search,
  });

  return apiSuccess({ data: opportunities });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  const { session, error } = await getServerSession();
  if (error || !session?.user) {
    return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid input', parsed.error.flatten().fieldErrors, { status: 400 });
  }

  try {
    const opp = await createOpportunity(parsed.data);
    return apiSuccess({ opportunity: opp }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/opportunities] error', err);
    return apiError('internal_error', 'Failed to create opportunity', null, { status: 500 });
  }
}
