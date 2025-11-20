/**
 * MCP Error Handling
 * Custom error classes and error response formatting
 */

import type { MCPError, MCPErrorCode } from '../models/mcp.js';

export class MCPException extends Error {
  public readonly code: MCPErrorCode;
  public readonly statusCode: number;
  public readonly data?: Record<string, unknown>;

  constructor(
    code: MCPErrorCode,
    message: string,
    statusCode: number = 400,
    data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MCPException';
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }

  toJSON(): MCPError {
    return {
      code: this.code,
      message: this.message,
      ...(this.data && { data: this.data }),
    };
  }
}

// Pre-defined error factories
export const MCPErrors = {
  invalidRequest: (message: string = 'Invalid request format') =>
    new MCPException('INVALID_REQUEST', message, 400),

  toolNotFound: (toolName: string) =>
    new MCPException('TOOL_NOT_FOUND', `Tool "${toolName}" not found`, 404),

  invalidParams: (message: string) =>
    new MCPException('INVALID_PARAMS', message, 400),

  internalError: (message: string = 'Internal server error') =>
    new MCPException('INTERNAL_ERROR', message, 500),

  authInvalid: (message: string = 'Invalid or missing API key') =>
    new MCPException('AUTH_INVALID', message, 401),

  rateLimited: (retryAfter?: number) =>
    new MCPException('RATE_LIMITED', 'Too many requests', 429, {
      retryAfter: retryAfter || 60,
    }),
};

/**
 * Format an error response for MCP
 */
export function formatErrorResponse(error: unknown): {
  error: MCPError;
  statusCode: number;
} {
  if (error instanceof MCPException) {
    return {
      error: error.toJSON(),
      statusCode: error.statusCode,
    };
  }

  // Handle unexpected errors
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
    statusCode: 500,
  };
}
