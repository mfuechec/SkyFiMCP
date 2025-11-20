/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per API key
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { MCPErrors } from '../mcp/errors.js';

// Default rate limit configuration
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100; // 100 requests per minute

/**
 * Key generator for rate limiting
 * Uses API key if available, otherwise falls back to IP
 */
function keyGenerator(req: Request): string {
  // Use API key for per-user rate limiting
  if (req.skyfiApiKey) {
    return `apikey:${req.skyfiApiKey}`;
  }

  // Fallback to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
    : req.ip || req.socket.remoteAddress || 'unknown';

  return `ip:${ip}`;
}

/**
 * Custom handler for rate limit exceeded
 */
function rateLimitHandler(_req: Request, res: Response): void {
  const error = MCPErrors.rateLimited(60);
  res.status(error.statusCode).json({
    error: error.toJSON(),
  });
}

/**
 * Create rate limiting middleware
 */
export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
  } = options;

  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    handler: rateLimitHandler,
    skipFailedRequests,
    skipSuccessfulRequests,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
  });
}

/**
 * Default rate limiter for MCP endpoints
 * 100 requests per minute per API key
 */
export const mcpRateLimiter = createRateLimiter();

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per minute (e.g., order placement)
 */
export const strictRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
});

/**
 * Lenient rate limiter for read operations
 * 200 requests per minute
 */
export const lenientRateLimiter = createRateLimiter({
  max: 200,
  windowMs: 60 * 1000,
});
