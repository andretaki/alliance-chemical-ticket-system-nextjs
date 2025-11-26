import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimiters } from "@/lib/rateLimiting";
import { NextRequest } from "next/server";

const { POST: AuthPOST, GET: AuthGET } = toNextJsHandler(auth);

// Wrap POST with rate limiting (auth endpoints like sign-in, sign-up)
export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.auth.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return AuthPOST(request);
}

// Wrap GET with a more lenient rate limiter (session checks, etc.)
export async function GET(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.api.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return AuthGET(request);
} 