/**
 * Bulk Operations Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeBulkFeasibilityCheck,
  executeBulkOrderPlacement,
  summarizeFeasibilityResults,
  summarizeOrderResults,
  type BulkLocation,
  type BulkFeasibilityRequest,
  type BulkOrderRequest,
  type BulkFeasibilityResult,
  type BulkOrderResult,
} from '../src/services/bulk/operations.js';

// Create mock client methods
const mockCheckFeasibility = vi.fn();
const mockPlaceTaskingOrder = vi.fn();

// Mock the SkyFi client
vi.mock('../src/services/skyfi/client.js', () => ({
  createSkyFiClient: vi.fn(() => ({
    checkFeasibility: mockCheckFeasibility,
    placeTaskingOrder: mockPlaceTaskingOrder,
  })),
  SkyFiApiException: class extends Error {
    constructor(public code: string, message: string, public statusCode: number) {
      super(message);
      this.name = 'SkyFiApiException';
    }
  },
}));

describe('Bulk Feasibility Check', () => {
  const mockLocations: BulkLocation[] = [
    {
      id: 'loc1',
      name: 'San Francisco',
      location: 'POINT(-122.4194 37.7749)',
    },
    {
      id: 'loc2',
      name: 'Austin',
      location: 'POINT(-97.7431 30.2672)',
    },
    {
      id: 'loc3',
      name: 'New York',
      location: 'POINT(-74.0060 40.7128)',
    },
  ];

  const mockRequest: BulkFeasibilityRequest = {
    locations: mockLocations,
    productType: 'SAR',
    resolution: 'HIGH',
    startDate: '2025-01-20T00:00:00+00:00',
    endDate: '2025-03-20T00:00:00+00:00',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process all locations successfully', async () => {
    // Mock successful feasibility responses
    mockCheckFeasibility.mockResolvedValue({
      id: 'feas-123',
      validUntil: '2025-01-21',
      overallScore: {
        feasibility: 0.95,
        weatherScore: {
          weatherScore: 1.0,
          weatherDetails: [],
        },
        providerScore: {
          score: 0.95,
          providerScores: [
            {
              provider: 'UMBRA',
              score: 0.95,
              status: 'COMPLETE',
              opportunities: [{ id: '1' }, { id: '2' }, { id: '3' }],
            },
          ],
        },
      },
    });

    const results = await executeBulkFeasibilityCheck(mockRequest, 'test-api-key');

    expect(results).toHaveLength(3);
    expect(results.every(r => r.feasible)).toBe(true);
    expect(results.every(r => r.feasibilityScore === 0.95)).toBe(true);
  });

  it('should handle individual location errors gracefully', async () => {
    const { SkyFiApiException } = await import('../src/services/skyfi/client.js');

    // First location succeeds, second fails, third succeeds
    mockCheckFeasibility
      .mockResolvedValueOnce({
        id: 'feas-1',
        validUntil: '2025-01-21',
        overallScore: {
          feasibility: 0.85,
          weatherScore: { weatherScore: 1.0, weatherDetails: [] },
          providerScore: {
            score: 0.85,
            providerScores: [{
              provider: 'UMBRA',
              score: 0.85,
              status: 'COMPLETE',
              opportunities: [{ id: '1' }],
            }],
          },
        },
      })
      .mockRejectedValueOnce(new (SkyFiApiException as any)('LOCATION_ERROR', 'Invalid location', 400))
      .mockResolvedValueOnce({
        id: 'feas-3',
        validUntil: '2025-01-21',
        overallScore: {
          feasibility: 0.90,
          weatherScore: { weatherScore: 1.0, weatherDetails: [] },
          providerScore: {
            score: 0.90,
            providerScores: [{
              provider: 'UMBRA',
              score: 0.90,
              status: 'COMPLETE',
              opportunities: [{ id: '1' }, { id: '2' }],
            }],
          },
        },
      });

    const results = await executeBulkFeasibilityCheck(mockRequest, 'test-api-key');

    expect(results).toHaveLength(3);
    expect(results[0].feasible).toBe(true);
    expect(results[1].feasible).toBe(false);
    expect(results[1].error).toBeDefined();
    expect(results[1].error?.code).toBe('LOCATION_ERROR');
    expect(results[2].feasible).toBe(true);
  });

  it('should call progress callback with updates', async () => {
    mockCheckFeasibility.mockResolvedValue({
      id: 'feas-123',
      validUntil: '2025-01-21',
      overallScore: {
        feasibility: 0.95,
        weatherScore: { weatherScore: 1.0, weatherDetails: [] },
        providerScore: {
          score: 0.95,
          providerScores: [{
            provider: 'UMBRA',
            score: 0.95,
            status: 'COMPLETE',
            opportunities: [{ id: '1' }],
          }],
        },
      },
    });

    const progressCallback = vi.fn();
    await executeBulkFeasibilityCheck(mockRequest, 'test-api-key', progressCallback);

    // Should be called at least once per location
    expect(progressCallback).toHaveBeenCalled();
    expect(progressCallback.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Check final progress
    const finalProgress = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0];
    expect(finalProgress.completed).toBe(3);
    expect(finalProgress.total).toBe(3);
    expect(finalProgress.pending).toBe(0);
  });
});

describe('Bulk Order Placement', () => {
  const mockLocations: BulkLocation[] = [
    {
      id: 'loc1',
      name: 'Location 1',
      location: 'POINT(-122.4194 37.7749)',
    },
    {
      id: 'loc2',
      name: 'Location 2',
      location: 'POINT(-97.7431 30.2672)',
    },
  ];

  const mockOrderRequest: BulkOrderRequest = {
    locations: mockLocations,
    productType: 'SAR',
    resolution: 'HIGH',
    startDate: '2025-01-20T00:00:00+00:00',
    endDate: '2025-03-20T00:00:00+00:00',
    confirmationToken: 'TEST_TOKEN',
    deliveryConfig: {
      bucket: 's3://test-bucket',
      path: 'imagery/',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should place orders for all locations successfully', async () => {
    mockPlaceTaskingOrder.mockResolvedValue({
      id: 'order-123',
      status: 'PENDING',
      createdAt: '2025-01-20',
    });

    const results = await executeBulkOrderPlacement(mockOrderRequest, 'test-api-key');

    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
    expect(results.every(r => r.orderId)).toBeDefined();
  });

  it('should handle order failures gracefully', async () => {
    const { SkyFiApiException } = await import('../src/services/skyfi/client.js');

    // First succeeds, second fails
    mockPlaceTaskingOrder
      .mockResolvedValueOnce({
        id: 'order-1',
        status: 'PENDING',
        createdAt: '2025-01-20',
      })
      .mockRejectedValueOnce(new (SkyFiApiException as any)('INSUFFICIENT_FUNDS', 'Insufficient funds', 402));

    const results = await executeBulkOrderPlacement(mockOrderRequest, 'test-api-key');

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error?.code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('Summary Functions', () => {
  it('should summarize feasibility results correctly', () => {
    const results: BulkFeasibilityResult[] = [
      {
        locationId: 'loc1',
        feasible: true,
        feasibilityScore: 0.95,
        weatherScore: 1.0,
        opportunityCount: 30,
      },
      {
        locationId: 'loc2',
        feasible: true,
        feasibilityScore: 0.85,
        weatherScore: 0.9,
        opportunityCount: 20,
      },
      {
        locationId: 'loc3',
        feasible: false,
        feasibilityScore: 0.2,
        weatherScore: 0.3,
        opportunityCount: 0,
      },
      {
        locationId: 'loc4',
        feasible: false,
        feasibilityScore: 0,
        weatherScore: 0,
        opportunityCount: 0,
        error: {
          code: 'ERROR',
          message: 'Test error',
        },
      },
    ];

    const summary = summarizeFeasibilityResults(results);

    expect(summary.total).toBe(4);
    expect(summary.feasible).toBe(2);
    expect(summary.infeasible).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.totalOpportunities).toBe(50);
    expect(summary.averageFeasibilityScore).toBeCloseTo(0.67, 1);
    expect(summary.averageWeatherScore).toBeCloseTo(0.73, 1);
  });

  it('should summarize order results correctly', () => {
    const results: BulkOrderResult[] = [
      {
        locationId: 'loc1',
        success: true,
        orderId: 'order-1',
      },
      {
        locationId: 'loc2',
        success: true,
        orderId: 'order-2',
      },
      {
        locationId: 'loc3',
        success: false,
        error: {
          code: 'ERROR',
          message: 'Test error',
        },
      },
    ];

    const summary = summarizeOrderResults(results);

    expect(summary.total).toBe(3);
    expect(summary.successful).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.orderIds).toEqual(['order-1', 'order-2']);
  });
});
