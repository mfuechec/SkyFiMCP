import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../../src/middleware/auth.js';
import { MCPException } from '../../src/mcp/errors.js';

describe('Authentication Middleware', () => {
  const mockResponse = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should accept valid API key in Authorization header', () => {
      const req = {
        headers: {
          authorization: 'Bearer valid-api-key-123',
        },
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.skyfiApiKey).toBe('valid-api-key-123');
    });

    it('should accept valid API key in X-API-Key header', () => {
      const req = {
        headers: {
          'x-api-key': 'test-fake-key-456',
        },
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.skyfiApiKey).toBe('test-fake-key-456');
    });

    it('should accept valid API key in query parameter', () => {
      const req = {
        headers: {},
        query: { api_key: 'test-fake-key-789' },
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.skyfiApiKey).toBe('test-fake-key-789');
    });

    it('should reject request without API key', () => {
      const req = {
        headers: {},
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(MCPException));
      const error = next.mock.calls[0][0] as MCPException;
      expect(error.code).toBe('AUTH_INVALID');
    });

    it('should reject invalid API key format (too short)', () => {
      const req = {
        headers: {
          authorization: 'Bearer short',
        },
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(MCPException));
      const error = next.mock.calls[0][0] as MCPException;
      expect(error.code).toBe('AUTH_INVALID');
    });

    it('should reject invalid API key format (invalid characters)', () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid<key>with$pecial',
        },
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(MCPException));
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should extract API key if provided', () => {
      const req = {
        headers: {
          authorization: 'Bearer optional-key-123',
        },
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      optionalAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.skyfiApiKey).toBe('optional-key-123');
    });

    it('should continue without API key', () => {
      const req = {
        headers: {},
        query: {},
        body: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn();

      optionalAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.skyfiApiKey).toBeUndefined();
    });
  });
});
