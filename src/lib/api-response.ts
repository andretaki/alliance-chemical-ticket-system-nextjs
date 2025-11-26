/**
 * Standardized API Response Utilities
 * Ensures consistent response format across all API routes
 */

import { NextResponse } from 'next/server';

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
  code?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
}

/**
 * Standard API response helpers
 * Use these instead of NextResponse.json directly for consistency
 */
export const apiResponse = {
  /**
   * Success response with data
   * @example
   * return apiResponse.success(ticket);
   * return apiResponse.success(ticket, { message: 'Ticket created' });
   */
  success<T>(
    data: T,
    options?: { message?: string; meta?: Record<string, unknown>; status?: number }
  ): NextResponse<SuccessResponse<T>> {
    return NextResponse.json(
      {
        success: true as const,
        data,
        ...(options?.message && { message: options.message }),
        ...(options?.meta && { meta: options.meta })
      },
      { status: options?.status ?? 200 }
    );
  },

  /**
   * Error response with message
   * @example
   * return apiResponse.error('Ticket not found', 404);
   * return apiResponse.error('Validation failed', 400, validationErrors);
   */
  error(
    message: string,
    statusCode = 400,
    details?: unknown,
    code?: string
  ): NextResponse<ErrorResponse> {
    const response: ErrorResponse = {
      success: false as const,
      error: message
    };
    if (details !== undefined) response.details = details;
    if (code !== undefined) response.code = code;
    return NextResponse.json(response, { status: statusCode });
  },

  /**
   * Paginated response with metadata
   * @example
   * return apiResponse.paginated(tickets, 150, 1, 20);
   */
  paginated<T>(
    items: T[],
    total: number,
    page: number,
    limit: number
  ): NextResponse<PaginatedResponse<T>> {
    const pages = Math.ceil(total / limit);
    const hasMore = page < pages;

    return NextResponse.json({
      success: true as const,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages,
        hasMore
      }
    });
  },

  /**
   * Created response (201)
   * @example
   * return apiResponse.created(newTicket, { message: 'Ticket created successfully' });
   */
  created<T>(data: T, options?: { message?: string }): NextResponse<SuccessResponse<T>> {
    return this.success(data, {
      status: 201,
      message: options?.message ?? 'Resource created successfully'
    });
  },

  /**
   * No content response (204)
   * @example
   * return apiResponse.noContent();
   */
  noContent(): NextResponse {
    return new NextResponse(null, { status: 204 });
  },

  /**
   * Unauthorized response (401)
   * @example
   * return apiResponse.unauthorized('Invalid credentials');
   */
  unauthorized(message = 'Unauthorized'): NextResponse<ErrorResponse> {
    return this.error(message, 401, undefined, 'UNAUTHORIZED');
  },

  /**
   * Forbidden response (403)
   * @example
   * return apiResponse.forbidden('You do not have permission to access this resource');
   */
  forbidden(message = 'Forbidden'): NextResponse<ErrorResponse> {
    return this.error(message, 403, undefined, 'FORBIDDEN');
  },

  /**
   * Not found response (404)
   * @example
   * return apiResponse.notFound('Ticket not found');
   */
  notFound(message = 'Resource not found'): NextResponse<ErrorResponse> {
    return this.error(message, 404, undefined, 'NOT_FOUND');
  },

  /**
   * Validation error response (400)
   * @example
   * return apiResponse.validationError('Invalid input', zodError.errors);
   */
  validationError(message = 'Validation failed', details?: unknown): NextResponse<ErrorResponse> {
    return this.error(message, 400, details, 'VALIDATION_ERROR');
  },

  /**
   * Conflict response (409)
   * @example
   * return apiResponse.conflict('Ticket with this ID already exists');
   */
  conflict(message: string, details?: unknown): NextResponse<ErrorResponse> {
    return this.error(message, 409, details, 'CONFLICT');
  },

  /**
   * Rate limit exceeded response (429)
   * @example
   * return apiResponse.rateLimitExceeded('Too many requests, please try again later');
   */
  rateLimitExceeded(
    message = 'Too many requests',
    retryAfter?: number
  ): NextResponse<ErrorResponse> {
    const response = this.error(message, 429, undefined, 'RATE_LIMIT_EXCEEDED');
    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter.toString());
    }
    return response;
  },

  /**
   * Internal server error response (500)
   * @example
   * return apiResponse.serverError('An unexpected error occurred');
   */
  serverError(
    message = 'Internal server error',
    details?: unknown
  ): NextResponse<ErrorResponse> {
    // Don't expose internal error details in production
    const safeDetails = process.env.NODE_ENV === 'development' ? details : undefined;
    return this.error(message, 500, safeDetails, 'INTERNAL_ERROR');
  }
} as const;

/**
 * Type guard to check if response is successful
 * @example
 * const response = await fetch('/api/tickets');
 * const json = await response.json();
 * if (isSuccessResponse(json)) {
 *   console.log(json.data); // Type-safe access
 * }
 */
export function isSuccessResponse<T = unknown>(
  response: unknown
): response is SuccessResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === true
  );
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === false
  );
}

/**
 * Type guard to check if response is paginated
 */
export function isPaginatedResponse<T = unknown>(
  response: unknown
): response is PaginatedResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === true &&
    'pagination' in response
  );
}
