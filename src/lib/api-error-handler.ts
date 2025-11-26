/**
 * Centralized Error Handling for API Routes
 * Eliminates the need for try-catch in every route handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from './api-response';
import { ValidationError } from './validators';

/**
 * Custom application error class
 * Use this for known, operational errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Factory methods for common errors
   */
  static notFound(resource = 'Resource', details?: unknown): AppError {
    return new AppError(`${resource} not found`, 404, true, 'NOT_FOUND', details);
  }

  static unauthorized(message = 'Unauthorized', details?: unknown): AppError {
    return new AppError(message, 401, true, 'UNAUTHORIZED', details);
  }

  static forbidden(message = 'Forbidden', details?: unknown): AppError {
    return new AppError(message, 403, true, 'FORBIDDEN', details);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, true, 'BAD_REQUEST', details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, true, 'CONFLICT', details);
  }

  static internal(message = 'Internal server error', details?: unknown): AppError {
    return new AppError(message, 500, false, 'INTERNAL_ERROR', details);
  }
}

/**
 * Route handler type with context
 */
type RouteHandler<TParams = any> = (
  request: NextRequest,
  context: { params: Promise<TParams> | TParams }
) => Promise<NextResponse>;

/**
 * Async handler wrapper
 * Automatically catches errors and returns standardized error responses
 *
 * @example
 * export const GET = asyncHandler(async (req, { params }) => {
 *   const ticket = await TicketService.getById(params.id);
 *   if (!ticket) throw AppError.notFound('Ticket');
 *   return apiResponse.success(ticket);
 * });
 */
export function asyncHandler<TParams = any>(
  handler: RouteHandler<TParams>
): RouteHandler<TParams> {
  return async (request: NextRequest, context: { params: Promise<TParams> | TParams }) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleError(error, request);
    }
  };
}

/**
 * Central error handler
 * Converts all error types to standardized API responses
 */
function handleError(error: unknown, request: NextRequest): NextResponse {
  // Log error for debugging
  const requestInfo = {
    method: request.method,
    url: request.url,
    timestamp: new Date().toISOString()
  };

  // Known operational errors (AppError)
  if (error instanceof AppError) {
    console.error('AppError:', {
      ...requestInfo,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details: error.details
      }
    });

    return apiResponse.error(error.message, error.statusCode, error.details, error.code);
  }

  // Zod validation errors
  if (error instanceof z.ZodError) {
    console.error('ZodError:', {
      ...requestInfo,
      errors: error.errors
    });

    return apiResponse.validationError('Validation failed', {
      issues: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }))
    });
  }

  // Custom validation errors (from validators.ts)
  if (error instanceof ValidationError) {
    console.error('ValidationError:', {
      ...requestInfo,
      error: error.message
    });

    return apiResponse.validationError(error.message);
  }

  // Database errors
  if (isDatabaseError(error)) {
    console.error('DatabaseError:', {
      ...requestInfo,
      error: {
        message: error.message,
        code: error.code
      }
    });

    // Don't expose internal DB errors to clients
    return apiResponse.serverError('Database operation failed');
  }

  // Network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    console.error('NetworkError:', {
      ...requestInfo,
      error: error.message
    });

    return apiResponse.serverError('External service unavailable');
  }

  // Generic errors (unexpected)
  console.error('UnhandledError:', {
    ...requestInfo,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error
  });

  // In production, don't expose internal error details
  const message = process.env.NODE_ENV === 'development' && error instanceof Error
    ? error.message
    : 'An unexpected error occurred';

  return apiResponse.serverError(message);
}

/**
 * Type guard for database errors
 * Handles Postgres/Drizzle specific errors
 */
function isDatabaseError(error: unknown): error is { message: string; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'constraint' in error)
  );
}

/**
 * Middleware wrapper for additional error context
 * Useful for adding request tracing, user context, etc.
 */
export function withErrorContext(handler: RouteHandler, context?: Record<string, unknown>) {
  return asyncHandler(async (req, routeContext) => {
    try {
      return await handler(req, routeContext);
    } catch (error) {
      // Add additional context to error before re-throwing
      if (error instanceof AppError && context) {
        throw new AppError(
          error.message,
          error.statusCode,
          error.isOperational,
          error.code,
          { ...(error.details as Record<string, unknown>), ...context }
        );
      }
      throw error;
    }
  });
}

/**
 * Assert condition is true, otherwise throw error
 * Useful for inline assertions
 *
 * @example
 * const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
 * assert(ticket, AppError.notFound('Ticket'));
 * // ticket is now non-null
 */
export function assert(condition: unknown, error: Error | string): asserts condition {
  if (!condition) {
    throw typeof error === 'string' ? new AppError(error) : error;
  }
}

/**
 * Helper to safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}
