/**
 * Bulk Operations Tools
 * MCP tools for bulk feasibility checks and order placement
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import {
  executeBulkFeasibilityCheck,
  executeBulkOrderPlacement,
  summarizeFeasibilityResults,
  summarizeOrderResults,
  type BulkLocation,
  type BulkFeasibilityRequest,
  type BulkOrderRequest,
  type BulkFeasibilityProgress,
  type BulkOrderProgress,
} from '../services/bulk/operations.js';

// ==================== Bulk Feasibility Check Tool ====================

const bulkFeasibilityCheckDefinition = {
  name: 'bulk_feasibility_check',
  description: `Check feasibility for satellite imagery orders across multiple locations (up to 100).

This tool processes locations sequentially with progress tracking and handles errors gracefully.

**Location Format:**
Each location must have:
- id: Unique identifier
- location: WKT POLYGON or POINT format
- name: Optional human-readable name
- metadata: Optional additional data

**Example:**
\`\`\`json
{
  "locations": [
    {
      "id": "loc1",
      "name": "San Francisco HQ",
      "location": "POINT(-122.4194 37.7749)"
    },
    {
      "id": "loc2",
      "name": "Austin Office",
      "location": "POINT(-97.7431 30.2672)"
    }
  ],
  "productType": "SAR",
  "resolution": "HIGH",
  "startDate": "2025-01-20",
  "endDate": "2025-03-20"
}
\`\`\`

**Best Practices:**
- Use SAR for reliable all-weather feasibility
- Extend capture window to 30-60 days for more opportunities
- Limit to 100 locations per request
- Sequential processing prevents rate limiting`,
  inputSchema: {
    type: 'object',
    properties: {
      locations: {
        type: 'array',
        description: 'Array of locations to check (max 100)',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for this location',
            },
            name: {
              type: 'string',
              description: 'Optional human-readable name',
            },
            location: {
              type: 'string',
              description: 'WKT POLYGON or POINT format',
            },
            metadata: {
              type: 'object',
              description: 'Optional additional data',
            },
          },
          required: ['id', 'location'],
        },
        maxItems: 100,
      },
      productType: {
        type: 'string',
        enum: ['DAY', 'NIGHT', 'VIDEO', 'SAR', 'HYPERSPECTRAL', 'MULTISPECTRAL', 'STEREO'],
        description: 'Product type for all locations',
      },
      resolution: {
        type: 'string',
        description: 'Resolution (HIGH, VERY HIGH, etc.)',
      },
      startDate: {
        type: 'string',
        description: 'Start date (ISO format)',
      },
      endDate: {
        type: 'string',
        description: 'End date (ISO format)',
      },
      maxCloudCoveragePercent: {
        type: 'integer',
        description: 'Max cloud coverage (0-100)',
      },
      requiredProvider: {
        type: 'string',
        enum: ['PLANET', 'UMBRA'],
        description: 'Specific provider (optional)',
      },
    },
    required: ['locations', 'productType', 'resolution', 'startDate', 'endDate'],
  },
};

async function bulkFeasibilityCheckHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const apiKey = process.env.SKYFI_API_KEY;
  if (!apiKey) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'CONFIGURATION_ERROR',
            message: 'SKYFI_API_KEY environment variable is not set',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate locations
  const locations = args.locations as BulkLocation[] | undefined;
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'locations array is required and must contain at least one location',
          }),
        },
      ],
      isError: true,
    };
  }

  if (locations.length > 100) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: `Too many locations: ${locations.length}. Maximum is 100 per request.`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate required fields
  const productType = args.productType as string | undefined;
  const resolution = args.resolution as string | undefined;
  const startDate = args.startDate as string | undefined;
  const endDate = args.endDate as string | undefined;

  if (!productType || !resolution || !startDate || !endDate) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'productType, resolution, startDate, and endDate are all required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    // Build bulk request
    const request: BulkFeasibilityRequest = {
      locations,
      productType,
      resolution,
      startDate,
      endDate,
      maxCloudCoveragePercent: args.maxCloudCoveragePercent as number | undefined,
      requiredProvider: args.requiredProvider as string | undefined,
    };

    // Track progress updates
    const progressUpdates: (BulkFeasibilityProgress | BulkOrderProgress)[] = [];

    // Execute bulk feasibility check with progress tracking
    const results = await executeBulkFeasibilityCheck(
      request,
      apiKey,
      (progress) => {
        progressUpdates.push({ ...progress });
        console.log(
          `[Bulk Feasibility] Progress: ${progress.completed}/${progress.total} ` +
          `(${progress.successful} success, ${progress.failed} failed) ` +
          `${progress.currentLocation ? `- ${progress.currentLocation}` : ''}`
        );
      }
    );

    // Generate summary
    const summary = summarizeFeasibilityResults(results);

    const response = {
      success: true,
      summary: {
        total: summary.total,
        feasible: summary.feasible,
        infeasible: summary.infeasible,
        errors: summary.errors,
        averageScores: {
          feasibility: summary.averageFeasibilityScore,
          weather: summary.averageWeatherScore,
        },
        totalOpportunities: summary.totalOpportunities,
      },
      results: results.map(r => ({
        locationId: r.locationId,
        locationName: r.locationName,
        feasible: r.feasible,
        feasibilityScore: r.feasibilityScore,
        weatherScore: r.weatherScore,
        opportunityCount: r.opportunityCount,
        error: r.error,
      })),
      progressLog: progressUpdates,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'BULK_OPERATION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Bulk Order Placement Tool ====================

const bulkOrderPlacementDefinition = {
  name: 'bulk_order_with_confirmation',
  description: `Place satellite imagery orders for multiple locations (up to 100).

**IMPORTANT:** This places REAL orders and will charge your account. Use bulk_feasibility_check first.

**Confirmation Token Required:**
You must provide a confirmation token to prove the user explicitly approved bulk ordering.

**Location Format:**
Same as bulk_feasibility_check - array of locations with id, location (WKT), and optional name/metadata.

**Example:**
\`\`\`json
{
  "locations": [...],
  "productType": "SAR",
  "resolution": "HIGH",
  "startDate": "2025-01-20",
  "endDate": "2025-03-20",
  "confirmationToken": "USER_CONFIRMED_12345",
  "deliveryConfig": {
    "bucket": "s3://my-bucket",
    "path": "imagery/"
  }
}
\`\`\`

**Best Practices:**
- Always run bulk_feasibility_check first
- Show user total estimated cost before ordering
- Use meaningful confirmation tokens
- Limit to 100 locations per request`,
  inputSchema: {
    type: 'object',
    properties: {
      locations: {
        type: 'array',
        description: 'Array of locations to order imagery for (max 100)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            location: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['id', 'location'],
        },
        maxItems: 100,
      },
      productType: {
        type: 'string',
        enum: ['DAY', 'NIGHT', 'VIDEO', 'SAR', 'HYPERSPECTRAL', 'MULTISPECTRAL', 'STEREO'],
      },
      resolution: {
        type: 'string',
      },
      startDate: {
        type: 'string',
      },
      endDate: {
        type: 'string',
      },
      confirmationToken: {
        type: 'string',
        description: 'REQUIRED: User confirmation token to authorize bulk ordering',
      },
      deliveryConfig: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'S3/GCS bucket URL',
          },
          path: {
            type: 'string',
            description: 'Optional path within bucket',
          },
        },
        required: ['bucket'],
      },
      maxCloudCoveragePercent: {
        type: 'integer',
      },
      requiredProvider: {
        type: 'string',
        enum: ['PLANET', 'UMBRA'],
      },
    },
    required: ['locations', 'productType', 'resolution', 'startDate', 'endDate', 'confirmationToken'],
  },
};

async function bulkOrderPlacementHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const apiKey = process.env.SKYFI_API_KEY;
  if (!apiKey) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'CONFIGURATION_ERROR',
            message: 'SKYFI_API_KEY environment variable is not set',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate confirmation token
  const confirmationToken = args.confirmationToken as string | undefined;
  if (!confirmationToken) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'CONFIRMATION_REQUIRED',
            message: 'Bulk ordering requires explicit user confirmation. Please provide a confirmationToken.',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate locations
  const locations = args.locations as BulkLocation[] | undefined;
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'locations array is required and must contain at least one location',
          }),
        },
      ],
      isError: true,
    };
  }

  if (locations.length > 100) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: `Too many locations: ${locations.length}. Maximum is 100 per request.`,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    // Build bulk order request
    const request: BulkOrderRequest = {
      locations,
      productType: args.productType as string,
      resolution: args.resolution as string,
      startDate: args.startDate as string,
      endDate: args.endDate as string,
      confirmationToken,
      deliveryConfig: args.deliveryConfig as { bucket: string; path?: string } | undefined,
      maxCloudCoveragePercent: args.maxCloudCoveragePercent as number | undefined,
      requiredProvider: args.requiredProvider as string | undefined,
    };

    // Track progress updates
    const progressUpdates: (BulkFeasibilityProgress | BulkOrderProgress)[] = [];

    // Execute bulk order placement with progress tracking
    const results = await executeBulkOrderPlacement(
      request,
      apiKey,
      (progress) => {
        progressUpdates.push({ ...progress });
        console.log(
          `[Bulk Orders] Progress: ${progress.completed}/${progress.total} ` +
          `(${progress.successful} success, ${progress.failed} failed) ` +
          `${progress.currentLocation ? `- ${progress.currentLocation}` : ''}`
        );
      }
    );

    // Generate summary
    const summary = summarizeOrderResults(results);

    const response = {
      success: true,
      summary: {
        total: summary.total,
        successful: summary.successful,
        failed: summary.failed,
        orderIds: summary.orderIds,
      },
      results: results.map(r => ({
        locationId: r.locationId,
        locationName: r.locationName,
        success: r.success,
        orderId: r.orderId,
        error: r.error,
      })),
      progressLog: progressUpdates,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'BULK_OPERATION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Tool Registration ====================

export function registerBulkOperationsTools(): void {
  toolRegistry.register(bulkFeasibilityCheckDefinition, bulkFeasibilityCheckHandler);
  toolRegistry.register(bulkOrderPlacementDefinition, bulkOrderPlacementHandler);
}

// Export handlers for testing
export {
  bulkFeasibilityCheckHandler,
  bulkOrderPlacementHandler,
};
