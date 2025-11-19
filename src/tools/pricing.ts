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

    throw new Error(`Invalid location format: "${location}"`);
  }

  // If it's an object, assume it's GeoJSON
  if (location.type === 'Point' || location.type === 'Polygon') {
    return geoJSONToWKT(location as unknown as GeoJSON);
  }

  throw new Error('Invalid location format');
}

// ==================== Get Pricing Estimate Tool ====================

const getPricingEstimateDefinition = {
  name: 'get_pricing_estimate',
  description:
    'Calculate pricing estimate for satellite imagery based on area of interest and desired resolutions/products.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Location as coordinates "lat,lng", GeoJSON string, or WKT POLYGON',
      },
      products: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of product types to get pricing for (optional)',
      },
      resolutions: {
        type: 'array',
        items: { type: 'number' },
        description: 'List of resolution values in meters to get pricing for (optional)',
      },
    },
    required: ['location'],
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

  try {
    const client = createSkyFiClient({ apiKey });

    // Parse location to WKT
    const aoi = parseLocationToWKT(locationInput);

    // Build the pricing request
    const pricingRequest: PricingRequest = {
      aoi,
    };

    if (args.products) {
      pricingRequest.products = args.products as string[];
    }

    if (args.resolutions) {
      pricingRequest.resolutions = args.resolutions as number[];
    }

    const response: PricingResponse = await client.getPricing(pricingRequest);

    // Format the response
    const formattedResponse = {
      success: true,
      pricing: {
        price: response.price,
        currency: response.currency,
        provider: response.provider,
        estimatedDelivery: response.estimatedDelivery,
        minimumAoi: response.minimumAoi,
        breakdown: response.breakdown,
        priceMatrix: response.priceMatrix,
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
  description:
    'Check if an order for satellite imagery is feasible. Returns whether the order can be fulfilled, reasons if not feasible, and alternative options.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Location as coordinates "lat,lng", GeoJSON string, or WKT POLYGON',
      },
      dateFrom: {
        type: 'string',
        description: 'Start date for feasibility check in ISO 8601 format',
      },
      dateTo: {
        type: 'string',
        description: 'End date for feasibility check in ISO 8601 format',
      },
      resolution: {
        type: 'number',
        description: 'Desired resolution in meters',
      },
    },
    required: ['location'],
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

  try {
    const client = createSkyFiClient({ apiKey });

    // Parse location to WKT
    const aoi = parseLocationToWKT(locationInput);

    // Build the feasibility request
    const feasibilityRequest: FeasibilityRequest = {
      aoi,
    };

    if (args.dateFrom) {
      feasibilityRequest.dateFrom = args.dateFrom as string;
    }

    if (args.dateTo) {
      feasibilityRequest.dateTo = args.dateTo as string;
    }

    if (args.resolution) {
      feasibilityRequest.resolution = args.resolution as number;
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
