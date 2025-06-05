import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

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
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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