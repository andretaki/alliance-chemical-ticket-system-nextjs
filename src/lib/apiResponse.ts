import { NextResponse } from 'next/server';
import type { ApiResponse } from '@/lib/contracts';

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data } as ApiResponse<T>, init);
}

export function apiError(
  code: string,
  message: string,
  details?: unknown,
  init?: ResponseInit
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    } as ApiResponse<never>,
    { status: init?.status ?? 400, headers: init?.headers }
  );
}
