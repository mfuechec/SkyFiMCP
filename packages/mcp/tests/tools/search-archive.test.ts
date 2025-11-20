import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import {
  searchArchiveHandler,
  parseLocation,
  validateDate,
  resetSkyFiClient,
} from '../../src/tools/search-archive.js';
import type { SearchArchiveResponse } from '../../src/services/skyfi/types.js';

describe('search_archive tool', () => {
  const BASE_URL = 'https://api.skyfi.com/v1';

  beforeEach(() => {
    // Reset SkyFi client before each test to ensure fresh state
    resetSkyFiClient();
    // Set API key for tests
    vi.stubEnv('SKYFI_API_KEY', 'test-api-key');
    nock.cleanAll();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    nock.cleanAll();
    // Reset client after each test
    resetSkyFiClient();
  });

  describe('parseLocation', () => {
    it('should parse coordinate strings to GeoJSON Point', () => {
      const result = parseLocation('37.7749,-122.4194');
      expect(result).toEqual({
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      });
    });

    it('should parse coordinate strings with spaces', () => {
      const result = parseLocation('37.7749, -122.4194');
      expect(result).toEqual({
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      });
    });

    it('should return place names as-is', () => {
      const result = parseLocation('San Francisco, CA');
      expect(result).toBe('San Francisco, CA');
    });

    it('should parse valid GeoJSON Point', () => {
      const geojson = JSON.stringify({
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      });
      const result = parseLocation(geojson);
      expect(result).toEqual({
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      });
    });

    it('should parse valid GeoJSON Polygon', () => {
      const geojson = JSON.stringify({
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
      });
      const result = parseLocation(geojson);
      expect(result).toEqual({
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
      });
    });

    it('should throw on invalid latitude', () => {
      expect(() => parseLocation('95.0,-122.4194')).toThrow(
        'Invalid latitude: 95. Must be between -90 and 90.'
      );
    });

    it('should throw on invalid longitude', () => {
      expect(() => parseLocation('37.7749,-200.0')).toThrow(
        'Invalid longitude: -200. Must be between -180 and 180.'
      );
    });

    it('should throw on invalid GeoJSON type', () => {
      const geojson = JSON.stringify({
        type: 'LineString',
        coordinates: [
          [-122.4194, 37.7749],
          [-122.42, 37.78],
        ],
      });
      expect(() => parseLocation(geojson)).toThrow(
        'Invalid GeoJSON type: LineString. Must be Point or Polygon.'
      );
    });

    it('should throw on malformed GeoJSON', () => {
      expect(() => parseLocation('{invalid json')).toThrow('Invalid GeoJSON format');
    });
  });

  describe('validateDate', () => {
    it('should accept valid ISO dates', () => {
      expect(() => validateDate('2024-01-01', 'startDate')).not.toThrow();
      expect(() => validateDate('2024-12-31', 'endDate')).not.toThrow();
    });

    it('should reject invalid date formats', () => {
      expect(() => validateDate('01-01-2024', 'startDate')).toThrow(
        'Invalid startDate format'
      );
      expect(() => validateDate('2024/01/01', 'startDate')).toThrow(
        'Invalid startDate format'
      );
    });

    it('should reject invalid dates', () => {
      // Month 13 is invalid
      expect(() => validateDate('2024-13-01', 'startDate')).toThrow(
        'not a valid date'
      );
      // Note: JavaScript Date constructor is lenient with day overflow
      // So we test with a clearly invalid month instead
      expect(() => validateDate('2024-00-01', 'startDate')).toThrow(
        'not a valid date'
      );
    });
  });

  describe('searchArchiveHandler', () => {
    describe('parameter validation', () => {
      it('should return error when location is missing', async () => {
        const result = await searchArchiveHandler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Location parameter is required');
      });

      it('should return error when location is empty', async () => {
        const result = await searchArchiveHandler({ location: '' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Location parameter is required');
      });

      it('should return error for invalid startDate format', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          startDate: 'invalid-date',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid startDate format');
      });

      it('should return error for invalid endDate format', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          endDate: '01-01-2024',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid endDate format');
      });

      it('should return error when start date is after end date', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          startDate: '2024-12-31',
          endDate: '2024-01-01',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Start date');
        expect(result.content[0].text).toContain('must be before');
      });

      it('should return error for invalid resolution', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          resolution: 'not-a-number',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid resolution');
      });

      it('should return error for negative resolution', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          resolution: '-1.0',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('positive number');
      });

      it('should return error for invalid imageType', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          imageType: 'invalid-type',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid imageType');
      });

      it('should return error for invalid limit', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          limit: 150,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid limit');
      });

      it('should return error for zero limit', async () => {
        const result = await searchArchiveHandler({
          location: 'San Francisco',
          limit: 0,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid limit');
      });
    });

    describe('successful searches', () => {
      it('should return formatted results for successful search', async () => {
        const mockResponse: SearchArchiveResponse = {
          results: [
            {
              id: 'img_123',
              provider: 'Maxar',
              captureDate: '2024-11-15',
              resolution: '50cm',
              imageType: 'optical',
              price: 45.0,
              currency: 'USD',
              previewUrl: 'https://preview.skyfi.com/img_123',
              bounds: { type: 'Point', coordinates: [-122.4194, 37.7749] },
              cloudCoverage: 5,
            },
          ],
          total: 1,
          hasMore: false,
        };

        nock(BASE_URL)
          .post('/archive/search')
          .reply(200, mockResponse);

        const result = await searchArchiveHandler({ location: 'San Francisco, CA' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('Found 1 image(s)');
        expect(result.content[0].text).toContain('img_123');
        expect(result.content[0].text).toContain('Maxar');
        expect(result.content[0].text).toContain('2024-11-15');
        expect(result.content[0].text).toContain('USD 45.00');
        expect(result.content[0].text).toContain('Cloud Coverage: 5%');
      });

      it('should handle empty results', async () => {
        nock(BASE_URL)
          .post('/archive/search')
          .reply(200, { results: [], total: 0, hasMore: false });

        const result = await searchArchiveHandler({ location: 'Middle of Nowhere' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('No imagery found');
        expect(result.content[0].text).toContain('Middle of Nowhere');
      });

      it('should indicate when more results are available', async () => {
        const mockResponse: SearchArchiveResponse = {
          results: [
            {
              id: 'img_123',
              provider: 'Maxar',
              captureDate: '2024-11-15',
              resolution: '50cm',
              imageType: 'optical',
              price: 45.0,
              currency: 'USD',
              previewUrl: 'https://preview.skyfi.com/img_123',
              bounds: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            },
          ],
          total: 100,
          hasMore: true,
        };

        nock(BASE_URL)
          .post('/archive/search')
          .reply(200, mockResponse);

        const result = await searchArchiveHandler({ location: 'New York' });

        expect(result.content[0].text).toContain('more available');
      });

      it('should include all optional parameters in API request', async () => {
        const scope = nock(BASE_URL)
          .post('/archive/search', (body) => {
            return (
              body.location.type === 'Point' &&
              body.dateRange?.start === '2024-01-01' &&
              body.dateRange?.end === '2024-12-31' &&
              body.resolution === '0.5' &&
              body.imageType === 'optical' &&
              body.openDataOnly === true &&
              body.limit === 25
            );
          })
          .reply(200, { results: [], total: 0, hasMore: false });

        await searchArchiveHandler({
          location: '37.7749,-122.4194',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          resolution: '0.5',
          imageType: 'optical',
          openDataOnly: true,
          limit: 25,
        });

        expect(scope.isDone()).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle missing API key', async () => {
        // Reset client to pick up empty API key
        resetSkyFiClient();
        vi.stubEnv('SKYFI_API_KEY', '');

        const result = await searchArchiveHandler({ location: 'San Francisco' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('SKYFI_API_KEY');
      });

      it('should handle API authentication errors', async () => {
        nock(BASE_URL)
          .post('/archive/search')
          .reply(401, {
            code: 'AUTH_INVALID',
            message: 'Invalid API key',
          });

        const result = await searchArchiveHandler({ location: 'San Francisco' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid API key');
        expect(result.content[0].text).toContain('SKYFI_API_KEY');
      });

      it('should handle invalid location errors', async () => {
        nock(BASE_URL)
          .post('/archive/search')
          .reply(400, {
            code: 'INVALID_LOCATION',
            message: 'Location not found',
          });

        const result = await searchArchiveHandler({ location: 'xyzabc123' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Location not found');
        expect(result.content[0].text).toContain('Tip');
      });

      it('should handle rate limiting', async () => {
        nock(BASE_URL)
          .post('/archive/search')
          .reply(429, {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
          });

        const result = await searchArchiveHandler({ location: 'San Francisco' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Too many requests');
        expect(result.content[0].text).toContain('wait');
      });

      it('should handle network errors', async () => {
        nock(BASE_URL)
          .post('/archive/search')
          .replyWithError('Network error');

        const result = await searchArchiveHandler({ location: 'San Francisco' });

        expect(result.isError).toBe(true);
      });

      it('should handle server errors', async () => {
        // Reply with 500 multiple times to account for retries
        nock(BASE_URL)
          .post('/archive/search')
          .times(3)
          .reply(500, {
            code: 'INTERNAL_ERROR',
            message: 'Server error',
          });

        const result = await searchArchiveHandler({ location: 'San Francisco' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Server error');
      });
    });

    describe('location format handling', () => {
      it('should handle coordinate string location', async () => {
        const scope = nock(BASE_URL)
          .post('/archive/search', (body) => {
            return (
              body.location.type === 'Point' &&
              body.location.coordinates[0] === -122.4194 &&
              body.location.coordinates[1] === 37.7749
            );
          })
          .reply(200, { results: [], total: 0, hasMore: false });

        await searchArchiveHandler({ location: '37.7749,-122.4194' });
        expect(scope.isDone()).toBe(true);
      });

      it('should handle place name location', async () => {
        const scope = nock(BASE_URL)
          .post('/archive/search', (body) => {
            return body.location === 'San Francisco, CA';
          })
          .reply(200, { results: [], total: 0, hasMore: false });

        await searchArchiveHandler({ location: 'San Francisco, CA' });
        expect(scope.isDone()).toBe(true);
      });

      it('should handle GeoJSON location', async () => {
        const geojson = JSON.stringify({
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
        });

        const scope = nock(BASE_URL)
          .post('/archive/search', (body) => {
            return body.location.type === 'Polygon';
          })
          .reply(200, { results: [], total: 0, hasMore: false });

        await searchArchiveHandler({ location: geojson });
        expect(scope.isDone()).toBe(true);
      });

      it('should return error for invalid coordinates', async () => {
        const result = await searchArchiveHandler({ location: '100.0,-122.4194' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid latitude');
      });
    });
  });
});
