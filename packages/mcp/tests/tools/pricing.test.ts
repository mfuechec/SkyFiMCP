import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import {
  getPricingEstimateHandler,
  checkOrderFeasibilityHandler,
  formatInfeasibilityDetails,
  formatApiErrorDetails,
} from '../../src/tools/pricing.js';
import { SkyFiApiException } from '../../src/services/skyfi/client.js';
import type {
  PricingResponse,
  FeasibilityResponse,
} from '../../src/services/skyfi/types.js';

describe('Pricing and Feasibility Tools', () => {
  const BASE_URL = 'https://api.skyfi.com/v1';
  const API_KEY = 'test-api-key';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('get_pricing_estimate tool', () => {
    describe('parameter validation', () => {
      it('should return error when neither imageId nor taskingRequest is provided', async () => {
        const result = await getPricingEstimateHandler({ apiKey: API_KEY });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Either imageId or taskingRequest must be provided');
      });

      it('should return error when both imageId and taskingRequest are provided', async () => {
        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
          },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Only one of imageId or taskingRequest');
      });
    });

    describe('successful pricing requests', () => {
      it('should get pricing for imageId', async () => {
        const mockResponse: PricingResponse = {
          price: 45.0,
          currency: 'USD',
          provider: 'Maxar',
          estimatedDelivery: '30 minutes',
          breakdown: {
            basePrice: 40.0,
            processingFee: 5.0,
          },
        };

        nock(BASE_URL)
          .post('/pricing/estimate', { imageId: 'img_123' })
          .reply(200, mockResponse);

        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.pricing.price).toBe(45.0);
        expect(response.pricing.currency).toBe('USD');
        expect(response.pricing.provider).toBe('Maxar');
        expect(response.pricing.breakdown.basePrice).toBe(40.0);
      });

      it('should get pricing for tasking request with Point location', async () => {
        const mockResponse: PricingResponse = {
          price: 150.0,
          currency: 'USD',
          provider: 'Planet',
          estimatedDelivery: '2 days',
          minimumAoi: 25,
        };

        nock(BASE_URL)
          .post('/pricing/estimate')
          .reply(200, mockResponse);

        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '0.5m',
            imageType: 'optical',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.pricing.price).toBe(150.0);
        expect(response.pricing.minimumAoi).toBe(25);
      });

      it('should get pricing for tasking request with Polygon location', async () => {
        const mockResponse: PricingResponse = {
          price: 500.0,
          currency: 'USD',
          provider: 'Airbus',
          estimatedDelivery: '5 days',
        };

        nock(BASE_URL)
          .post('/pricing/estimate')
          .reply(200, mockResponse);

        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: {
              type: 'Polygon',
              coordinates: [
                [
                  [-122.5, 37.7],
                  [-122.4, 37.7],
                  [-122.4, 37.8],
                  [-122.5, 37.8],
                  [-122.5, 37.7],
                ],
              ],
            },
            resolution: '1m',
            captureDate: '2025-01-15',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.pricing.price).toBe(500.0);
      });
    });

    describe('error handling', () => {
      it('should handle 401 authentication error', async () => {
        nock(BASE_URL)
          .post('/pricing/estimate')
          .reply(401, {
            code: 'AUTH_INVALID',
            message: 'Invalid API key',
          });

        const result = await getPricingEstimateHandler({
          apiKey: 'invalid-key',
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('AUTH_INVALID');
        expect(response.statusCode).toBe(401);
      });

      it('should handle 404 image not found error', async () => {
        nock(BASE_URL)
          .post('/pricing/estimate')
          .reply(404, {
            code: 'NOT_FOUND',
            message: 'Image not found',
          });

        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          imageId: 'nonexistent_img',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('NOT_FOUND');
      });

      it('should handle network errors', async () => {
        nock(BASE_URL)
          .post('/pricing/estimate')
          .replyWithError('Network error');

        const result = await getPricingEstimateHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
      });
    });
  });

  describe('check_order_feasibility tool', () => {
    describe('parameter validation', () => {
      it('should return error when neither imageId nor taskingRequest is provided', async () => {
        const result = await checkOrderFeasibilityHandler({ apiKey: API_KEY });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Either imageId or taskingRequest must be provided');
      });

      it('should return error when both imageId and taskingRequest are provided', async () => {
        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
          },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Only one of imageId or taskingRequest');
      });
    });

    describe('feasible orders', () => {
      it('should return success for feasible order', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: true,
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.feasibility.feasible).toBe(true);
        expect(response.feasibility.message).toContain('feasible and can be processed');
      });
    });

    describe('infeasible orders with detailed error messages', () => {
      it('should return detailed explanation for resolution issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Requested resolution not available',
          alternatives: ['Try 1m resolution'],
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '0.3m',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('resolution');
        expect(response.feasibility.suggestions.length).toBeGreaterThan(0);
        expect(response.feasibility.alternatives).toContain('Try 1m resolution');
      });

      it('should return detailed explanation for location/coverage issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Location not covered by satellite passes',
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('location');
        expect(response.feasibility.suggestions).toContain('Expand the search area');
      });

      it('should return detailed explanation for weather issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Weather forecast shows high cloud levels',
          alternatives: ['Consider SAR imagery'],
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
          },
        });

        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('Weather');
        expect(response.feasibility.suggestions).toContain('Try SAR imagery which can penetrate clouds');
      });

      it('should return detailed explanation for date/time issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Requested date is too soon for scheduling',
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
            captureDate: '2025-01-01',
          },
        });

        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('date');
        expect(response.feasibility.suggestions).toContain('Choose a later date to allow for satellite scheduling');
      });

      it('should return detailed explanation for capacity issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Satellite capacity is fully booked',
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('capacity');
      });

      it('should return detailed explanation for area size issues', async () => {
        const mockResponse: FeasibilityResponse = {
          feasible: false,
          reason: 'Area of interest too small',
          alternatives: ['Expand AOI to at least 25 sq km'],
        };

        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(200, mockResponse);

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
          },
        });

        const response = JSON.parse(result.content[0].text!);
        expect(response.feasibility.feasible).toBe(false);
        expect(response.feasibility.detailedExplanation).toContain('area');
      });
    });

    describe('error handling', () => {
      it('should include troubleshooting info for API errors', async () => {
        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(400, {
            code: 'INVALID_REQUEST',
            message: 'Invalid location format',
          });

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting).toBeDefined();
        expect(response.troubleshooting.possibleCauses).toContain('Invalid request parameters');
        expect(response.troubleshooting.suggestions).toContain('Verify all required fields are provided');
      });

      it('should include troubleshooting info for rate limiting', async () => {
        nock(BASE_URL)
          .post('/pricing/feasibility')
          .reply(429, {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
          });

        const result = await checkOrderFeasibilityHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain('Rate limit exceeded');
      });
    });
  });

  describe('Helper Functions', () => {
    describe('formatInfeasibilityDetails', () => {
      it('should provide default explanation when reason is undefined', () => {
        const result = formatInfeasibilityDetails(undefined, undefined, undefined);
        expect(result.explanation).toBe('Order cannot be fulfilled');
        expect(result.suggestions.length).toBeGreaterThan(0);
      });

      it('should add hyperspectral suggestion for hyperspectral requests', () => {
        const result = formatInfeasibilityDetails(
          'Unknown reason',
          undefined,
          { imageType: 'hyperspectral' }
        );
        expect(result.suggestions).toContain(
          'Hyperspectral imagery has limited availability - consider multispectral as alternative'
        );
      });

      it('should add high resolution suggestion for <0.5m requests', () => {
        const result = formatInfeasibilityDetails(
          'Unknown reason',
          undefined,
          { resolution: '0.3' }
        );
        expect(result.suggestions).toContain(
          'Very high resolution (<0.5m) has limited provider availability'
        );
      });

      it('should include alternatives in suggestions when provided', () => {
        const result = formatInfeasibilityDetails(
          'Some reason',
          ['Alternative 1', 'Alternative 2'],
          undefined
        );
        expect(result.suggestions.some(s => s.includes('Alternative 1'))).toBe(true);
      });
    });

    describe('formatApiErrorDetails', () => {
      it('should provide appropriate info for 400 errors', () => {
        const error = new SkyFiApiException('BAD_REQUEST', 'Bad request', 400);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Invalid request parameters');
        expect(result.suggestions).toContain('Verify all required fields are provided');
      });

      it('should provide appropriate info for 401 errors', () => {
        const error = new SkyFiApiException('AUTH_INVALID', 'Invalid API key', 401);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Invalid API key');
        expect(result.suggestions).toContain('Verify your API key is correct');
      });

      it('should provide appropriate info for 403 errors', () => {
        const error = new SkyFiApiException('FORBIDDEN', 'Forbidden', 403);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Insufficient permissions');
      });

      it('should provide appropriate info for 404 errors', () => {
        const error = new SkyFiApiException('NOT_FOUND', 'Not found', 404);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Image ID not found');
        expect(result.suggestions).toContain('Search archive for available imagery');
      });

      it('should provide appropriate info for 429 errors', () => {
        const error = new SkyFiApiException('RATE_LIMITED', 'Rate limited', 429);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Rate limit exceeded');
      });

      it('should provide default info for unknown status codes', () => {
        const error = new SkyFiApiException('SERVER_ERROR', 'Server error', 503);
        const result = formatApiErrorDetails(error);
        expect(result.possibleCauses).toContain('Server error');
        expect(result.suggestions).toContain('Try again later');
      });
    });
  });
});
