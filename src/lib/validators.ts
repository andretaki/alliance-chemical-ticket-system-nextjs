/**
 * Input validation utilities for the CRM system
 * Provides robust validation to prevent injection attacks and invalid data
 */

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates and parses a ticket ID from string input
 * @throws ValidationError if ID is invalid
 */
export function validateTicketId(id: string | undefined): number {
  if (!id) {
    throw new ValidationError('Ticket ID is required', 'id');
  }

  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    throw new ValidationError('Ticket ID must be a valid number', 'id');
  }

  if (numId < 1) {
    throw new ValidationError('Ticket ID must be positive', 'id');
  }

  if (numId > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError('Ticket ID exceeds maximum value', 'id');
  }

  return numId;
}

/**
 * Validates and parses a user ID from string input
 * @throws ValidationError if ID is invalid
 */
export function validateUserId(id: string | undefined): number {
  if (!id) {
    throw new ValidationError('User ID is required', 'userId');
  }

  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    throw new ValidationError('User ID must be a valid number', 'userId');
  }

  if (numId < 1) {
    throw new ValidationError('User ID must be positive', 'userId');
  }

  if (numId > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError('User ID exceeds maximum value', 'userId');
  }

  return numId;
}

/**
 * Validates and parses an attachment ID from string input
 * @throws ValidationError if ID is invalid
 */
export function validateAttachmentId(id: string | undefined): number {
  if (!id) {
    throw new ValidationError('Attachment ID is required', 'attachmentId');
  }

  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    throw new ValidationError('Attachment ID must be a valid number', 'attachmentId');
  }

  if (numId < 1) {
    throw new ValidationError('Attachment ID must be positive', 'attachmentId');
  }

  if (numId > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError('Attachment ID exceeds maximum value', 'attachmentId');
  }

  return numId;
}

/**
 * Validates pagination parameters
 * @returns Validated and bounded pagination values
 */
export function validatePagination(params: {
  page?: string | number;
  limit?: string | number;
}): { page: number; limit: number } {
  let page = 1;
  let limit = 50;

  if (params.page !== undefined) {
    const parsedPage = typeof params.page === 'string' ? parseInt(params.page, 10) : params.page;
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new ValidationError('Page must be a positive number', 'page');
    }
    if (parsedPage > 10000) {
      throw new ValidationError('Page number too large', 'page');
    }
    page = parsedPage;
  }

  if (params.limit !== undefined) {
    const parsedLimit = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit;
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new ValidationError('Limit must be a positive number', 'limit');
    }
    if (parsedLimit > 100) {
      throw new ValidationError('Limit cannot exceed 100', 'limit');
    }
    limit = parsedLimit;
  }

  // Validate maximum offset to prevent performance issues
  const offset = (page - 1) * limit;
  const MAX_OFFSET = 10000; // Allow max 10K records deep

  if (offset > MAX_OFFSET) {
    throw new ValidationError(
      `Cannot access records beyond position ${MAX_OFFSET}. Use filters to narrow results.`,
      'page'
    );
  }

  return { page, limit };
}

/**
 * Escapes SQL LIKE special characters to prevent wildcard injection
 * Escapes: % _ [ ] \ (LIKE wildcards and character classes)
 */
export function escapeLike(str: string): string {
  return str.replace(/[%_\[\]\\]/g, '\\$&');
}

/**
 * Sanitizes search terms to prevent SQL injection in LIKE queries
 * Escapes special characters and enforces reasonable length limits
 */
export function sanitizeSearchTerm(term: string | undefined): string {
  if (!term) {
    return '';
  }

  // Enforce maximum length
  const maxLength = 200;
  let sanitized = term.substring(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Escape LIKE wildcards to prevent injection
  sanitized = escapeLike(sanitized);

  return sanitized;
}

/**
 * Validates email domain against whitelist/blacklist
 * Prevents spam and unauthorized external user creation
 */
export function validateEmailDomain(email: string, options?: {
  whitelist?: string[];
  blacklist?: string[];
}): boolean {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return false;
  }

  // Check blacklist first
  if (options?.blacklist?.includes(domain)) {
    return false;
  }

  // If whitelist exists, domain must be in it
  if (options?.whitelist && options.whitelist.length > 0) {
    return options.whitelist.includes(domain);
  }

  // Common spam domains blacklist
  const defaultBlacklist = [
    'tempmail.com',
    'throwaway.email',
    'guerrillamail.com',
    'mailinator.com',
    '10minutemail.com'
  ];

  return !defaultBlacklist.includes(domain);
}

/**
 * Validates and sanitizes phone number input
 */
export function validatePhoneNumber(phone: string | undefined): string | null {
  if (!phone) {
    return null;
  }

  // Remove all non-digit characters except + at start
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Validate length (must be between 10 and 15 digits)
  const digitCount = cleaned.replace(/\+/g, '').length;
  if (digitCount < 10 || digitCount > 15) {
    throw new ValidationError('Phone number must be between 10 and 15 digits', 'phone');
  }

  return cleaned;
}

/**
 * Validates Shopify ID format (numeric string or gid://...)
 */
export function validateShopifyId(id: string | undefined): string {
  if (!id) {
    throw new ValidationError('Shopify ID is required', 'shopifyId');
  }

  // Allow numeric IDs
  if (/^\d+$/.test(id)) {
    return id;
  }

  // Allow GID format
  if (id.startsWith('gid://shopify/')) {
    return id;
  }

  throw new ValidationError('Invalid Shopify ID format', 'shopifyId');
}

/**
 * Sanitizes HTML content from emails to prevent XSS
 * Uses DOMPurify for robust sanitization
 */
export function sanitizeHtmlContent(html: string | undefined): string {
  if (!html) {
    return '';
  }

  // Import SecurityValidator from security.ts
  const { SecurityValidator } = require('@/lib/security');

  // Use the email-specific sanitization from SecurityValidator
  return SecurityValidator.sanitizeEmailContent(html);
}

/**
 * Validates merge operation to prevent cycles
 * @param db Database instance
 * @param ticketId Source ticket ID
 * @param targetId Target ticket ID to merge into
 */
export async function validateTicketMerge(
  db: any,
  ticketId: number,
  targetId: number
): Promise<void> {
  if (ticketId === targetId) {
    throw new ValidationError('Cannot merge ticket into itself', 'targetId');
  }

  // Import tickets from db schema
  const { tickets } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');

  // Check for circular reference by traversing merge chain
  const visited = new Set<number>();
  let currentId: number | null = targetId;
  const MAX_DEPTH = 50;
  let depth = 0;

  while (currentId !== null && depth < MAX_DEPTH) {
    if (visited.has(currentId)) {
      throw new ValidationError(
        'Cannot create circular merge reference',
        'targetId'
      );
    }

    if (currentId === ticketId) {
      throw new ValidationError(
        'Target ticket is already merged into source ticket',
        'targetId'
      );
    }

    visited.add(currentId);

    const ticket: { mergedIntoTicketId: number | null } | undefined = await db.query.tickets.findFirst({
      where: eq(tickets.id, currentId),
      columns: { mergedIntoTicketId: true }
    });

    currentId = ticket?.mergedIntoTicketId || null;
    depth++;
  }

  if (depth >= MAX_DEPTH) {
    throw new ValidationError(
      'Merge chain too deep - possible circular reference',
      'targetId'
    );
  }
}
