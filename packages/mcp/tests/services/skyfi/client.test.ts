import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { SkyFiClient, SkyFiApiException } from '../../../src/services/skyfi/client.js';
import type {
  SearchArchiveResponse,
  PricingResponse,
  FeasibilityResponse,
  Order,
  ListOrdersResponse,
  Monitor,
  ListMonitorsResponse,
} from '../../../src/services/skyfi/types.js';

describe('SkyFiClient', () => {
  const BASE_URL = 'https://api.skyfi.com/v1';
  const API_KEY = 'test-api-key';
  let client: SkyFiClient;

  beforeEach(() => {
    client = new SkyFiClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      retryAttempts: 1, // Reduce retries for faster tests
      retryDelay: 10,
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Authentication', () => {
    it('should include Bearer token in requests', async () => {
      const scope = nock(BASE_URL)
        .post('/archive/search')
        .matchHeader('Authorization', `Bearer ${API_KEY}`)
        .reply(200, { results: [], total: 0, hasMore: false });

      await client.searchArchive({ location: 'Austin, TX' });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('searchArchive', () => {
    it('should search archive successfully', async () => {
      const mockResponse: SearchArchiveResponse = {
        results: [
          {
            id: 'img_123',
            provider: 'Maxar',
            captureDate: '2025-11-15',
            resolution: '50cm',
            imageType: 'optical',
            price: 45.0,
            currency: 'USD',
            previewUrl: 'https://preview.skyfi.com/img_123',
            bounds: { type: 'Point', coordinates: [-97.7431, 30.2672] },
            cloudCoverage: 5,
          },
        ],
        total: 1,
        hasMore: false,
      };

      nock(BASE_URL)
        .post('/archive/search', {
          location: 'Austin, TX',
          limit: 10,
        })
        .reply(200, mockResponse);

      const response = await client.searchArchive({
        location: 'Austin, TX',
        limit: 10,
      });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].id).toBe('img_123');
      expect(response.total).toBe(1);
    });

    it('should handle empty results', async () => {
      nock(BASE_URL)
        .post('/archive/search')
        .reply(200, { results: [], total: 0, hasMore: false });

      const response = await client.searchArchive({ location: 'Unknown Place' });
      expect(response.results).toHaveLength(0);
    });
  });

  describe('getPricing', () => {
    it('should get pricing for image', async () => {
      const mockResponse: PricingResponse = {
        price: 45.0,
        currency: 'USD',
        breakdown: {
          basePrice: 40.0,
          processingFee: 5.0,
        },
        provider: 'Maxar',
        estimatedDelivery: '30 minutes',
      };

      nock(BASE_URL)
        .post('/pricing/estimate', { imageId: 'img_123' })
        .reply(200, mockResponse);

      const response = await client.getPricing({ imageId: 'img_123' });
      expect(response.price).toBe(45.0);
      expect(response.provider).toBe('Maxar');
    });
  });

  describe('checkFeasibility', () => {
    it('should check feasibility successfully', async () => {
      const mockResponse: FeasibilityResponse = {
        feasible: true,
      };

      nock(BASE_URL)
        .post('/pricing/feasibility')
        .reply(200, mockResponse);

      const response = await client.checkFeasibility({ imageId: 'img_123' });
      expect(response.feasible).toBe(true);
    });

    it('should return reason when not feasible', async () => {
      const mockResponse: FeasibilityResponse = {
        feasible: false,
        reason: 'AOI too small',
        alternatives: ['Expand area by 10%'],
      };

      nock(BASE_URL)
        .post('/pricing/feasibility')
        .reply(200, mockResponse);

      const response = await client.checkFeasibility({ imageId: 'img_123' });
      expect(response.feasible).toBe(false);
      expect(response.reason).toBe('AOI too small');
    });
  });

  describe('Orders', () => {
    it('should place order successfully', async () => {
      const mockOrder: Order = {
        id: 'ord_456',
        status: 'processing',
        imageId: 'img_123',
        price: 45.0,
        currency: 'USD',
        createdAt: '2025-11-18T12:00:00Z',
        updatedAt: '2025-11-18T12:00:00Z',
        estimatedDelivery: '30 minutes',
      };

      nock(BASE_URL)
        .post('/orders')
        .reply(200, mockOrder);

      const response = await client.placeOrder({
        imageId: 'img_123',
        userConfirmationToken: 'token_abc',
      });

      expect(response.id).toBe('ord_456');
      expect(response.status).toBe('processing');
    });

    it('should get order status', async () => {
      const mockOrder: Order = {
        id: 'ord_456',
        status: 'completed',
        imageId: 'img_123',
        price: 45.0,
        currency: 'USD',
        createdAt: '2025-11-18T12:00:00Z',
        updatedAt: '2025-11-18T12:30:00Z',
        downloadUrls: ['https://download.skyfi.com/ord_456/image.tif'],
      };

      nock(BASE_URL)
        .get('/orders/ord_456')
        .reply(200, mockOrder);

      const response = await client.getOrderStatus('ord_456');
      expect(response.status).toBe('completed');
      expect(response.downloadUrls).toHaveLength(1);
    });

    it('should list orders', async () => {
      const mockResponse: ListOrdersResponse = {
        orders: [
          {
            id: 'ord_456',
            status: 'completed',
            price: 45.0,
            currency: 'USD',
            createdAt: '2025-11-18T12:00:00Z',
            updatedAt: '2025-11-18T12:30:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      nock(BASE_URL)
        .get('/orders')
        .reply(200, mockResponse);

      const response = await client.listOrders();
      expect(response.orders).toHaveLength(1);
    });
  });

  describe('Monitors', () => {
    it('should create monitor', async () => {
      const mockMonitor: Monitor = {
        id: 'mon_789',
        status: 'active',
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        criteria: { resolution: '1m', imageType: 'optical' },
        webhookUrl: 'https://example.com/webhook',
        createdAt: '2025-11-18T12:00:00Z',
      };

      nock(BASE_URL)
        .post('/monitors')
        .reply(200, mockMonitor);

      const response = await client.createMonitor({
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        criteria: { resolution: '1m', imageType: 'optical' },
        webhookUrl: 'https://example.com/webhook',
      });

      expect(response.id).toBe('mon_789');
      expect(response.status).toBe('active');
    });

    it('should list monitors', async () => {
      const mockResponse: ListMonitorsResponse = {
        monitors: [],
        total: 0,
      };

      nock(BASE_URL)
        .get('/monitors')
        .reply(200, mockResponse);

      const response = await client.listMonitors();
      expect(response.monitors).toHaveLength(0);
    });

    it('should delete monitor', async () => {
      nock(BASE_URL)
        .delete('/monitors/mon_789')
        .reply(204);

      await expect(client.deleteMonitor('mon_789')).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw SkyFiApiException on 400 error', async () => {
      nock(BASE_URL)
        .post('/archive/search')
        .reply(400, {
          code: 'INVALID_LOCATION',
          message: 'Invalid location format',
        });

      try {
        await client.searchArchive({ location: 'invalid' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(SkyFiApiException);
        expect((error as SkyFiApiException).code).toBe('INVALID_LOCATION');
        expect((error as SkyFiApiException).statusCode).toBe(400);
      }
    });

    it('should throw SkyFiApiException on 401 error', async () => {
      nock(BASE_URL)
        .post('/archive/search')
        .reply(401, {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        });

      await expect(client.searchArchive({ location: 'Austin' })).rejects.toThrow(
        SkyFiApiException
      );
    });

    it('should throw SkyFiApiException on 500 error', async () => {
      nock(BASE_URL)
        .post('/archive/search')
        .reply(500, {
          code: 'INTERNAL_ERROR',
          message: 'Server error',
        });

      await expect(client.searchArchive({ location: 'Austin' })).rejects.toThrow(
        SkyFiApiException
      );
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 5xx errors', async () => {
      const clientWithRetry = new SkyFiClient({
        apiKey: API_KEY,
        baseUrl: BASE_URL,
        retryAttempts: 3,
        retryDelay: 10,
      });

      // First two calls fail, third succeeds
      nock(BASE_URL)
        .post('/archive/search')
        .reply(500, { code: 'SERVER_ERROR', message: 'Error' })
        .post('/archive/search')
        .reply(500, { code: 'SERVER_ERROR', message: 'Error' })
        .post('/archive/search')
        .reply(200, { results: [], total: 0, hasMore: false });

      const response = await clientWithRetry.searchArchive({ location: 'Austin' });
      expect(response.results).toHaveLength(0);
    });

    it('should not retry on 4xx errors', async () => {
      let callCount = 0;

      nock(BASE_URL)
        .post('/archive/search')
        .reply(() => {
          callCount++;
          return [400, { code: 'BAD_REQUEST', message: 'Bad request' }];
        });

      await expect(client.searchArchive({ location: 'Austin' })).rejects.toThrow();
      expect(callCount).toBe(1); // Should not retry
    });
  });
});
