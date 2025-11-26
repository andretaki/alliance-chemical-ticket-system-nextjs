import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identityService } from '@/services/crm/identityService';
import { rateLimiters } from '@/lib/rateLimiting';

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

    const customer = await identityService.resolveOrCreateCustomer({
      provider: 'self_reported',
      email: parsed.email,
      phone: parsed.phone || undefined,
      firstName: parsed.firstName || undefined,
      lastName: parsed.lastName || undefined,
      company: parsed.company || undefined,
      metadata: parsed.orderNumber ? { orderNumber: parsed.orderNumber } : undefined,
    });

    await identityService.recordInteraction({
      customerId: customer.id,
      channel: 'self_id_form',
      direction: 'inbound',
      metadata: {
        orderNumber: parsed.orderNumber,
        source: parsed.source,
      },
    });

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      message: 'Thanks! We have linked your info.',
    });
  } catch (err: any) {
    console.error('[capture-self-id] error', err);
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to capture identity' }, { status: 500 });
  }
}
