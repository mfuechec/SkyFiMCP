import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  securityHeaders,
  sanitizeRequest,
  isValidWebhookUrl,
  requestId,
} from '../../src/middleware/security.js';

describe('Security Middleware', () => {
  describe('securityHeaders', () => {
    it('should set security headers', () => {
      const req = {} as Request;
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age')
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize string values', () => {
      const req = {
        body: {
          name: 'test\0value',
          nested: {
            value: 'nested\0string',
          },
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      sanitizeRequest(req, res, next);

      expect(req.body.name).toBe('testvalue');
      expect(req.body.nested.value).toBe('nestedstring');
      expect(next).toHaveBeenCalled();
    });

    it('should remove dangerous keys', () => {
      const req = {
        body: {
          valid: 'value',
          $dangerous: 'should be removed',
          __proto__: 'also dangerous',
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      sanitizeRequest(req, res, next);

      expect(req.body.valid).toBe('value');
      expect(req.body.$dangerous).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(15000);
      const req = {
        body: {
          long: longString,
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      sanitizeRequest(req, res, next);

      expect(req.body.long.length).toBe(10000);
      expect(next).toHaveBeenCalled();
    });

    it('should handle arrays', () => {
      const req = {
        body: {
          items: ['test\0', { nested: 'value\0' }],
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      sanitizeRequest(req, res, next);

      expect(req.body.items[0]).toBe('test');
      expect(req.body.items[1].nested).toBe('value');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('isValidWebhookUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(isValidWebhookUrl('https://example.com/webhook')).toBe(true);
      expect(isValidWebhookUrl('https://api.company.com/hooks/123')).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      expect(isValidWebhookUrl('http://example.com/webhook')).toBe(false);
    });

    it('should reject localhost', () => {
      expect(isValidWebhookUrl('https://localhost/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://127.0.0.1/webhook')).toBe(false);
    });

    it('should reject private IPs', () => {
      expect(isValidWebhookUrl('https://10.0.0.1/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://192.168.1.1/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://172.16.0.1/webhook')).toBe(false);
    });

    it('should reject AWS metadata endpoint', () => {
      expect(isValidWebhookUrl('https://169.254.169.254/latest')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidWebhookUrl('not-a-url')).toBe(false);
      expect(isValidWebhookUrl('')).toBe(false);
    });
  });

  describe('requestId', () => {
    it('should generate request ID if not provided', () => {
      const req = {
        headers: {},
      } as unknown as Request;
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      requestId(req, res, next);

      expect(req.headers['x-request-id']).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        req.headers['x-request-id']
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use existing request ID', () => {
      const req = {
        headers: {
          'x-request-id': 'existing-id-123',
        },
      } as unknown as Request;
      const res = {
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      requestId(req, res, next);

      expect(req.headers['x-request-id']).toBe('existing-id-123');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-id-123');
      expect(next).toHaveBeenCalled();
    });
  });
});
