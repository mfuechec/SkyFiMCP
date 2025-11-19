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
  TaskingRequest,
  GeoJSON,
  ImageType,
} from '../services/skyfi/types.js';

// ==================== Get Pricing Estimate Tool ====================

const getPricingEstimateDefinition = {
  name: 'get_pricing_estimate',
  description:
    'Calculate pricing estimate for satellite imagery based on image ID or tasking request. Returns price breakdown, estimated delivery time, and provider information.',
  inputSchema: {
    type: 'object',
    properties: {
      imageId: {
        type: 'string',
        description: 'ID of existing archive imagery to get pricing for',
      },
      taskingRequest: {
        type: 'object',
        description: 'Tasking request for new imagery capture',
        properties: {
          location: {
            type: 'object',
            description: 'GeoJSON Point or Polygon for the area of interest',
            properties: {
              type: {
                type: 'string',
                enum: ['Point', 'Polygon'],
                description: 'GeoJSON geometry type',
              },
              coordinates: {
                description:
                  'Coordinates: [longitude, latitude] for Point, or array of coordinate rings for Polygon',
              },
            },
            required: ['type', 'coordinates'],
          },
          resolution: {
            type: 'string',
            description: 'Desired image resolution (e.g., "0.5m", "1m", "3m")',
          },
          captureDate: {
            type: 'string',
            description: 'Desired capture date in ISO 8601 format (optional)',
          },
          imageType: {
            type: 'string',
            enum: ['optical', 'sar', 'multispectral', 'hyperspectral'],
            description: 'Type of imagery (default: optical)',
          },
        },
        required: ['location', 'resolution'],
      },
    },
    oneOf: [
      { required: ['imageId'] },
      { required: ['taskingRequest'] },
    ],
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

  const imageId = args.imageId as string | undefined;
  const taskingRequestInput = args.taskingRequest as Record<string, unknown> | undefined;

  // Validate that either imageId or taskingRequest is provided
  if (!imageId && !taskingRequestInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Either imageId or taskingRequest must be provided',
            details: {
              hint: 'Provide imageId for existing archive imagery, or taskingRequest for new capture',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  if (imageId && taskingRequestInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Only one of imageId or taskingRequest should be provided, not both',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });

    // Build the pricing request
    const pricingRequest: PricingRequest = {};

    if (imageId) {
      pricingRequest.imageId = imageId;
    } else if (taskingRequestInput) {
      const locationInput = taskingRequestInput.location as Record<string, unknown>;

      const taskingRequest: TaskingRequest = {
        location: {
          type: locationInput.type as 'Point' | 'Polygon',
          coordinates: locationInput.coordinates,
        } as GeoJSON,
        resolution: taskingRequestInput.resolution as string,
      };

      if (taskingRequestInput.captureDate) {
        taskingRequest.captureDate = taskingRequestInput.captureDate as string;
      }

      if (taskingRequestInput.imageType) {
        taskingRequest.imageType = taskingRequestInput.imageType as ImageType;
      }

      pricingRequest.taskingRequest = taskingRequest;
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
      imageId: {
        type: 'string',
        description: 'ID of existing archive imagery to check feasibility for',
      },
      taskingRequest: {
        type: 'object',
        description: 'Tasking request for new imagery capture',
        properties: {
          location: {
            type: 'object',
            description: 'GeoJSON Point or Polygon for the area of interest',
            properties: {
              type: {
                type: 'string',
                enum: ['Point', 'Polygon'],
                description: 'GeoJSON geometry type',
              },
              coordinates: {
                description:
                  'Coordinates: [longitude, latitude] for Point, or array of coordinate rings for Polygon',
              },
            },
            required: ['type', 'coordinates'],
          },
          resolution: {
            type: 'string',
            description: 'Desired image resolution (e.g., "0.5m", "1m", "3m")',
          },
          captureDate: {
            type: 'string',
            description: 'Desired capture date in ISO 8601 format (optional)',
          },
          imageType: {
            type: 'string',
            enum: ['optical', 'sar', 'multispectral', 'hyperspectral'],
            description: 'Type of imagery (default: optical)',
          },
        },
        required: ['location', 'resolution'],
      },
    },
    oneOf: [
      { required: ['imageId'] },
      { required: ['taskingRequest'] },
    ],
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

  const imageId = args.imageId as string | undefined;
  const taskingRequestInput = args.taskingRequest as Record<string, unknown> | undefined;

  // Validate that either imageId or taskingRequest is provided
  if (!imageId && !taskingRequestInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Either imageId or taskingRequest must be provided',
            details: {
              hint: 'Provide imageId for existing archive imagery, or taskingRequest for new capture',
              commonReasons: [
                'Missing required parameters',
                'Invalid input format',
              ],
            },
          }),
        },
      ],
      isError: true,
    };
  }

  if (imageId && taskingRequestInput) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Only one of imageId or taskingRequest should be provided, not both',
            details: {
              hint: 'Use imageId for archive imagery or taskingRequest for new capture, not both',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });

    // Build the pricing request (same structure used for feasibility)
    const pricingRequest: PricingRequest = {};

    if (imageId) {
      pricingRequest.imageId = imageId;
    } else if (taskingRequestInput) {
      const locationInput = taskingRequestInput.location as Record<string, unknown>;

      const taskingRequest: TaskingRequest = {
        location: {
          type: locationInput.type as 'Point' | 'Polygon',
          coordinates: locationInput.coordinates,
        } as GeoJSON,
        resolution: taskingRequestInput.resolution as string,
      };

      if (taskingRequestInput.captureDate) {
        taskingRequest.captureDate = taskingRequestInput.captureDate as string;
      }

      if (taskingRequestInput.imageType) {
        taskingRequest.imageType = taskingRequestInput.imageType as ImageType;
      }

      pricingRequest.taskingRequest = taskingRequest;
    }

    const response: FeasibilityResponse = await client.checkFeasibility(pricingRequest);

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
        taskingRequestInput
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
  taskingRequest: Record<string, unknown> | undefined
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

  // Add suggestions based on tasking request parameters
  if (taskingRequest) {
    if (taskingRequest.imageType === 'hyperspectral') {
      suggestions.push('Hyperspectral imagery has limited availability - consider multispectral as alternative');
    }
    if (taskingRequest.resolution && parseFloat(taskingRequest.resolution as string) < 0.5) {
      suggestions.push('Very high resolution (<0.5m) has limited provider availability');
    }
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
      possibleCauses.push('Malformed GeoJSON coordinates');
      possibleCauses.push('Invalid date format');
      suggestions.push('Verify all required fields are provided');
      suggestions.push('Check coordinate format: [longitude, latitude]');
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
      possibleCauses.push('Image ID not found');
      possibleCauses.push('Resource does not exist');
      suggestions.push('Verify the image ID is correct');
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
