import { describe, it, expect } from 'vitest';
import { MCPException, MCPErrors, formatErrorResponse } from '../../src/mcp/errors.js';

describe('MCP Errors', () => {
  describe('MCPException', () => {
    it('should create exception with correct properties', () => {
      const exception = new MCPException('INVALID_REQUEST', 'Test error', 400);
      expect(exception.code).toBe('INVALID_REQUEST');
      expect(exception.message).toBe('Test error');
      expect(exception.statusCode).toBe(400);
      expect(exception.name).toBe('MCPException');
    });

    it('should serialize to JSON correctly', () => {
      const exception = new MCPException('TOOL_NOT_FOUND', 'Tool not found', 404, {
        toolName: 'test',
      });

      const json = exception.toJSON();
      expect(json).toEqual({
        code: 'TOOL_NOT_FOUND',
        message: 'Tool not found',
        data: { toolName: 'test' },
      });
    });

    it('should exclude data when not provided', () => {
      const exception = new MCPException('INTERNAL_ERROR', 'Server error', 500);
      const json = exception.toJSON();
      expect(json).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Server error',
      });
    });
  });

  describe('MCPErrors factory', () => {
    it('should create invalidRequest error', () => {
      const error = MCPErrors.invalidRequest('Bad request');
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.statusCode).toBe(400);
    });

    it('should create toolNotFound error', () => {
      const error = MCPErrors.toolNotFound('my_tool');
      expect(error.code).toBe('TOOL_NOT_FOUND');
      expect(error.message).toContain('my_tool');
      expect(error.statusCode).toBe(404);
    });

    it('should create invalidParams error', () => {
      const error = MCPErrors.invalidParams('Missing required field');
      expect(error.code).toBe('INVALID_PARAMS');
      expect(error.statusCode).toBe(400);
    });

    it('should create internalError error', () => {
      const error = MCPErrors.internalError('Something broke');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create authInvalid error', () => {
      const error = MCPErrors.authInvalid();
      expect(error.code).toBe('AUTH_INVALID');
      expect(error.statusCode).toBe(401);
    });

    it('should create rateLimited error with retryAfter', () => {
      const error = MCPErrors.rateLimited(30);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.statusCode).toBe(429);
      expect(error.data).toEqual({ retryAfter: 30 });
    });
  });

  describe('formatErrorResponse', () => {
    it('should format MCPException correctly', () => {
      const exception = MCPErrors.toolNotFound('test');
      const { error, statusCode } = formatErrorResponse(exception);

      expect(statusCode).toBe(404);
      expect(error.code).toBe('TOOL_NOT_FOUND');
    });

    it('should format regular Error as INTERNAL_ERROR', () => {
      const error = new Error('Something went wrong');
      const { error: errorResponse, statusCode } = formatErrorResponse(error);

      expect(statusCode).toBe(500);
      expect(errorResponse.code).toBe('INTERNAL_ERROR');
      expect(errorResponse.message).toBe('Something went wrong');
    });

    it('should handle non-Error objects', () => {
      const { error, statusCode } = formatErrorResponse('string error');

      expect(statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('An unexpected error occurred');
    });
  });
});
