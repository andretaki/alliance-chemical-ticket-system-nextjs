import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // Correct path to your options
import { rateLimiters } from '@/lib/rateLimiting';

const handler = NextAuth(authOptions);

// Add rate limiting to auth endpoints
async function withRateLimit(request: Request, handler: () => Promise<Response>) {
  const rateLimitResponse = await rateLimiters.auth.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return handler();
}

export async function GET(request: Request) {
  return withRateLimit(request, () => handler(request));
}

export async function POST(request: Request) {
  return withRateLimit(request, () => handler(request));
} 