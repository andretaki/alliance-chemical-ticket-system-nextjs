import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordCallEnded, recordCallStarted } from '@/services/telephony/TelephonyService';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { env } from '@/lib/env';

const WEBHOOK_SECRET = env.TELEPHONY_WEBHOOK_SECRET;

const EventSchema = z.object({
  eventType: z.enum(['started', 'ended']),
  direction: z.enum(['inbound', 'outbound']),
  provider: z.string().default('3cx'),
  providerCallId: z.string().optional(),
  fromNumber: z.string(),
  toNumber: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  recordingUrl: z.string().optional(),
});

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
) {
  const entry = {
    channel: 'telephony',
    provider: '3cx',
    timestamp: new Date().toISOString(),
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error('[telephony/3cx]', JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn('[telephony/3cx]', JSON.stringify(entry));
  } else {
    console.log('[telephony/3cx]', JSON.stringify(entry));
  }
}

export async function POST(req: NextRequest) {
  // Validate webhook secret if configured
  if (WEBHOOK_SECRET) {
    const providedSecret = req.headers.get('x-telephony-secret');
    if (!providedSecret) {
      log('error', 'Missing X-Telephony-Secret header', {
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });
      return apiError('unauthorized', 'unauthorized', null, { status: 401 });
    }
    if (providedSecret !== WEBHOOK_SECRET) {
      log('error', 'Invalid X-Telephony-Secret header', {
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });
      return apiError('unauthorized', 'unauthorized', null, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const parsed = EventSchema.safeParse(body);
    if (!parsed.success) {
      log('warn', 'Invalid payload', {
        errors: parsed.error.flatten(),
        bodySnapshot: JSON.stringify(body).slice(0, 200),
      });
      return apiError('validation_error', 'invalid payload', null, { status: 400 });
    }

    const payload = parsed.data;
    log('info', `Processing ${payload.eventType} event`, {
      providerCallId: payload.providerCallId,
      direction: payload.direction,
      fromNumber: payload.fromNumber?.slice(-4),
      toNumber: payload.toNumber?.slice(-4),
    });

    if (payload.eventType === 'started') {
      await recordCallStarted({
        provider: payload.provider,
        providerCallId: payload.providerCallId,
        direction: payload.direction,
        fromNumber: payload.fromNumber,
        toNumber: payload.toNumber,
        startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
      });
    } else if (payload.eventType === 'ended') {
      await recordCallEnded({
        provider: payload.provider,
        providerCallId: payload.providerCallId,
        endedAt: payload.endedAt ? new Date(payload.endedAt) : new Date(),
        durationSeconds: payload.durationSeconds,
        recordingUrl: payload.recordingUrl,
      });
    } else {
      log('warn', 'Unknown eventType', { eventType: payload.eventType });
    }

    return apiSuccess({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log('error', 'Unhandled error processing webhook', { error });
    // Return 200 to prevent 3CX from retrying on internal errors
    return apiSuccess({ ok: false });
  }
}
