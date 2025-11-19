/**
 * Security Middleware
 * Input sanitization, CORS, and other security measures
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware
 * Sets important security headers on all responses
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict transport security (HTTPS only)
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );

  // Content security policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'none'; object-src 'none'"
  );

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
}

/**
 * Request sanitization middleware
 * Sanitizes request body to prevent injection attacks
 */
export function sanitizeRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip potentially dangerous keys
    if (key.startsWith('$') || key.startsWith('__')) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : typeof item === 'string'
          ? sanitizeString(item)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a string value
 */
function sanitizeString(str: string): string {
  // Remove null bytes
  let sanitized = str.replace(/\0/g, '');

  // Limit string length to prevent DoS
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

/**
 * CORS configuration options
 */
export interface CorsOptions {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  maxAge?: number;
}

/**
 * Create CORS middleware
 */
export function createCorsMiddleware(options: CorsOptions = {}) {
  const {
    allowedOrigins = ['*'],
    allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
    ],
    maxAge = 86400, // 24 hours
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin || '*';

    // Check if origin is allowed
    const isAllowed =
      allowedOrigins.includes('*') || allowedOrigins.includes(origin);

    if (isAllowed) {
      res.setHeader(
        'Access-Control-Allow-Origin',
        allowedOrigins.includes('*') ? '*' : origin
      );
    }

    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', String(maxAge));

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Request ID middleware
 * Adds a unique request ID for tracing
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id =
    (req.headers['x-request-id'] as string) ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);

  next();
}

/**
 * Webhook URL validator
 * Prevents SSRF attacks by validating webhook URLs
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Block localhost and private IPs
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '192.168.',
      '169.254.',
      '[::1]',
      'metadata.google',
      '169.254.169.254', // AWS metadata
    ];

    for (const pattern of blockedPatterns) {
      if (hostname.includes(pattern)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
