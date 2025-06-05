import { NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (use Redis in production for multi-instance apps)
const store: RateLimitStore = {};

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 10 * 60 * 1000);

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  check(identifier: string): { allowed: boolean; resetTime: number; remaining: number } {
    const now = Date.now();
    const key = `${identifier}`;
    
    if (!store[key] || store[key].resetTime < now) {
      // First request or window expired
      store[key] = {
        count: 1,
        resetTime: now + this.config.windowMs
      };
      return {
        allowed: true,
        resetTime: store[key].resetTime,
        remaining: this.config.maxRequests - 1
      };
    }

    if (store[key].count >= this.config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        resetTime: store[key].resetTime,
        remaining: 0
      };
    }

    // Increment counter
    store[key].count++;
    return {
      allowed: true,
      resetTime: store[key].resetTime,
      remaining: this.config.maxRequests - store[key].count
    };
  }

  async middleware(
    request: Request,
    getIdentifier: (req: Request) => string = (req) => this.getClientIP(req)
  ): Promise<NextResponse | null> {
    const identifier = getIdentifier(request);
    const result = this.check(identifier);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(result.resetTime).toISOString()
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': this.config.maxRequests.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.resetTime.toString()
          }
        }
      );
    }

    return null; // Allow request to proceed
  }

  private getClientIP(request: Request): string {
    // Get IP from various headers (Vercel, CloudFlare, etc.)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const vercelIP = request.headers.get('x-vercel-forwarded-for');
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    if (realIP) {
      return realIP;
    }
    if (vercelIP) {
      return vercelIP;
    }
    
    return 'unknown';
  }
}

// Predefined rate limiters for common use cases
export const rateLimiters = {
  // General API protection
  api: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100 // 100 requests per 15 minutes
  }),

  // Authentication endpoints (stricter)
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 login attempts per 15 minutes
  }),

  // Webhook endpoints (more lenient)
  webhook: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 50 // 50 webhook requests per minute
  }),

  // Email processing (prevent spam)
  email: new RateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10 // 10 emails processed per 5 minutes per IP
  }),

  // Admin endpoints (very strict)
  admin: new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50 // 50 admin requests per hour
  })
};

// Helper function to apply rate limiting
export async function withRateLimit(
  request: Request,
  limiter: RateLimiter,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const rateLimitResponse = await limiter.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return handler();
} 