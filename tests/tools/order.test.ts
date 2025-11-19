import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import {
  placeOrderHandler,
  getOrderStatusHandler,
  cancelOrderHandler,
  listOrdersHandler,
  pollOrderStatusHandler,
  formatOrderErrorDetails,
  formatCancelErrorDetails,
  getStatusDescription,
} from '../../src/tools/order.js';
import { SkyFiApiException } from '../../src/services/skyfi/client.js';
import type { Order, ListOrdersResponse } from '../../src/services/skyfi/types.js';

describe('Order Placement Tools', () => {
  const BASE_URL = 'https://api.skyfi.com/v1';
  const API_KEY = 'test-api-key';
  const CONFIRMATION_TOKEN = 'valid-confirmation-token-123';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('place_order tool', () => {
    describe('confirmation token validation', () => {
      it('should return error when confirmation token is missing', async () => {
        const result = await placeOrderHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('MISSING_CONFIRMATION_TOKEN');
        expect(response.details.workflow).toBeDefined();
        expect(response.details.workflow.length).toBe(4);
      });

      it('should return error when confirmation token is empty', async () => {
        const result = await placeOrderHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
          userConfirmationToken: '',
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('MISSING_CONFIRMATION_TOKEN');
      });

      it('should return error when confirmation token is only whitespace', async () => {
        const result = await placeOrderHandler({
          apiKey: API_KEY,
          imageId: 'img_123',
          userConfirmationToken: '   ',
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('MISSING_CONFIRMATION_TOKEN');
      });
    });

    describe('parameter validation', () => {
      it('should return error when neither imageId nor taskingRequest is provided', async () => {
        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Either imageId or taskingRequest must be provided'
        );
      });

      it('should return error when both imageId and taskingRequest are provided', async () => {
        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '1m',
          },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'Only one of imageId or taskingRequest should be provided'
        );
      });
    });

    describe('successful order placement', () => {
      it('should place order with imageId', async () => {
        const mockOrder: Order = {
          id: 'order_abc123',
          status: 'pending',
          imageId: 'img_123',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          estimatedDelivery: '30 minutes',
        };

        nock(BASE_URL)
          .post('/orders', {
            imageId: 'img_123',
            userConfirmationToken: CONFIRMATION_TOKEN,
          })
          .reply(200, mockOrder);

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.order.id).toBe('order_abc123');
        expect(response.order.status).toBe('pending');
        expect(response.order.price).toBe(45.0);
        expect(response.order.message).toContain('order_abc123');
      });

      it('should place order with tasking request', async () => {
        const mockOrder: Order = {
          id: 'order_xyz789',
          status: 'pending',
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '0.5m',
            imageType: 'optical',
          },
          price: 150.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          estimatedDelivery: '2 days',
        };

        nock(BASE_URL).post('/orders').reply(200, mockOrder);

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          taskingRequest: {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            resolution: '0.5m',
            imageType: 'optical',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.order.id).toBe('order_xyz789');
        expect(response.order.estimatedDelivery).toBe('2 days');
      });

      it('should place order with delivery options', async () => {
        const mockOrder: Order = {
          id: 'order_delivery123',
          status: 'pending',
          imageId: 'img_456',
          price: 50.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
        };

        nock(BASE_URL)
          .post('/orders', (body) => {
            return (
              body.imageId === 'img_456' &&
              body.deliveryOptions?.cloudStorage === 's3://my-bucket/imagery' &&
              body.deliveryOptions?.format === 'geotiff'
            );
          })
          .reply(200, mockOrder);

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_456',
          deliveryOptions: {
            cloudStorage: 's3://my-bucket/imagery',
            format: 'geotiff',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
      });

      it('should place order with Polygon location', async () => {
        const mockOrder: Order = {
          id: 'order_polygon123',
          status: 'pending',
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
          },
          price: 500.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          estimatedDelivery: '5 days',
        };

        nock(BASE_URL).post('/orders').reply(200, mockOrder);

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
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
            captureDate: '2025-02-01',
          },
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.order.price).toBe(500.0);
      });
    });

    describe('error handling', () => {
      it('should handle insufficient funds error', async () => {
        nock(BASE_URL).post('/orders').reply(402, {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Account balance is too low',
        });

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INSUFFICIENT_FUNDS');
        expect(response.troubleshooting.possibleCauses).toContain(
          'Account balance is too low for this order'
        );
        expect(response.troubleshooting.suggestions).toContain('Add funds to your account');
      });

      it('should handle token mismatch error', async () => {
        nock(BASE_URL).post('/orders').reply(400, {
          code: 'INVALID_TOKEN',
          message: 'Confirmation token mismatch',
        });

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: 'invalid-token',
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain(
          'Confirmation token is invalid or expired'
        );
        expect(response.troubleshooting.suggestions).toContain(
          'Get new pricing estimate and generate a fresh token'
        );
      });

      it('should handle authentication error', async () => {
        nock(BASE_URL).post('/orders').reply(401, {
          code: 'AUTH_INVALID',
          message: 'Invalid API key',
        });

        const result = await placeOrderHandler({
          apiKey: 'invalid-key',
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('AUTH_INVALID');
        expect(response.statusCode).toBe(401);
      });

      it('should handle not found error', async () => {
        nock(BASE_URL).post('/orders').reply(404, {
          code: 'NOT_FOUND',
          message: 'Image not found',
        });

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'nonexistent',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain('Image ID not found');
      });

      it('should handle duplicate order error', async () => {
        nock(BASE_URL).post('/orders').reply(409, {
          code: 'DUPLICATE_ORDER',
          message: 'Order already exists',
        });

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain('Duplicate order');
        expect(response.troubleshooting.suggestions).toContain(
          'Check existing orders with list_orders'
        );
      });

      it('should handle network errors', async () => {
        nock(BASE_URL).post('/orders').replyWithError('Network error');

        const result = await placeOrderHandler({
          apiKey: API_KEY,
          userConfirmationToken: CONFIRMATION_TOKEN,
          imageId: 'img_123',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        // Network errors are caught by SkyFi client as NETWORK_ERROR
        expect(response.error).toBe('NETWORK_ERROR');
      });
    });
  });

  describe('get_order_status tool', () => {
    describe('parameter validation', () => {
      it('should return error when orderId is missing', async () => {
        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INVALID_REQUEST');
        expect(response.message).toBe('Order ID is required');
      });

      it('should return error when orderId is empty', async () => {
        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
          orderId: '',
        });
        expect(result.isError).toBe(true);
      });
    });

    describe('successful status retrieval', () => {
      it('should get status for pending order', async () => {
        const mockOrder: Order = {
          id: 'order_123',
          status: 'pending',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          estimatedDelivery: '30 minutes',
          progress: 0,
        };

        nock(BASE_URL).get('/orders/order_123').reply(200, mockOrder);

        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.order.status).toBe('pending');
        expect(response.order.statusDescription).toContain('queued');
      });

      it('should get status for completed order with download URLs', async () => {
        const mockOrder: Order = {
          id: 'order_456',
          status: 'completed',
          price: 150.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T12:00:00Z',
          downloadUrls: [
            'https://downloads.skyfi.com/order_456/image.tif',
            'https://downloads.skyfi.com/order_456/metadata.json',
          ],
          progress: 100,
        };

        nock(BASE_URL).get('/orders/order_456').reply(200, mockOrder);

        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_456',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.order.status).toBe('completed');
        expect(response.order.downloadUrls).toHaveLength(2);
        expect(response.order.statusDescription).toContain('complete');
      });

      it('should get status for failed order with error message', async () => {
        const mockOrder: Order = {
          id: 'order_789',
          status: 'failed',
          price: 50.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T11:00:00Z',
          errorMessage: 'Cloud coverage exceeded threshold',
        };

        nock(BASE_URL).get('/orders/order_789').reply(200, mockOrder);

        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_789',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.order.status).toBe('failed');
        expect(response.order.errorMessage).toBe('Cloud coverage exceeded threshold');
        expect(response.order.statusDescription).toContain('failed');
      });
    });

    describe('error handling', () => {
      it('should handle order not found', async () => {
        nock(BASE_URL).get('/orders/nonexistent').reply(404, {
          code: 'NOT_FOUND',
          message: 'Order not found',
        });

        const result = await getOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'nonexistent',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('NOT_FOUND');
      });
    });
  });

  describe('cancel_order tool', () => {
    describe('parameter validation', () => {
      it('should return error when orderId is missing', async () => {
        const result = await cancelOrderHandler({
          apiKey: API_KEY,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.message).toBe('Order ID is required');
      });
    });

    describe('successful cancellation', () => {
      it('should cancel a pending order', async () => {
        const mockOrder: Order = {
          id: 'order_123',
          status: 'cancelled',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:30:00Z',
        };

        nock(BASE_URL).post('/orders/order_123/cancel').reply(200, mockOrder);

        const result = await cancelOrderHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.order.status).toBe('cancelled');
        expect(response.order.message).toContain('cancelled');
      });
    });

    describe('error handling', () => {
      it('should handle order not found', async () => {
        nock(BASE_URL).post('/orders/nonexistent/cancel').reply(404, {
          code: 'NOT_FOUND',
          message: 'Order not found',
        });

        const result = await cancelOrderHandler({
          apiKey: API_KEY,
          orderId: 'nonexistent',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain('Order not found');
      });

      it('should handle cannot cancel completed order', async () => {
        nock(BASE_URL).post('/orders/completed_order/cancel').reply(409, {
          code: 'ORDER_COMPLETED',
          message: 'Cannot cancel completed order',
        });

        const result = await cancelOrderHandler({
          apiKey: API_KEY,
          orderId: 'completed_order',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.troubleshooting.possibleCauses).toContain(
          'Order cannot be cancelled in current state'
        );
        expect(response.troubleshooting.suggestions).toContain(
          'Completed orders cannot be cancelled'
        );
      });
    });
  });

  describe('list_orders tool', () => {
    describe('successful listing', () => {
      it('should list all orders', async () => {
        const mockResponse: ListOrdersResponse = {
          orders: [
            {
              id: 'order_1',
              status: 'completed',
              price: 45.0,
              currency: 'USD',
              createdAt: '2025-01-15T10:00:00Z',
              updatedAt: '2025-01-15T12:00:00Z',
            },
            {
              id: 'order_2',
              status: 'pending',
              price: 150.0,
              currency: 'USD',
              createdAt: '2025-01-16T10:00:00Z',
              updatedAt: '2025-01-16T10:00:00Z',
              estimatedDelivery: '2 days',
            },
          ],
          total: 10,
          hasMore: true,
        };

        nock(BASE_URL).get('/orders').reply(200, mockResponse);

        const result = await listOrdersHandler({
          apiKey: API_KEY,
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.orders).toHaveLength(2);
        expect(response.total).toBe(10);
        expect(response.hasMore).toBe(true);
      });

      it('should list orders with filters', async () => {
        const mockResponse: ListOrdersResponse = {
          orders: [
            {
              id: 'order_pending',
              status: 'pending',
              price: 100.0,
              currency: 'USD',
              createdAt: '2025-01-15T10:00:00Z',
              updatedAt: '2025-01-15T10:00:00Z',
            },
          ],
          total: 1,
          hasMore: false,
        };

        nock(BASE_URL)
          .get('/orders')
          .query({
            limit: '5',
            offset: '0',
            status: 'pending',
          })
          .reply(200, mockResponse);

        const result = await listOrdersHandler({
          apiKey: API_KEY,
          limit: 5,
          offset: 0,
          status: 'pending',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.orders).toHaveLength(1);
        expect(response.orders[0].status).toBe('pending');
      });
    });

    describe('error handling', () => {
      it('should handle API errors', async () => {
        nock(BASE_URL).get('/orders').reply(401, {
          code: 'AUTH_INVALID',
          message: 'Invalid API key',
        });

        const result = await listOrdersHandler({
          apiKey: 'invalid-key',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('AUTH_INVALID');
      });
    });
  });

  describe('poll_order_status tool', () => {
    describe('parameter validation', () => {
      it('should return error when orderId is missing', async () => {
        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INVALID_REQUEST');
        expect(response.message).toBe('Order ID is required');
      });

      it('should return error when maxAttempts is zero', async () => {
        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
          maxAttempts: 0,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.message).toBe('maxAttempts must be between 1 and 100');
      });

      it('should return error when maxAttempts exceeds 100', async () => {
        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
          maxAttempts: 101,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.message).toBe('maxAttempts must be between 1 and 100');
      });

      it('should return error when intervalSeconds is too short', async () => {
        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
          intervalSeconds: 4,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.message).toBe('intervalSeconds must be between 5 and 300');
      });

      it('should return error when intervalSeconds is too long', async () => {
        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
          intervalSeconds: 301,
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.message).toBe('intervalSeconds must be between 5 and 300');
      });
    });

    describe('successful polling', () => {
      it('should return immediately when order is already completed', async () => {
        const mockOrder: Order = {
          id: 'order_123',
          status: 'completed',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T12:00:00Z',
          downloadUrls: ['https://downloads.skyfi.com/order_123/image.tif'],
          progress: 100,
        };

        nock(BASE_URL).get('/orders/order_123').reply(200, mockOrder);

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_123',
          maxAttempts: 3,
          intervalSeconds: 5,
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.completed).toBe(true);
        expect(response.order.status).toBe('completed');
        expect(response.order.downloadUrls).toHaveLength(1);
        expect(response.polling.attempts).toBe(1);
        expect(response.polling.statusHistory).toHaveLength(1);
      });

      it('should return immediately when order has failed', async () => {
        const mockOrder: Order = {
          id: 'order_456',
          status: 'failed',
          price: 50.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T11:00:00Z',
          errorMessage: 'Cloud coverage exceeded threshold',
        };

        nock(BASE_URL).get('/orders/order_456').reply(200, mockOrder);

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_456',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.completed).toBe(true);
        expect(response.order.status).toBe('failed');
        expect(response.order.errorMessage).toBe('Cloud coverage exceeded threshold');
      });

      it('should return immediately when order is cancelled', async () => {
        const mockOrder: Order = {
          id: 'order_789',
          status: 'cancelled',
          price: 100.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:30:00Z',
        };

        nock(BASE_URL).get('/orders/order_789').reply(200, mockOrder);

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_789',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.completed).toBe(true);
        expect(response.order.status).toBe('cancelled');
      });

      it('should poll multiple times until completed', async () => {
        // First call: pending
        nock(BASE_URL).get('/orders/order_poll').reply(200, {
          id: 'order_poll',
          status: 'pending',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          progress: 0,
        });

        // Second call: processing
        nock(BASE_URL).get('/orders/order_poll').reply(200, {
          id: 'order_poll',
          status: 'processing',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:05:00Z',
          progress: 50,
        });

        // Third call: completed
        nock(BASE_URL).get('/orders/order_poll').reply(200, {
          id: 'order_poll',
          status: 'completed',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:10:00Z',
          progress: 100,
          downloadUrls: ['https://downloads.skyfi.com/order_poll/image.tif'],
        });

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_poll',
          maxAttempts: 5,
          intervalSeconds: 5, // Use minimum interval for faster tests
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.completed).toBe(true);
        expect(response.order.status).toBe('completed');
        expect(response.polling.attempts).toBe(3);
        expect(response.polling.statusHistory).toHaveLength(3);
        expect(response.polling.statusHistory[0].status).toBe('pending');
        expect(response.polling.statusHistory[1].status).toBe('processing');
        expect(response.polling.statusHistory[2].status).toBe('completed');
      }, 30000); // Extended timeout for polling test
    });

    describe('max attempts reached', () => {
      it('should return incomplete status when max attempts reached', async () => {
        // All calls return pending
        nock(BASE_URL).get('/orders/order_stuck').times(3).reply(200, {
          id: 'order_stuck',
          status: 'pending',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          progress: 0,
        });

        // Final status check
        nock(BASE_URL).get('/orders/order_stuck').reply(200, {
          id: 'order_stuck',
          status: 'pending',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
          progress: 0,
        });

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_stuck',
          maxAttempts: 3,
          intervalSeconds: 5,
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.completed).toBe(false);
        expect(response.message).toContain('did not reach terminal state');
        expect(response.polling.attempts).toBe(3);
        expect(response.suggestion).toContain('Increase maxAttempts');
      }, 30000);
    });

    describe('error handling', () => {
      it('should handle API errors during polling', async () => {
        // First call succeeds
        nock(BASE_URL).get('/orders/order_error').reply(200, {
          id: 'order_error',
          status: 'pending',
          price: 45.0,
          currency: 'USD',
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
        });

        // Second call fails
        nock(BASE_URL).get('/orders/order_error').reply(401, {
          code: 'AUTH_INVALID',
          message: 'Invalid API key',
        });

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'order_error',
          maxAttempts: 3,
          intervalSeconds: 5,
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('AUTH_INVALID');
        expect(response.polling.statusHistory).toHaveLength(1);
      }, 30000);

      it('should handle order not found', async () => {
        nock(BASE_URL).get('/orders/nonexistent').reply(404, {
          code: 'NOT_FOUND',
          message: 'Order not found',
        });

        const result = await pollOrderStatusHandler({
          apiKey: API_KEY,
          orderId: 'nonexistent',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('NOT_FOUND');
        expect(response.polling.statusHistory).toHaveLength(0);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('getStatusDescription', () => {
      it('should return correct description for pending', () => {
        expect(getStatusDescription('pending')).toContain('queued');
      });

      it('should return correct description for processing', () => {
        expect(getStatusDescription('processing')).toContain('processed');
      });

      it('should return correct description for completed', () => {
        expect(getStatusDescription('completed')).toContain('complete');
      });

      it('should return correct description for failed', () => {
        expect(getStatusDescription('failed')).toContain('failed');
      });

      it('should return correct description for cancelled', () => {
        expect(getStatusDescription('cancelled')).toContain('cancelled');
      });

      it('should return unknown for invalid status', () => {
        expect(getStatusDescription('invalid')).toBe('Unknown status');
      });
    });

    describe('formatOrderErrorDetails', () => {
      it('should handle insufficient funds error', () => {
        const error = new SkyFiApiException('INSUFFICIENT_FUNDS', 'Not enough balance', 402);
        const result = formatOrderErrorDetails(error);
        expect(result.possibleCauses).toContain('Account balance is too low for this order');
        expect(result.suggestions).toContain('Add funds to your account');
      });

      it('should handle token mismatch error', () => {
        const error = new SkyFiApiException('INVALID_TOKEN', 'Token mismatch', 400);
        const result = formatOrderErrorDetails(error);
        expect(result.possibleCauses).toContain('Confirmation token is invalid or expired');
      });

      it('should handle 402 payment required', () => {
        const error = new SkyFiApiException('PAYMENT_REQUIRED', 'Payment required', 402);
        const result = formatOrderErrorDetails(error);
        expect(result.possibleCauses).toContain('Payment required');
      });

      it('should handle 409 conflict', () => {
        const error = new SkyFiApiException('CONFLICT', 'Duplicate order', 409);
        const result = formatOrderErrorDetails(error);
        expect(result.possibleCauses).toContain('Duplicate order');
      });

      it('should handle 422 validation error', () => {
        const error = new SkyFiApiException('VALIDATION_ERROR', 'Invalid request', 422);
        const result = formatOrderErrorDetails(error);
        expect(result.possibleCauses).toContain('Order validation failed');
        expect(result.suggestions).toContain('Use check_order_feasibility before ordering');
      });
    });

    describe('formatCancelErrorDetails', () => {
      it('should handle 404 not found', () => {
        const error = new SkyFiApiException('NOT_FOUND', 'Order not found', 404);
        const result = formatCancelErrorDetails(error);
        expect(result.possibleCauses).toContain('Order not found');
      });

      it('should handle 409 cannot cancel', () => {
        const error = new SkyFiApiException('CONFLICT', 'Cannot cancel', 409);
        const result = formatCancelErrorDetails(error);
        expect(result.possibleCauses).toContain('Order cannot be cancelled in current state');
        expect(result.suggestions).toContain('Completed orders cannot be cancelled');
      });

      it('should handle other errors', () => {
        const error = new SkyFiApiException('SERVER_ERROR', 'Server error', 500);
        const result = formatCancelErrorDetails(error);
        expect(result.possibleCauses).toContain('Unable to cancel order');
      });
    });
  });
});
