import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { MergeCandidateSchema } from '@/lib/contracts';
import { customerRepository } from '@/repositories/CustomerRepository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return apiError('forbidden', 'Admin access required', undefined, { status: 403 });
  }

  const { id } = await context.params;
  const customerId = Number(id);
  if (Number.isNaN(customerId)) {
    return apiError('invalid_request', 'Invalid customer ID', undefined, { status: 400 });
  }

  const candidates = await customerRepository.findMergeCandidates(customerId);
  const payload = z.array(MergeCandidateSchema).parse(candidates);
  return apiSuccess(payload);
}
