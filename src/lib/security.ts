import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import crypto from 'crypto';
import { env } from '@/lib/env';

// Input validation schemas
export const securitySchemas = {
  email: z.string().email().max(255),
  allianceEmail: z.string().email().max(255).refine(
    (email) => email.toLowerCase().endsWith('@alliancechemical.com'),
    { message: 'Only @alliancechemical.com email addresses are allowed' }
  ),
  password: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s'-]+$/),
  id: z.string().uuid(),
  phoneNumber: z.string().regex(/^\+?[\d\s-()]+$/).max(20),
  url: z.string().url().max(500),
  token: z.string().min(20).max(500),
};

// SQL Injection protection patterns
const sqlInjectionPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
  /(--|\/\*|\*\/|;|\||&)/,
  /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
  /('|(\\x27)|(\\x2D\\x2D))/,
];

// XSS protection patterns
const xssPatterns = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<link/gi,
  /<meta/gi,
];

// LDAP Injection patterns
const ldapInjectionPatterns = [
  /[()=*!|&]/,
  /\\[0-9a-fA-F]{2}/,
];

export class SecurityValidator {
  
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });
  }

  /**
   * Strict HTML sanitization for AI-generated content and untrusted sources
   */
  static strictSanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      FORBID_ATTR: ['style', 'class', 'id'],
      FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'img'],
      USE_PROFILES: { html: true }
    });
  }

  /**
   * Sanitize email content with balanced security and functionality
   */
  static sanitizeEmailContent(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'b', 'i', 'ul', 'ol', 'li', 'div', 'span'],
      ALLOWED_ATTR: ['class'],
      KEEP_CONTENT: true,
      FORBID_ATTR: ['style', 'id', 'onclick', 'onload', 'onerror'],
      FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'img', 'iframe'],
      ADD_ATTR: ['target'],
      ADD_TAGS: ['a'],
      CUSTOM_ELEMENT_HANDLING: {
        tagNameCheck: /^[a-z][a-z0-9]*$/,
        attributeNameCheck: /^[a-z][a-z0-9]*$/,
      }
    });
  }

  /**
   * Validate and sanitize text input
   */
  static sanitizeText(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    // Trim and limit length
    let sanitized = input.trim().substring(0, maxLength);
    
    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');
    
    // Basic XSS protection
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    return sanitized;
  }

  /**
   * Check for SQL injection patterns
   */
  static detectSqlInjection(input: string): boolean {
    return sqlInjectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for XSS patterns
   */
  static detectXss(input: string): boolean {
    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Check for LDAP injection patterns
   */
  static detectLdapInjection(input: string): boolean {
    return ldapInjectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Comprehensive input validation
   */
  static validateInput(input: string, type: 'text' | 'email' | 'password' | 'name' | 'id' | 'phone' | 'url'): {
    isValid: boolean;
    sanitized: string;
    errors: string[];
  } {
    const errors: string[] = [];
    let sanitized = input;

    try {
      // Type-specific validation
      switch (type) {
        case 'email':
          securitySchemas.email.parse(input);
          break;
        case 'password':
          securitySchemas.password.parse(input);
          break;
        case 'name':
          securitySchemas.name.parse(input);
          sanitized = this.sanitizeText(input, 100);
          break;
        case 'id':
          securitySchemas.id.parse(input);
          break;
        case 'phone':
          securitySchemas.phoneNumber.parse(input);
          break;
        case 'url':
          securitySchemas.url.parse(input);
          break;
        case 'text':
        default:
          sanitized = this.sanitizeText(input);
          break;
      }

      // Check for malicious patterns
      if (this.detectSqlInjection(input)) {
        errors.push('Potential SQL injection detected');
      }
      
      if (this.detectXss(input)) {
        errors.push('Potential XSS attack detected');
      }
      
      if (this.detectLdapInjection(input)) {
        errors.push('Potential LDAP injection detected');
      }

    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        errors.push(...validationError.errors.map(e => e.message));
      } else {
        errors.push('Validation failed');
      }
    }

    return {
      isValid: errors.length === 0,
      sanitized,
      errors
    };
  }

  /**
   * Validate file uploads
   */
  static validateFileUpload(file: File, options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  } = {}): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf']
    } = options;

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
    }

    // Check file type
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      errors.push(`File extension ${extension} is not allowed`);
    }

    // Check for potentially dangerous file names
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
      errors.push('File name contains potentially dangerous characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Advanced file validation with signature checking
   */
  static async validateFileSignature(file: File): Promise<{ isValid: boolean; detectedType?: string; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Check file signatures (magic numbers)
      const signatures = {
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47],
        'image/gif': [0x47, 0x49, 0x46],
        'application/pdf': [0x25, 0x50, 0x44, 0x46],
        'application/zip': [0x50, 0x4B], // Also covers Office docs
      };

      let detectedType: string | undefined;
      
      for (const [mimeType, signature] of Object.entries(signatures)) {
        if (signature.every((byte, index) => bytes[index] === byte)) {
          detectedType = mimeType;
          break;
        }
      }

      // Special handling for Office documents (they're ZIP files)
      if (detectedType === 'application/zip' && file.name.match(/\.(docx|xlsx|pptx)$/i)) {
        detectedType = file.type; // Trust the declared type for Office docs
      }

      // Validate that detected type matches declared type
      if (detectedType && detectedType !== file.type && !file.type.includes('officedocument')) {
        errors.push(`File signature mismatch: detected ${detectedType}, declared ${file.type}`);
      }

      // Check for potentially dangerous embedded content
      const fileContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 1024));
      if (fileContent.includes('<script') || fileContent.includes('javascript:') || fileContent.includes('data:')) {
        errors.push('File contains potentially malicious content');
      }

      return {
        isValid: errors.length === 0,
        detectedType,
        errors
      };
    } catch (error) {
      errors.push('Failed to validate file signature');
      return {
        isValid: false,
        errors
      };
    }
  }

  /**
   * Generate cryptographically secure random token
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Hash sensitive data (for logging/storage)
   */
  static hashSensitiveData(data: string): string {
    // Simple hash for non-cryptographic purposes
    let hash = 0;
    if (data.length === 0) return hash.toString();
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: string): boolean {
    return /^[A-Za-z0-9_-]{32,}$/.test(apiKey);
  }

  /**
   * Validate Alliance Chemical email domain
   */
  static validateAllianceEmail(email: string): boolean {
    return email.toLowerCase().endsWith('@alliancechemical.com');
  }

  /**
   * Rate limit key generator
   */
  static generateRateLimitKey(ip: string, endpoint: string, userId?: string): string {
    const baseKey = `${ip}:${endpoint}`;
    return userId ? `${baseKey}:${userId}` : baseKey;
  }

  /**
   * Generate CSRF token
   */
  static generateCSRFToken(): string {
    return this.generateSecureToken(32);
  }

  /**
   * Validate CSRF token from request headers
   */
  static validateCSRFToken(request: Request, expectedToken: string): boolean {
    const tokenFromHeader = request.headers.get('x-csrf-token');
    const tokenFromForm = request.headers.get('x-requested-with');

    // Check for XHR header first (fast path, no timing concern)
    if (tokenFromForm === 'XMLHttpRequest') {
      return true;
    }

    // Use timing-safe comparison for CSRF token
    if (tokenFromHeader && tokenFromHeader.length === expectedToken.length) {
      return this.secureCompare(tokenFromHeader, expectedToken);
    }

    return false;
  }

  /**
   * CSRF protection middleware for API routes
   */
  static withCSRFProtection(handler: (req: Request) => Promise<Response>) {
    return async (request: Request): Promise<Response> => {
      // Skip CSRF for GET, HEAD, OPTIONS requests
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return handler(request);
      }

      // Check for CSRF token or XHR header
      const hasCSRFToken = request.headers.get('x-csrf-token');
      const isXHR = request.headers.get('x-requested-with') === 'XMLHttpRequest';
      const hasOrigin = request.headers.get('origin');

      if (!hasCSRFToken && !isXHR && hasOrigin) {
        return new Response('CSRF token required', { status: 403 });
      }

      return handler(request);
    };
  }

  /**
   * Validate email content for processing
   */
  static validateEmailContent(content: string): { isValid: boolean; sanitized: string; errors: string[] } {
    const errors: string[] = [];
    let sanitized = content;

    // Check for suspicious patterns in email content
    const suspiciousPatterns = [
      /eval\s*\(/gi,
      /function\s*\(/gi,
      /onclick\s*=/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /javascript:/gi,
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        errors.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    // Sanitize the content
    sanitized = this.sanitizeEmailContent(content);

    // Additional length check to prevent DoS
    if (content.length > 100000) { // 100KB limit
      errors.push('Email content exceeds maximum length');
      sanitized = content.substring(0, 100000) + '... [truncated]';
    }

    return {
      isValid: errors.length === 0,
      sanitized,
      errors
    };
  }

  /**
   * Generate secure webhook signature
   */
  static generateWebhookSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Secure token comparison to prevent timing attacks
   */
  static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Validate cron job authentication with enhanced security
   */
  static validateCronAuth(request: Request): { isValid: boolean; error?: string } {
    const authHeader = request.headers.get('authorization');
    const expectedToken = env.CRON_SECRET;
    
    if (!expectedToken) {
      return { isValid: false, error: 'CRON_SECRET not configured' };
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isValid: false, error: 'Invalid authorization header format' };
    }
    
    const token = authHeader.substring(7);
    
    if (!this.secureCompare(token, expectedToken)) {
      return { isValid: false, error: 'Invalid cron token' };
    }
    
    return { isValid: true };
  }

  /**
   * Enhanced API key validation with security features
   */
  static validateApiKeyWithAuth(
    request: Request, 
    expectedKey: string | undefined,
    identifier: string = 'api-key-validation'
  ): { isValid: boolean; error?: string } {
    if (!expectedKey) {
      return { isValid: false, error: 'API key not configured' };
    }
    
    const providedKey = request.headers.get('x-api-key');
    
    if (!providedKey) {
      return { isValid: false, error: 'API key header missing' };
    }
    
    if (!this.secureCompare(providedKey, expectedKey)) {
      // Log failed attempts for security monitoring
      console.warn(`[Security] Failed API key validation from ${request.headers.get('x-forwarded-for')} for ${identifier}`);
      return { isValid: false, error: 'Invalid API key' };
    }
    
    return { isValid: true };
  }
}

/**
 * Middleware helper for API routes
 */
export function withSecurity(handler: (req: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      const userAgent = request.headers.get('user-agent') || '';
      
      // Block malicious user agents
      const suspiciousUserAgents = [
        'sqlmap', 'nikto', 'dirb', 'dirbuster', 'nmap', 'masscan', 'zap'
      ];
      
      if (suspiciousUserAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
        return new Response('Forbidden', { status: 403 });
      }

      return await handler(request);
    } catch (error) {
      console.error('Security middleware error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  };
} 