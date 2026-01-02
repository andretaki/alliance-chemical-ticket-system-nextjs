import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { identityService } from '@/services/crm/identityService';
import { rateLimiters } from '@/lib/rateLimiting';
import { apiSuccess, apiError } from '@/lib/apiResponse';

const CaptureSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  orderNumber: z.string().optional().nullable(),
  source: z.string().optional().default('self_id_form'),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const json = await request.json();
    const parsed = CaptureSchema.parse(json);

    const customerResult = await identityService.resolveOrCreateCustomer({
      provider: 'self_reported',
      email: parsed.email,
      phone: parsed.phone || undefined,
      firstName: parsed.firstName || undefined,
      lastName: parsed.lastName || undefined,
      company: parsed.company || undefined,
      metadata: parsed.orderNumber ? { orderNumber: parsed.orderNumber } : undefined,
    });

    // Handle potential array type from Drizzle ORM relation inference
    const customer = Array.isArray(customerResult) ? customerResult[0] : customerResult;

    await identityService.recordInteraction({
      customerId: customer.id,
      channel: 'self_id_form',
      direction: 'inbound',
      metadata: {
        orderNumber: parsed.orderNumber,
        source: parsed.source,
      },
    });

    return apiSuccess({
      customerId: customer.id,
      message: 'Thanks! We have linked your info.',
    });
  } catch (err: any) {
    console.error('[capture-self-id] error', err);
    if (err?.name === 'ZodError') {
      return apiError('validation_error', 'Invalid input', err.issues, { status: 400 });
    }
    return apiError('internal_error', 'Failed to capture identity', null, { status: 500 });
  }
}
