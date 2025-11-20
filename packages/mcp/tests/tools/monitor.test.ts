import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import {
  createMonitorHandler,
  listMonitorsHandler,
  getMonitorHandler,
  deleteMonitorHandler,
  pauseMonitorHandler,
  resumeMonitorHandler,
} from '../../src/tools/monitor.js';
import type { Monitor, ListMonitorsResponse } from '../../src/services/skyfi/types.js';

describe('AOI Monitoring Tools', () => {
  const BASE_URL = 'https://api.skyfi.com/v1';
  const API_KEY = 'test-api-key';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('create_monitor tool', () => {
    describe('parameter validation', () => {
      it('should return error when webhook URL is missing', async () => {
        const result = await createMonitorHandler({
          apiKey: API_KEY,
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INVALID_REQUEST');
        expect(response.message).toBe('Webhook URL is required');
      });

      it('should return error when webhook URL is invalid', async () => {
        const result = await createMonitorHandler({
          apiKey: API_KEY,
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          webhookUrl: 'not-a-valid-url',
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INVALID_REQUEST');
        expect(response.message).toBe('Invalid webhook URL format');
      });

      it('should return error when location is missing', async () => {
        const result = await createMonitorHandler({
          apiKey: API_KEY,
          webhookUrl: 'https://example.com/webhook',
        });
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('INVALID_REQUEST');
        expect(response.message).toContain('Location is required');
      });
    });

    describe('successful monitor creation', () => {
      it('should create monitor with Point location', async () => {
        const mockMonitor: Monitor = {
          id: 'mon_123',
          status: 'active',
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          criteria: { resolution: '1m', imageType: 'optical' },
          webhookUrl: 'https://example.com/webhook',
          createdAt: '2025-01-15T10:00:00Z',
        };

        nock(BASE_URL).post('/monitors').reply(200, mockMonitor);

        const result = await createMonitorHandler({
          apiKey: API_KEY,
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          webhookUrl: 'https://example.com/webhook',
          resolution: '1m',
          imageType: 'optical',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.monitor.id).toBe('mon_123');
        expect(response.monitor.status).toBe('active');
        expect(response.monitor.message).toContain('mon_123');
      });

      it('should create monitor with Polygon location', async () => {
        const mockMonitor: Monitor = {
          id: 'mon_456',
          status: 'active',
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
          criteria: { frequency: 'daily' },
          webhookUrl: 'https://example.com/webhook',
          createdAt: '2025-01-15T10:00:00Z',
        };

        nock(BASE_URL).post('/monitors').reply(200, mockMonitor);

        const result = await createMonitorHandler({
          apiKey: API_KEY,
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
          webhookUrl: 'https://example.com/webhook',
          frequency: 'daily',
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
        expect(response.monitor.id).toBe('mon_456');
      });

      it('should create monitor with notification preferences', async () => {
        const mockMonitor: Monitor = {
          id: 'mon_789',
          status: 'active',
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          criteria: {},
          webhookUrl: 'https://example.com/webhook',
          createdAt: '2025-01-15T10:00:00Z',
        };

        nock(BASE_URL)
          .post('/monitors', (body) => {
            return (
              body.notificationPreferences?.onNewImagery === true &&
              body.notificationPreferences?.onPriceChange === true
            );
          })
          .reply(200, mockMonitor);

        const result = await createMonitorHandler({
          apiKey: API_KEY,
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          webhookUrl: 'https://example.com/webhook',
          notifyOnNewImagery: true,
          notifyOnPriceChange: true,
        });

        expect(result.isError).toBeUndefined();
        const response = JSON.parse(result.content[0].text!);
        expect(response.success).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle authentication error', async () => {
        nock(BASE_URL).post('/monitors').reply(401, {
          code: 'AUTH_INVALID',
          message: 'Invalid API key',
        });

        const result = await createMonitorHandler({
          apiKey: 'invalid-key',
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          webhookUrl: 'https://example.com/webhook',
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text!);
        expect(response.error).toBe('AUTH_INVALID');
      });
    });
  });

  describe('list_monitors tool', () => {
    it('should list all monitors', async () => {
      const mockResponse: ListMonitorsResponse = {
        monitors: [
          {
            id: 'mon_1',
            status: 'active',
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            criteria: { resolution: '1m' },
            webhookUrl: 'https://example.com/webhook1',
            createdAt: '2025-01-15T10:00:00Z',
            lastTriggered: '2025-01-16T08:00:00Z',
          },
          {
            id: 'mon_2',
            status: 'paused',
            location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
            criteria: { imageType: 'sar' },
            webhookUrl: 'https://example.com/webhook2',
            createdAt: '2025-01-14T10:00:00Z',
          },
        ],
        total: 2,
      };

      nock(BASE_URL).get('/monitors').reply(200, mockResponse);

      const result = await listMonitorsHandler({
        apiKey: API_KEY,
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.monitors).toHaveLength(2);
      expect(response.total).toBe(2);
      expect(response.monitors[0].id).toBe('mon_1');
      expect(response.monitors[1].status).toBe('paused');
    });

    it('should handle empty list', async () => {
      const mockResponse: ListMonitorsResponse = {
        monitors: [],
        total: 0,
      };

      nock(BASE_URL).get('/monitors').reply(200, mockResponse);

      const result = await listMonitorsHandler({
        apiKey: API_KEY,
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.monitors).toHaveLength(0);
      expect(response.total).toBe(0);
    });
  });

  describe('get_monitor tool', () => {
    it('should return error when monitor ID is missing', async () => {
      const result = await getMonitorHandler({
        apiKey: API_KEY,
      });
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.message).toBe('Monitor ID is required');
    });

    it('should get monitor by ID', async () => {
      const mockMonitor: Monitor = {
        id: 'mon_123',
        status: 'active',
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        criteria: { resolution: '1m' },
        webhookUrl: 'https://example.com/webhook',
        createdAt: '2025-01-15T10:00:00Z',
        lastTriggered: '2025-01-16T08:00:00Z',
      };

      nock(BASE_URL).get('/monitors/mon_123').reply(200, mockMonitor);

      const result = await getMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'mon_123',
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.monitor.id).toBe('mon_123');
      expect(response.monitor.lastTriggered).toBe('2025-01-16T08:00:00Z');
    });

    it('should handle not found error', async () => {
      nock(BASE_URL).get('/monitors/nonexistent').reply(404, {
        code: 'NOT_FOUND',
        message: 'Monitor not found',
      });

      const result = await getMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.error).toBe('NOT_FOUND');
    });
  });

  describe('delete_monitor tool', () => {
    it('should return error when monitor ID is missing', async () => {
      const result = await deleteMonitorHandler({
        apiKey: API_KEY,
      });
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.message).toBe('Monitor ID is required');
    });

    it('should delete monitor', async () => {
      nock(BASE_URL).delete('/monitors/mon_123').reply(204);

      const result = await deleteMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'mon_123',
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.message).toContain('mon_123');
      expect(response.message).toContain('deleted');
    });

    it('should handle not found error', async () => {
      nock(BASE_URL).delete('/monitors/nonexistent').reply(404, {
        code: 'NOT_FOUND',
        message: 'Monitor not found',
      });

      const result = await deleteMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.error).toBe('NOT_FOUND');
    });
  });

  describe('pause_monitor tool', () => {
    it('should return error when monitor ID is missing', async () => {
      const result = await pauseMonitorHandler({
        apiKey: API_KEY,
      });
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.message).toBe('Monitor ID is required');
    });

    it('should pause monitor', async () => {
      const mockMonitor: Monitor = {
        id: 'mon_123',
        status: 'paused',
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        criteria: {},
        webhookUrl: 'https://example.com/webhook',
        createdAt: '2025-01-15T10:00:00Z',
      };

      nock(BASE_URL).post('/monitors/mon_123/pause').reply(200, mockMonitor);

      const result = await pauseMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'mon_123',
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.monitor.status).toBe('paused');
      expect(response.monitor.message).toContain('paused');
    });
  });

  describe('resume_monitor tool', () => {
    it('should return error when monitor ID is missing', async () => {
      const result = await resumeMonitorHandler({
        apiKey: API_KEY,
      });
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text!);
      expect(response.message).toBe('Monitor ID is required');
    });

    it('should resume monitor', async () => {
      const mockMonitor: Monitor = {
        id: 'mon_123',
        status: 'active',
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        criteria: {},
        webhookUrl: 'https://example.com/webhook',
        createdAt: '2025-01-15T10:00:00Z',
      };

      nock(BASE_URL).post('/monitors/mon_123/resume').reply(200, mockMonitor);

      const result = await resumeMonitorHandler({
        apiKey: API_KEY,
        monitorId: 'mon_123',
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text!);
      expect(response.success).toBe(true);
      expect(response.monitor.status).toBe('active');
      expect(response.monitor.message).toContain('resumed');
    });
  });
});
