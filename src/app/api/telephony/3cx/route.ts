import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordCallEnded, recordCallStarted } from '@/services/telephony/TelephonyService';

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

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = EventSchema.safeParse(body);
    if (!parsed.success) {
      console.warn('[telephony/3cx] invalid payload', parsed.error.flatten());
      return json({ ok: false, error: 'invalid payload' }, 400);
    }

    const payload = parsed.data;
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
      console.warn('[telephony/3cx] unknown eventType', payload.eventType);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[telephony/3cx] error', err);
    return json({ ok: false }, 200);
  }
}
