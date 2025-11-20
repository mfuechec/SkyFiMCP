/**
 * Authentication Middleware
 * Validates SkyFi API keys provided by users
 */

import { Request, Response, NextFunction } from 'express';
import { MCPErrors } from '../mcp/errors.js';

/**
 * Extract API key from request
 * Supports multiple methods: header, query param, or body
 */
function extractApiKey(req: Request): string | undefined {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  // Check query parameter
  if (req.query.api_key && typeof req.query.api_key === 'string') {
    return req.query.api_key;
  }

  // Check request body
  if (req.body && req.body.api_key && typeof req.body.api_key === 'string') {
    return req.body.api_key;
  }

  return undefined;
}

/**
 * Validate API key format
 * SkyFi API keys should match expected patterns
 */
function isValidApiKeyFormat(apiKey: string): boolean {
  // Basic validation: non-empty, reasonable length, alphanumeric with common chars
  if (!apiKey || apiKey.length < 10 || apiKey.length > 256) {
    return false;
  }

  // Allow alphanumeric, hyphens, underscores, and dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  return validPattern.test(apiKey);
}

/**
 * Authentication middleware
 * Validates that a valid SkyFi API key is provided
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw MCPErrors.authInvalid('API key is required. Provide via Authorization header, X-API-Key header, or api_key parameter.');
    }

    if (!isValidApiKeyFormat(apiKey)) {
      throw MCPErrors.authInvalid('Invalid API key format');
    }

    // Attach API key to request for use by handlers
    req.skyfiApiKey = apiKey;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware
 * Extracts API key if present but doesn't require it
 */
export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const apiKey = extractApiKey(req);

  if (apiKey && isValidApiKeyFormat(apiKey)) {
    req.skyfiApiKey = apiKey;
  }

  next();
}

/**
 * Create authentication middleware with custom options
 */
export interface AuthOptions {
  required?: boolean;
  allowedSources?: ('header' | 'query' | 'body')[];
}

export function createAuthMiddleware(options: AuthOptions = {}) {
  const { required = true } = options;

  return required ? authMiddleware : optionalAuthMiddleware;
}
