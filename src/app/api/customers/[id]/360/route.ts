import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth-helpers';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { customerRepository } from '@/repositories/CustomerRepository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RouteParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Customer ID must be a number'),
});

/**
 * GET /api/customers/[id]/360
 *
 * Returns a complete Customer 360 view including:
 * - Customer profile with all identities
 * - Orders from all providers (Shopify, Amazon, QBO)
 * - Shipments with tracking
 * - Recent tickets
 * - Interaction history
 * - Aggregated statistics
 *
 * Uses standardized API response format with apiSuccess/apiError.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  // Auth check
  const { session, error } = await getServerSession();
  if (error || !session?.user?.id) {
    return apiError('unauthorized', error || 'Unauthorized', undefined, { status: 401 });
  }

  // Validate route params
  const { id } = await context.params;
  const parsed = RouteParamsSchema.safeParse({ id });
  if (!parsed.success) {
    return apiError('invalid_request', 'Invalid customer ID', parsed.error.flatten(), { status: 400 });
  }

  const customerId = parseInt(parsed.data.id, 10);

  try {
    const data = await customerRepository.getCustomer360(customerId);
    if (!data) {
      return apiError('not_found', 'Customer not found', undefined, { status: 404 });
    }

    return apiSuccess(data);
  } catch (err) {
    console.error('[customers.360] Failed to fetch customer 360:', err);
    return apiError('server_error', 'Failed to fetch customer data', undefined, { status: 500 });
  }
}
