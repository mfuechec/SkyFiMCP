/**
 * Bulk Operations Service
 * Handles batch processing of feasibility checks and orders
 */

import { createSkyFiClient, SkyFiApiException } from '../skyfi/client.js';
import type {
  FeasibilityRequest,
  FeasibilityResponse,
  PlaceTaskingOrderRequest,
  Order,
} from '../skyfi/types.js';

// ==================== Types ====================

export interface BulkLocation {
  id: string;
  name?: string;
  location: string; // WKT format
  metadata?: Record<string, unknown>;
}

export interface BulkFeasibilityRequest {
  locations: BulkLocation[];
  productType: string;
  resolution: string;
  startDate: string;
  endDate: string;
  maxCloudCoveragePercent?: number;
  requiredProvider?: string;
}

export interface BulkFeasibilityResult {
  locationId: string;
  locationName?: string;
  feasible: boolean;
  feasibilityScore: number;
  weatherScore: number;
  opportunityCount: number;
  error?: {
    code: string;
    message: string;
  };
  details?: FeasibilityResponse;
}

export interface BulkFeasibilityProgress {
  total: number;
  completed: number;
  pending: number;
  successful: number;
  failed: number;
  currentLocation?: string;
}

export interface BulkOrderRequest {
  locations: BulkLocation[];
  productType: string;
  resolution: string;
  startDate: string;
  endDate: string;
  deliveryConfig?: {
    bucket: string;
    path?: string;
  };
  maxCloudCoveragePercent?: number;
  requiredProvider?: string;
  confirmationToken: string;
}

export interface BulkOrderResult {
  locationId: string;
  locationName?: string;
  success: boolean;
  orderId?: string;
  error?: {
    code: string;
    message: string;
  };
  details?: Order;
}

export interface BulkOrderProgress {
  total: number;
  completed: number;
  pending: number;
  successful: number;
  failed: number;
  currentLocation?: string;
}

export type ProgressCallback = (progress: BulkFeasibilityProgress | BulkOrderProgress) => void;

// ==================== Bulk Feasibility Check ====================

/**
 * Execute bulk feasibility checks for multiple locations
 * @param request Bulk feasibility request
 * @param apiKey SkyFi API key
 * @param onProgress Optional progress callback
 * @returns Array of feasibility results
 */
export async function executeBulkFeasibilityCheck(
  request: BulkFeasibilityRequest,
  apiKey: string,
  onProgress?: ProgressCallback
): Promise<BulkFeasibilityResult[]> {
  const client = createSkyFiClient({ apiKey });
  const results: BulkFeasibilityResult[] = [];

  const progress: BulkFeasibilityProgress = {
    total: request.locations.length,
    completed: 0,
    pending: request.locations.length,
    successful: 0,
    failed: 0,
  };

  // Process each location sequentially to avoid rate limiting
  for (const location of request.locations) {
    progress.currentLocation = location.name || location.id;

    if (onProgress) {
      onProgress(progress);
    }

    try {
      // Build feasibility request for this location
      const feasibilityRequest: FeasibilityRequest = {
        aoi: location.location,
        productType: request.productType,
        resolution: request.resolution,
        startDate: request.startDate,
        endDate: request.endDate,
        maxCloudCoveragePercent: request.maxCloudCoveragePercent,
        requiredProvider: request.requiredProvider,
      };

      // Check feasibility
      const response = await client.checkFeasibility(feasibilityRequest);

      // Calculate metrics
      const feasibilityScore = response.overallScore.feasibility;
      const weatherScore = response.overallScore.weatherScore.weatherScore;
      const providerScores = response.overallScore.providerScore.providerScores;

      const totalOpportunities = providerScores.reduce(
        (sum, p) => sum + (p.opportunities?.length || 0),
        0
      );

      const hasProviderOpportunities = providerScores.some(
        p => p.score > 0 || (p.opportunities && p.opportunities.length > 0)
      );

      const isFeasible = feasibilityScore > 0 || hasProviderOpportunities;

      results.push({
        locationId: location.id,
        locationName: location.name,
        feasible: isFeasible,
        feasibilityScore,
        weatherScore,
        opportunityCount: totalOpportunities,
        details: response,
      });

      progress.successful++;
    } catch (error) {
      // Handle errors for individual locations
      if (error instanceof SkyFiApiException) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          feasible: false,
          feasibilityScore: 0,
          weatherScore: 0,
          opportunityCount: 0,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      } else {
        results.push({
          locationId: location.id,
          locationName: location.name,
          feasible: false,
          feasibilityScore: 0,
          weatherScore: 0,
          opportunityCount: 0,
          error: {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          },
        });
      }

      progress.failed++;
    }

    progress.completed++;
    progress.pending--;

    if (onProgress) {
      onProgress(progress);
    }

    // Small delay to avoid rate limiting (250ms between requests)
    if (progress.pending > 0) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  return results;
}

// ==================== Bulk Order Placement ====================

/**
 * Execute bulk order placement for multiple locations
 * @param request Bulk order request
 * @param apiKey SkyFi API key
 * @param onProgress Optional progress callback
 * @returns Array of order results
 */
export async function executeBulkOrderPlacement(
  request: BulkOrderRequest,
  apiKey: string,
  onProgress?: ProgressCallback
): Promise<BulkOrderResult[]> {
  const client = createSkyFiClient({ apiKey });
  const results: BulkOrderResult[] = [];

  const progress: BulkOrderProgress = {
    total: request.locations.length,
    completed: 0,
    pending: request.locations.length,
    successful: 0,
    failed: 0,
  };

  // Process each location sequentially
  for (const location of request.locations) {
    progress.currentLocation = location.name || location.id;

    if (onProgress) {
      onProgress(progress);
    }

    try {
      // Build tasking order request for this location
      const orderRequest: PlaceTaskingOrderRequest = {
        aoi: location.location,
        productType: request.productType,
        resolution: request.resolution,
        windowStart: request.startDate,
        windowEnd: request.endDate,
        deliveryDriver: 'S3', // Default to S3
        deliveryParams: request.deliveryConfig || {
          bucket: 's3://default-bucket',
        },
        maxCloudCoveragePercent: request.maxCloudCoveragePercent,
        requiredProvider: request.requiredProvider,
      };

      // Place order
      const order = await client.placeTaskingOrder(orderRequest);

      results.push({
        locationId: location.id,
        locationName: location.name,
        success: true,
        orderId: order.id,
        details: order,
      });

      progress.successful++;
    } catch (error) {
      // Handle errors for individual orders
      if (error instanceof SkyFiApiException) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      } else {
        results.push({
          locationId: location.id,
          locationName: location.name,
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          },
        });
      }

      progress.failed++;
    }

    progress.completed++;
    progress.pending--;

    if (onProgress) {
      onProgress(progress);
    }

    // Delay between orders to avoid rate limiting (500ms)
    if (progress.pending > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ==================== Helper Functions ====================

/**
 * Generate summary statistics from bulk feasibility results
 */
export function summarizeFeasibilityResults(results: BulkFeasibilityResult[]): {
  total: number;
  feasible: number;
  infeasible: number;
  errors: number;
  averageFeasibilityScore: number;
  averageWeatherScore: number;
  totalOpportunities: number;
} {
  const feasible = results.filter(r => r.feasible && !r.error).length;
  const infeasible = results.filter(r => !r.feasible && !r.error).length;
  const errors = results.filter(r => r.error).length;

  const validResults = results.filter(r => !r.error);

  const avgFeasibilityScore = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.feasibilityScore, 0) / validResults.length
    : 0;

  const avgWeatherScore = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.weatherScore, 0) / validResults.length
    : 0;

  const totalOpportunities = validResults.reduce((sum, r) => sum + r.opportunityCount, 0);

  return {
    total: results.length,
    feasible,
    infeasible,
    errors,
    averageFeasibilityScore: Math.round(avgFeasibilityScore * 100) / 100,
    averageWeatherScore: Math.round(avgWeatherScore * 100) / 100,
    totalOpportunities,
  };
}

/**
 * Generate summary statistics from bulk order results
 */
export function summarizeOrderResults(results: BulkOrderResult[]): {
  total: number;
  successful: number;
  failed: number;
  orderIds: string[];
} {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const orderIds = results.filter(r => r.orderId).map(r => r.orderId!);

  return {
    total: results.length,
    successful,
    failed,
    orderIds,
  };
}
