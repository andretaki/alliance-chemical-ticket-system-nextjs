import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

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

// In-memory fallback store (only used if KV unavailable)
const fallbackStore: RateLimitStore = {};

// Track cleanup interval to prevent memory leaks in serverless
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Start cleanup only when fallback store is actually used
function ensureCleanupRunning() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keys = Object.keys(fallbackStore);

    // If store is empty, stop the interval to save resources
    if (keys.length === 0) {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      return;
    }

    keys.forEach(key => {
      if (fallbackStore[key].resetTime < now) {
        delete fallbackStore[key];
      }
    });
  }, 60 * 1000); // Check every minute instead of 10 minutes

  // Ensure cleanup doesn't prevent process exit in serverless
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

export class RateLimiter {
  private config: RateLimitConfig;
  private useKV: boolean = true;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check rate limit using Vercel KV (distributed) or fallback to in-memory
   */
  async check(identifier: string): Promise<{ allowed: boolean; resetTime: number; remaining: number }> {
    const now = Date.now();
    const key = `ratelimit:${identifier}`;
    const resetKey = `ratelimit:reset:${identifier}`;

    try {
      // Try to use Vercel KV for distributed rate limiting
      if (this.useKV) {
        // Use atomic INCR operation with separate reset time tracking
        const resetTime = await kv.get<number>(resetKey);

        if (!resetTime || resetTime < now) {
          // First request or window expired - initialize new window
          const newResetTime = now + this.config.windowMs;

          // Use pipeline for atomic multi-operation
          const pipeline = kv.pipeline();
          pipeline.set(key, 1, { px: this.config.windowMs });
          pipeline.set(resetKey, newResetTime, { px: this.config.windowMs });
          await pipeline.exec();

          return {
            allowed: true,
            resetTime: newResetTime,
            remaining: this.config.maxRequests - 1
          };
        }

        // Atomically increment counter
        const count = await kv.incr(key);

        // Ensure TTL is set (in case incr created a new key)
        const ttl = await kv.pttl(key);
        if (ttl === -1) {
          await kv.pexpire(key, resetTime - now);
        }

        if (count > this.config.maxRequests) {
          // Rate limit exceeded
          return {
            allowed: false,
            resetTime: resetTime,
            remaining: 0
          };
        }

        return {
          allowed: true,
          resetTime: resetTime,
          remaining: this.config.maxRequests - count
        };
      }
    } catch (error) {
      console.warn('[RateLimiter] KV unavailable, falling back to in-memory store:', error);
      this.useKV = false;
    }

    // Fallback to in-memory store
    return this.checkInMemory(identifier);
  }

  /**
   * Fallback in-memory rate limiter (not distributed across serverless instances)
   */
  private checkInMemory(identifier: string): { allowed: boolean; resetTime: number; remaining: number } {
    // Start cleanup interval when fallback store is used
    ensureCleanupRunning();

    const now = Date.now();
    const key = `${identifier}`;

    if (!fallbackStore[key] || fallbackStore[key].resetTime < now) {
      // First request or window expired
      fallbackStore[key] = {
        count: 1,
        resetTime: now + this.config.windowMs
      };
      return {
        allowed: true,
        resetTime: fallbackStore[key].resetTime,
        remaining: this.config.maxRequests - 1
      };
    }

    if (fallbackStore[key].count >= this.config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        resetTime: fallbackStore[key].resetTime,
        remaining: 0
      };
    }

    // Increment counter
    fallbackStore[key].count++;
    return {
      allowed: true,
      resetTime: fallbackStore[key].resetTime,
      remaining: this.config.maxRequests - fallbackStore[key].count
    };
  }

  async middleware(
    request: Request,
    getIdentifier: (req: Request) => string = (req) => this.getClientIP(req)
  ): Promise<NextResponse | null> {
    const identifier = getIdentifier(request);
    const result = await this.check(identifier);

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