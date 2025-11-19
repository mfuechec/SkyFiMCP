/**
 * Pricing and Feasibility Tools
 * MCP tools for pricing estimation and order feasibility checks
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import { createSkyFiClient, SkyFiApiException } from '../services/skyfi/client.js';
import type {
  PricingRequest,
  PricingResponse,
  FeasibilityResponse,
  FeasibilityRequest,
  GeoJSON,
  GeoJSONPoint,
} from '../services/skyfi/types.js';
import { geoJSONToWKT } from '../services/skyfi/types.js';

// ==================== Helper Functions ====================

/**
 * Convert numeric resolution to API string enum array
 * Returns an array with appropriate resolution levels based on input
 */
function convertResolutionToEnumArray(resolution: string | number): string[] {
  // Valid resolution enum values (with underscores as per API spec)
  const validEnums = ['MEDIUM', 'HIGH', 'VERY_HIGH'];

  // If already a valid string enum, return as array
  if (typeof resolution === 'string') {
    // Normalize: replace spaces with underscores and uppercase
    const normalized = resolution.toUpperCase().replace(/\s+/g, '_');
    if (validEnums.includes(normalized)) {
      return [normalized];
    }
    // Try to parse as number
    const num = parseFloat(resolution);
    if (!isNaN(num)) {
      resolution = num;
    } else {
      throw new Error(`Invalid resolution: "${resolution}". Must be numeric (0.5, 1, 2, 5) or one of: ${validEnums.join(', ')}`);
    }
  }

  // Convert numeric to appropriate resolution levels
  // Return array with resolutions that can achieve the requested GSD
  if (typeof resolution === 'number') {
    if (resolution <= 1) {
      // High resolution request - include all levels that could work
      return ['VERY_HIGH'];
    } else if (resolution <= 3) {
      return ['VERY_HIGH', 'HIGH'];
    } else if (resolution <= 5) {
      return ['HIGH', 'MEDIUM'];
    } else {
      return ['MEDIUM'];
    }
  }

  throw new Error(`Invalid resolution type: ${typeof resolution}`);
}

/**
 * Convert date to ISO 8601 format with timezone
 */
function convertDateToISO(date: string): string {
  // If already has timezone info, return as-is
  if (date.includes('+') || date.includes('Z')) {
    return date;
  }

  // Parse the date and add timezone
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${date}"`);
  }

  // Return in ISO format with UTC timezone
  return parsed.toISOString().replace('.000Z', '+00:00');
}

/**
 * Parse location input to WKT format
 */
function parseLocationToWKT(location: string | Record<string, unknown>): string {
  // If it's a string, check various formats
  if (typeof location === 'string') {
    // Check if already WKT
    if (location.toUpperCase().startsWith('POLYGON')) {
      return location;
    }

    // Check if coordinate string
    const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      const geojson: GeoJSONPoint = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      return geoJSONToWKT(geojson);
    }

    // Try parsing as GeoJSON
    try {
      const parsed = JSON.parse(location);
      if (parsed.type === 'Point' || parsed.type === 'Polygon') {
        return geoJSONToWKT(parsed as GeoJSON);
      }
    } catch {
      // Not JSON
    }

    throw new Error(
      `Invalid location format: "${location}". ` +
      `Location must be numeric coordinates:\n` +
      `- Coordinates: "37.7749,-122.4194"\n` +
      `- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'\n` +
      `- WKT POLYGON\n\n` +
      `Place names are not supported.`
    );
  }

  // If it's an object, assume it's GeoJSON
  if (location.type === 'Point' || location.type === 'Polygon') {
    return geoJSONToWKT(location as unknown as GeoJSON);
  }

  throw new Error(
    `Invalid location format. Expected coordinates "lat,lng", GeoJSON, or WKT POLYGON.`
  );
}

// ==================== Get Pricing Estimate Tool ====================

const getPricingEstimateDefinition = {
  name: 'get_pricing_estimate',
  description: `Get pricing information for satellite imagery. Returns a pricing matrix for available products and resolutions.

Location format (optional):
- Coordinates: "37.7749,-122.4194" (latitude,longitude)
- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'
- WKT POLYGON: "POLYGON((-122.42 37.77, -122.41 37.77, -122.41 37.78, -122.42 37.78, -122.42 37.77))"

If no location provided, returns general pricing matrix.`,
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON',
      },
    },
    required: [],
  },
};

async function getPricingEstimateHandler(
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
            message: 'SKYFI_API_KEY environment variable is not set on the server',
          }),
        },
      ],
      isError: true,
    };
  }

  const locationInput = args.location as string | undefined;

  try {
    const client = createSkyFiClient({ apiKey });

    // Build the pricing request
    const pricingRequest: PricingRequest = {};

    // Add optional AOI
    if (locationInput) {
      pricingRequest.aoi = parseLocationToWKT(locationInput);
    }

    const response: PricingResponse = await client.getPricing(pricingRequest);

    // Format the response - return the full productTypes matrix
    const formattedResponse = {
      success: true,
      pricing: {
        productTypes: response.productTypes,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResponse, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof SkyFiApiException) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.code,
              message: error.message,
              statusCode: error.statusCode,
              details: error.details,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Check Order Feasibility Tool ====================

const checkOrderFeasibilityDefinition = {
  name: 'check_order_feasibility',
  description: `Check if a satellite imagery tasking order is feasible for a given location and time window.

ALL PARAMETERS ARE REQUIRED.

Location format:
- Coordinates: "37.7749,-122.4194" (latitude,longitude)
- GeoJSON or WKT POLYGON also accepted

Resolution: Can be numeric (0.5, 1, 2, 5) or string (MEDIUM, HIGH, VERY_HIGH) - will be auto-converted.

Dates: Any format accepted (2025-01-15, 2025-01-15T00:00:00Z, etc.) - will be auto-converted.

Product types: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, STEREO`,
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'REQUIRED. Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON.',
      },
      productType: {
        type: 'string',
        enum: ['DAY', 'NIGHT', 'VIDEO', 'SAR', 'HYPERSPECTRAL', 'MULTISPECTRAL', 'STEREO'],
        description: 'REQUIRED. Product type: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, or STEREO',
      },
      resolution: {
        type: ['string', 'number'],
        description: 'REQUIRED. Resolution - numeric (0.5, 1, 2, 5) or string (MEDIUM, HIGH, VERY_HIGH)',
      },
      startDate: {
        type: 'string',
        description: 'REQUIRED. Start date (e.g., "2025-01-15" or "2025-01-15T00:00:00Z")',
      },
      endDate: {
        type: 'string',
        description: 'REQUIRED. End date (e.g., "2025-02-15" or "2025-02-15T00:00:00Z")',
      },
      maxCloudCoveragePercent: {
        type: 'integer',
        description: 'Maximum acceptable cloud coverage percentage (0-100)',
      },
      requiredProvider: {
        type: 'string',
        enum: ['PLANET', 'UMBRA'],
        description: 'Specific provider to use: PLANET or UMBRA',
      },
    },
    required: ['location', 'productType', 'resolution', 'startDate', 'endDate'],
  },
};

async function checkOrderFeasibilityHandler(
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
            message: 'SKYFI_API_KEY environment variable is not set on the server',
          }),
        },
      ],
      isError: true,
    };
  }

  const locationInput = args.location as string | undefined;

  if (!locationInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Location is required',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate all required fields
  const productType = args.productType as string | undefined;
  const resolutionInput = args.resolution as string | number | undefined;
  const startDateInput = args.startDate as string | undefined;
  const endDateInput = args.endDate as string | undefined;

  if (!productType) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'productType is required. Must be one of: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, STEREO',
          }),
        },
      ],
      isError: true,
    };
  }

  if (resolutionInput === undefined) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'resolution is required. Can be numeric (0.3, 0.5, 1, 2, 5) or string (HIGH, VERY HIGH, etc.)',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!startDateInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'startDate is required',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!endDateInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'endDate is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });

    // Parse location to WKT
    const aoi = parseLocationToWKT(locationInput);

    // Convert resolution to API enum array format
    const resolution = convertResolutionToEnumArray(resolutionInput);

    // Convert dates to ISO 8601 with timezone
    const startDate = convertDateToISO(startDateInput);
    const endDate = convertDateToISO(endDateInput);

    // Build the feasibility request with all required fields
    const feasibilityRequest: FeasibilityRequest = {
      aoi,
      productType,
      resolution,
      startDate,
      endDate,
    };

    // Add optional fields
    if (args.maxCloudCoveragePercent !== undefined) {
      feasibilityRequest.maxCloudCoveragePercent = args.maxCloudCoveragePercent as number;
    }

    if (args.requiredProvider) {
      feasibilityRequest.requiredProvider = args.requiredProvider as string;
    }

    const response: FeasibilityResponse = await client.checkFeasibility(feasibilityRequest);

    // Format the response with detailed information
    if (response.feasible) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              feasibility: {
                feasible: true,
                message: 'Order is feasible and can be processed',
                feasibilityId: response.feasibilityId,
                passPredictions: response.passPredictions,
              },
            }, null, 2),
          },
        ],
      };
    } else {
      // Provide detailed error messaging for infeasible orders
      const infeasibilityDetails = formatInfeasibilityDetails(
        response.reason,
        response.alternatives,
        args
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              feasibility: {
                feasible: false,
                reason: response.reason,
                detailedExplanation: infeasibilityDetails.explanation,
                suggestions: infeasibilityDetails.suggestions,
                alternatives: response.alternatives,
              },
            }, null, 2),
          },
        ],
      };
    }
  } catch (error) {
    if (error instanceof SkyFiApiException) {
      // Provide detailed error messaging for API errors
      const errorDetails = formatApiErrorDetails(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.code,
              message: error.message,
              statusCode: error.statusCode,
              details: error.details,
              troubleshooting: errorDetails,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            troubleshooting: {
              suggestion: 'Please try again or contact support if the issue persists',
            },
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Helper Functions ====================

/**
 * Format detailed explanation for infeasible orders
 */
function formatInfeasibilityDetails(
  reason: string | undefined,
  alternatives: string[] | undefined,
  args: Record<string, unknown>
): { explanation: string; suggestions: string[] } {
  const suggestions: string[] = [];
  let explanation = reason || 'Order cannot be fulfilled';

  // Analyze the reason and provide specific guidance
  if (reason) {
    const lowerReason = reason.toLowerCase();

    if (lowerReason.includes('resolution')) {
      explanation = `The requested resolution is not available for this location or provider.`;
      suggestions.push('Try a different resolution (e.g., 1m instead of 0.5m)');
      suggestions.push('Consider using a different imagery provider');
    } else if (lowerReason.includes('location') || lowerReason.includes('coverage')) {
      explanation = `The requested location is not covered by available satellite passes.`;
      suggestions.push('Expand the search area');
      suggestions.push('Try a different date range');
      suggestions.push('Consider archive imagery instead of new tasking');
    } else if (lowerReason.includes('date') || lowerReason.includes('time')) {
      explanation = `The requested capture date is not feasible.`;
      suggestions.push('Choose a later date to allow for satellite scheduling');
      suggestions.push('Check archive for existing imagery');
    } else if (lowerReason.includes('weather') || lowerReason.includes('cloud')) {
      explanation = `Weather conditions prevent reliable imagery capture.`;
      suggestions.push('Try SAR imagery which can penetrate clouds');
      suggestions.push('Choose a different time period with better weather forecast');
    } else if (lowerReason.includes('capacity') || lowerReason.includes('busy')) {
      explanation = `Satellite capacity is fully booked for the requested period.`;
      suggestions.push('Try a different date range');
      suggestions.push('Consider lower priority delivery');
    } else if (lowerReason.includes('area') || lowerReason.includes('size')) {
      explanation = `The requested area of interest is outside acceptable bounds.`;
      suggestions.push('Check minimum area requirements');
      suggestions.push('Adjust polygon boundaries');
    }
  }

  // Add suggestions based on request parameters
  if (args.resolution && (args.resolution as number) < 0.5) {
    suggestions.push('Very high resolution (<0.5m) has limited provider availability');
  }

  // Add alternative-based suggestions
  if (alternatives && alternatives.length > 0) {
    suggestions.push(`Consider these alternatives: ${alternatives.join(', ')}`);
  }

  // Default suggestions if none were added
  if (suggestions.length === 0) {
    suggestions.push('Contact support for more information');
    suggestions.push('Try adjusting your request parameters');
  }

  return { explanation, suggestions };
}

/**
 * Format detailed troubleshooting info for API errors
 */
function formatApiErrorDetails(error: SkyFiApiException): {
  possibleCauses: string[];
  suggestions: string[];
} {
  const possibleCauses: string[] = [];
  const suggestions: string[] = [];

  switch (error.statusCode) {
    case 400:
      possibleCauses.push('Invalid request parameters');
      possibleCauses.push('Malformed WKT coordinates');
      possibleCauses.push('Invalid date format');
      suggestions.push('Verify all required fields are provided');
      suggestions.push('Check WKT POLYGON format');
      suggestions.push('Use ISO 8601 date format');
      break;
    case 401:
      possibleCauses.push('Invalid API key');
      possibleCauses.push('Expired API key');
      suggestions.push('Verify your API key is correct');
      suggestions.push('Generate a new API key if needed');
      break;
    case 403:
      possibleCauses.push('Insufficient permissions');
      possibleCauses.push('Account not authorized for this operation');
      suggestions.push('Check your account permissions');
      suggestions.push('Contact support to upgrade access');
      break;
    case 404:
      possibleCauses.push('Resource not found');
      suggestions.push('Verify the request parameters');
      suggestions.push('Search archive for available imagery');
      break;
    case 429:
      possibleCauses.push('Rate limit exceeded');
      suggestions.push('Wait before making more requests');
      suggestions.push('Consider upgrading your plan for higher limits');
      break;
    default:
      possibleCauses.push('Server error');
      suggestions.push('Try again later');
      suggestions.push('Contact support if issue persists');
  }

  return { possibleCauses, suggestions };
}

// ==================== Tool Registration ====================

export function registerPricingTools(): void {
  toolRegistry.register(getPricingEstimateDefinition, getPricingEstimateHandler);
  toolRegistry.register(checkOrderFeasibilityDefinition, checkOrderFeasibilityHandler);
}

// Export handlers for testing
export {
  getPricingEstimateHandler,
  checkOrderFeasibilityHandler,
  formatInfeasibilityDetails,
  formatApiErrorDetails,
};
