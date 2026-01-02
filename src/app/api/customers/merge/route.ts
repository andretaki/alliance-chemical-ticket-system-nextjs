import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { CustomerMergeResultSchema } from '@/lib/contracts';
import { customerRepository } from '@/repositories/CustomerRepository';

const MergeRequestSchema = z.object({
  primaryCustomerId: z.number().int().positive(),
  mergeCustomerIds: z.array(z.number().int().positive()).min(1),
});

export async function POST(request: Request) {
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return apiError('forbidden', 'Admin access required', undefined, { status: 403 });
  }

  const parsed = MergeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError('invalid_request', 'Invalid merge request', parsed.error.flatten(), { status: 400 });
  }

  const { primaryCustomerId, mergeCustomerIds } = parsed.data;
  if (mergeCustomerIds.includes(primaryCustomerId)) {
    return apiError('invalid_request', 'Cannot merge a customer into itself', undefined, { status: 400 });
  }

  try {
    const result = await customerRepository.mergeCustomers(primaryCustomerId, mergeCustomerIds);
    const payload = CustomerMergeResultSchema.parse(result);
    return apiSuccess(payload);
  } catch (err) {
    console.error('[customers.merge] Failed to merge customers:', err);
    return apiError('server_error', 'Failed to merge customers', undefined, { status: 500 });
  }
}
