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
 * Convert numeric resolution to API string enum
 * Returns a single resolution string with proper formatting (spaces, not underscores)
 * Valid values: LOW, MEDIUM, HIGH, VERY HIGH, SUPER HIGH, ULTRA HIGH, CM 30, CM 50
 */
function convertResolutionToEnum(resolution: string | number): string {
  // Valid resolution enum values (with spaces as per API spec)
  const validEnums = ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH', 'SUPER HIGH', 'ULTRA HIGH', 'CM 30', 'CM 50'];

  // If already a valid string enum, normalize and return
  if (typeof resolution === 'string') {
    // Normalize: replace underscores with spaces and uppercase
    const normalized = resolution.toUpperCase().replace(/_/g, ' ').trim();

    // Check if it's a valid enum
    if (validEnums.includes(normalized)) {
      return normalized;
    }

    // Try to parse as number
    const num = parseFloat(resolution);
    if (!isNaN(num)) {
      resolution = num;
    } else {
      // Default to VERY HIGH for unknown strings
      return 'VERY HIGH';
    }
  }

  // Convert numeric GSD (meters) to appropriate resolution level
  if (typeof resolution === 'number') {
    if (resolution <= 0.3) {
      return 'CM 30';
    } else if (resolution <= 0.5) {
      return 'CM 50';
    } else if (resolution <= 0.75) {
      return 'ULTRA HIGH';
    } else if (resolution <= 1) {
      return 'SUPER HIGH';
    } else if (resolution <= 1.5) {
      return 'VERY HIGH';
    } else if (resolution <= 3) {
      return 'HIGH';
    } else if (resolution <= 5) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  // Default fallback
  return 'VERY HIGH';
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
 * Validate that start date is within 14 days of today (API constraint)
 */
function validateStartDateConstraint(startDate: string): { valid: boolean; message?: string; suggestion?: string } {
  const start = new Date(startDate);
  const now = new Date();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (start > fourteenDaysFromNow) {
    const suggestedStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // Tomorrow
    return {
      valid: false,
      message: `Start date must be within 14 days of today. "${startDate}" is too far in the future.`,
      suggestion: `Use a start date like "${suggestedStart.toISOString().split('T')[0]}" (tomorrow) and extend the end date for a longer capture window.`,
    };
  }

  return { valid: true };
}

/**
 * Check if capture window is short and provide guidance
 */
function analyzeWindowDuration(startDate: string, endDate: string): { short: boolean; days: number; suggestion?: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

  if (days < 7) {
    return {
      short: true,
      days,
      suggestion: `Your capture window is only ${days} day(s). Consider extending to 30-60 days for more capture opportunities.`,
    };
  }

  return { short: false, days };
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

IMPORTANT API CONSTRAINTS:
- Start date MUST be within 14 days of today (API rejects dates further out)
- Longer capture windows (1-2 months) yield more opportunities
- SAR imagery has weather score 1.0 (unaffected by clouds) - best for guaranteed capture
- UMBRA provider specializes in SAR; PLANET in optical imagery

BEST PRACTICES:
- Use SAR + HIGH resolution for reliable feasibility (typically 0.95 score, 30+ opportunities)
- Extend end date to 1-2 months for maximum capture windows
- For optical (DAY), check weather forecast - poor weather will reduce feasibility

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

    // Convert resolution to API enum string format (with spaces)
    const resolution = convertResolutionToEnum(resolutionInput);

    // Convert dates to ISO 8601 with timezone
    const startDate = convertDateToISO(startDateInput);
    const endDate = convertDateToISO(endDateInput);

    // Validate start date is within 14 days (API constraint)
    const startDateValidation = validateStartDateConstraint(startDateInput);
    if (!startDateValidation.valid) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'DATE_CONSTRAINT_ERROR',
              message: startDateValidation.message,
              suggestion: startDateValidation.suggestion,
              tip: 'The SkyFi API only allows scheduling tasking orders up to 14 days in advance. Use a longer end date window instead.',
            }),
          },
        ],
        isError: true,
      };
    }

    // Analyze window duration and prepare warning if too short
    const windowAnalysis = analyzeWindowDuration(startDateInput, endDateInput);

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

    // Determine if feasible based on scores
    const feasibilityScore = response.overallScore.feasibility;
    const weatherScore = response.overallScore.weatherScore.weatherScore;
    const providerScores = response.overallScore.providerScore.providerScores;

    // Check if any providers have positive scores or opportunities
    const hasProviderOpportunities = providerScores.some(
      p => p.score > 0 || (p.opportunities && p.opportunities.length > 0)
    );

    // Consider feasible if overall score > 0 or if we have provider opportunities
    const isFeasible = feasibilityScore > 0 || hasProviderOpportunities;

    // Format the response with actual API data
    const formattedResponse: Record<string, unknown> = {
      success: true,
      feasibility: {
        feasible: isFeasible,
        feasibilityId: response.id,
        validUntil: response.validUntil,
        scores: {
          overall: feasibilityScore,
          weather: weatherScore,
          provider: response.overallScore.providerScore.score,
        },
        windowDuration: `${windowAnalysis.days} days`,
        weatherDetails: response.overallScore.weatherScore.weatherDetails,
        providers: providerScores.map(p => ({
          provider: p.provider,
          score: p.score,
          status: p.status,
          opportunityCount: p.opportunities?.length || 0,
          opportunities: p.opportunities || [],
        })),
      },
    };

    // Add window duration warning if applicable
    if (windowAnalysis.short) {
      (formattedResponse.feasibility as Record<string, unknown>).windowWarning = windowAnalysis.suggestion;
    }

    // Add interpretation message
    if (isFeasible) {
      const totalOpportunities = providerScores.reduce(
        (sum, p) => sum + (p.opportunities?.length || 0), 0
      );
      (formattedResponse.feasibility as Record<string, unknown>).message =
        `Order is feasible with ${totalOpportunities} capture opportunity(s)`;

      // Add recommendation for better results if window is short
      if (windowAnalysis.short) {
        (formattedResponse.feasibility as Record<string, unknown>).recommendation =
          'Consider extending your capture window to 30-60 days for more opportunities and flexibility.';
      }
    } else {
      // Determine reason for infeasibility
      let reason = 'Order is not feasible';
      const suggestions: string[] = [];

      // Check for weather issues (only relevant for optical imagery)
      const isOptical = ['DAY', 'NIGHT', 'VIDEO', 'STEREO', 'MULTISPECTRAL', 'HYPERSPECTRAL'].includes(productType);
      if (isOptical && weatherScore < 0.3 && weatherScore >= 0) {
        reason = 'Poor weather conditions expected for optical imagery';
        suggestions.push('**Recommended: Use SAR imagery** - SAR has weather score 1.0 (unaffected by clouds)');
        suggestions.push('SAR + HIGH resolution with UMBRA typically yields 30+ capture opportunities');
        suggestions.push('If optical is required, try a different date range with better weather forecast');
      }

      // Check for short window
      if (windowAnalysis.short) {
        suggestions.push(`Extend capture window from ${windowAnalysis.days} days to 30-60 days for more opportunities`);
      }

      if (providerScores.length === 0) {
        reason = 'No providers available for this configuration';
        suggestions.push('Try SAR + HIGH resolution (reliably available from UMBRA)');
        suggestions.push('Check pricing endpoint to see all available product/resolution combinations');
      } else {
        const errorProviders = providerScores.filter(p => p.status === 'ERROR');
        if (errorProviders.length > 0) {
          reason = `Provider(s) returned errors: ${errorProviders.map(p => p.provider).join(', ')}`;

          // Suggest UMBRA for SAR if not already using it
          if (productType === 'SAR' && !errorProviders.some(p => p.provider === 'UMBRA')) {
            suggestions.push('Try specifying requiredProvider: "UMBRA" for SAR imagery');
          } else if (isOptical) {
            suggestions.push('**Recommended: Switch to SAR** - more reliable availability');
          }

          suggestions.push('Extend the date window to 30-60 days for more capture opportunities');
        }
      }

      (formattedResponse.feasibility as Record<string, unknown>).reason = reason;
      (formattedResponse.feasibility as Record<string, unknown>).suggestions = suggestions;

      // Add a recommended alternative configuration
      if (isOptical || providerScores.length === 0 || providerScores.every(p => p.status === 'ERROR')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const twoMonthsOut = new Date();
        twoMonthsOut.setMonth(twoMonthsOut.getMonth() + 2);

        (formattedResponse.feasibility as Record<string, unknown>).recommendedAlternative = {
          description: 'High-reliability configuration based on tested API behavior',
          productType: 'SAR',
          resolution: 'HIGH',
          provider: 'UMBRA',
          startDate: tomorrow.toISOString().split('T')[0],
          endDate: twoMonthsOut.toISOString().split('T')[0],
          expectedScore: '~0.95',
          expectedOpportunities: '30+',
        };
      }
    }

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
  formatApiErrorDetails,
};
