/**
 * Order Placement Tools
 * MCP tools for placing and managing satellite imagery orders
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import { createSkyFiClient, SkyFiApiException } from '../services/skyfi/client.js';
import type {
  PlaceArchiveOrderRequest,
  PlaceTaskingOrderRequest,
  Order,
  GeoJSON,
  GeoJSONPoint,
} from '../services/skyfi/types.js';
import { geoJSONToWKT } from '../services/skyfi/types.js';

// Helper to get API key from environment
function getApiKeyOrError(): { apiKey: string } | { error: MCPToolCallResponse } {
  const apiKey = process.env.SKYFI_API_KEY;
  if (!apiKey) {
    return {
      error: {
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
      },
    };
  }
  return { apiKey };
}

// Helper to parse location to WKT
function parseLocationToWKT(location: string): string {
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

// ==================== Place Archive Order Tool ====================

const placeArchiveOrderDefinition = {
  name: 'place_archive_order',
  description:
    'Place an order for existing archive satellite imagery. Use search_archive first to find available imagery.',
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'ID of the archive image to order (from search_archive results)',
      },
      deliveryBucket: {
        type: 'string',
        description: 'S3 bucket for delivery (optional)',
      },
      deliveryPath: {
        type: 'string',
        description: 'Path within the delivery bucket (optional)',
      },
    },
    required: ['archiveId'],
  },
};

async function placeArchiveOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const archiveId = args.archiveId as string | undefined;

  if (!archiveId || archiveId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Archive ID is required',
            details: {
              hint: 'Use search_archive to find available imagery and get the archiveId',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });

    const orderRequest: PlaceArchiveOrderRequest = {
      archiveId,
    };

    // Add delivery config if provided
    const deliveryBucket = args.deliveryBucket as string | undefined;
    const deliveryPath = args.deliveryPath as string | undefined;

    if (deliveryBucket || deliveryPath) {
      orderRequest.deliveryConfig = {};
      if (deliveryBucket) orderRequest.deliveryConfig.bucket = deliveryBucket;
      if (deliveryPath) orderRequest.deliveryConfig.path = deliveryPath;
    }

    const order: Order = await client.placeArchiveOrder(orderRequest);

    const formattedResponse = {
      success: true,
      order: {
        id: order.orderId || order.id,
        status: order.status,
        type: 'archive',
        archiveId: order.archiveId,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
        message: `Archive order ${order.orderId || order.id} has been placed successfully`,
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
      const errorDetails = formatOrderErrorDetails(error);

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
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Place Tasking Order Tool ====================

const placeTaskingOrderDefinition = {
  name: 'place_tasking_order',
  description:
    'Place a tasking order for new satellite imagery capture. Use check_order_feasibility first to verify availability.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Location as coordinates "lat,lng", GeoJSON string, or WKT POLYGON',
      },
      dateFrom: {
        type: 'string',
        description: 'Start date for capture window in ISO 8601 format',
      },
      dateTo: {
        type: 'string',
        description: 'End date for capture window in ISO 8601 format',
      },
      resolution: {
        type: 'number',
        description: 'Desired resolution in meters (optional)',
      },
      cloudCoverMax: {
        type: 'number',
        description: 'Maximum acceptable cloud coverage percentage (0-100, optional)',
      },
      offNadirMax: {
        type: 'number',
        description: 'Maximum off-nadir angle in degrees (optional)',
      },
      priority: {
        type: 'string',
        enum: ['standard', 'priority', 'urgent'],
        description: 'Order priority level (default: standard)',
      },
      deliveryBucket: {
        type: 'string',
        description: 'S3 bucket for delivery (optional)',
      },
      deliveryPath: {
        type: 'string',
        description: 'Path within the delivery bucket (optional)',
      },
    },
    required: ['location', 'dateFrom', 'dateTo'],
  },
};

async function placeTaskingOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const locationInput = args.location as string | undefined;
  const dateFrom = args.dateFrom as string | undefined;
  const dateTo = args.dateTo as string | undefined;

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

  if (!dateFrom || !dateTo) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Both dateFrom and dateTo are required',
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

    const orderRequest: PlaceTaskingOrderRequest = {
      aoi,
      dateFrom,
      dateTo,
    };

    // Add optional parameters
    if (args.resolution !== undefined) {
      orderRequest.resolution = args.resolution as number;
    }
    if (args.cloudCoverMax !== undefined) {
      orderRequest.cloudCoverMax = args.cloudCoverMax as number;
    }
    if (args.offNadirMax !== undefined) {
      orderRequest.offNadirMax = args.offNadirMax as number;
    }
    if (args.priority) {
      orderRequest.priority = args.priority as 'standard' | 'priority' | 'urgent';
    }

    // Add delivery config if provided
    const deliveryBucket = args.deliveryBucket as string | undefined;
    const deliveryPath = args.deliveryPath as string | undefined;

    if (deliveryBucket || deliveryPath) {
      orderRequest.deliveryConfig = {};
      if (deliveryBucket) orderRequest.deliveryConfig.bucket = deliveryBucket;
      if (deliveryPath) orderRequest.deliveryConfig.path = deliveryPath;
    }

    const order: Order = await client.placeTaskingOrder(orderRequest);

    const formattedResponse = {
      success: true,
      order: {
        id: order.orderId || order.id,
        status: order.status,
        type: 'tasking',
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
        message: `Tasking order ${order.orderId || order.id} has been placed successfully`,
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
      const errorDetails = formatOrderErrorDetails(error);

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
          }),
        },
      ],
      isError: true,
    };
  }
}

// ==================== Get Order Status Tool ====================

const getOrderStatusDefinition = {
  name: 'get_order_status',
  description:
    'Check the status of an existing order. Returns order details including current status, progress, and deliverables.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'ID of the order to check status for',
      },
    },
    required: ['orderId'],
  },
};

async function getOrderStatusHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const orderId = args.orderId as string;

  if (!orderId || orderId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Order ID is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const order: Order = await client.getOrderStatus(orderId);

    const formattedResponse = {
      success: true,
      order: {
        id: order.orderId || order.id,
        status: order.status,
        type: order.type,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        estimatedDelivery: order.estimatedDelivery,
        progress: order.progress,
        deliverables: order.deliverables,
        errorMessage: order.errorMessage,
        statusDescription: getStatusDescription(order.status),
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

// ==================== List Orders Tool ====================

const listOrdersDefinition = {
  name: 'list_orders',
  description: 'List all orders for the authenticated user with optional filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of orders to return (default: 20)',
      },
      offset: {
        type: 'number',
        description: 'Number of orders to skip for pagination',
      },
      type: {
        type: 'string',
        enum: ['archive', 'tasking'],
        description: 'Filter orders by type',
      },
      status: {
        type: 'string',
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'delivered'],
        description: 'Filter orders by status',
      },
    },
  },
};

async function listOrdersHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  try {
    const client = createSkyFiClient({ apiKey });

    const request: {
      limit?: number;
      offset?: number;
      type?: 'archive' | 'tasking';
      status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'delivered';
    } = {};

    if (args.limit !== undefined) request.limit = args.limit as number;
    if (args.offset !== undefined) request.offset = args.offset as number;
    if (args.type !== undefined) request.type = args.type as 'archive' | 'tasking';
    if (args.status !== undefined) {
      request.status = args.status as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'delivered';
    }

    const response = await client.listOrders(request);

    const formattedResponse = {
      success: true,
      orders: response.orders.map((order) => ({
        id: order.orderId || order.id,
        status: order.status,
        type: order.type,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
      })),
      total: response.total,
      hasMore: response.hasMore,
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

// ==================== Helper Functions ====================

/**
 * Get human-readable description of order status
 */
function getStatusDescription(status: string): string {
  switch (status) {
    case 'pending':
      return 'Order is queued and waiting to be processed';
    case 'processing':
      return 'Order is being processed by the satellite provider';
    case 'completed':
      return 'Order is complete and imagery is available for download';
    case 'delivered':
      return 'Imagery has been delivered to your storage';
    case 'failed':
      return 'Order failed - check errorMessage for details';
    case 'cancelled':
      return 'Order was cancelled';
    default:
      return 'Unknown status';
  }
}

/**
 * Format detailed troubleshooting info for order placement errors
 */
function formatOrderErrorDetails(error: SkyFiApiException): {
  possibleCauses: string[];
  suggestions: string[];
} {
  const possibleCauses: string[] = [];
  const suggestions: string[] = [];

  switch (error.statusCode) {
    case 400:
      possibleCauses.push('Invalid request parameters');
      possibleCauses.push('Malformed WKT or date format');
      suggestions.push('Verify all required fields are provided');
      suggestions.push('Check WKT POLYGON and date formats');
      break;
    case 401:
      possibleCauses.push('Invalid API key');
      possibleCauses.push('Expired API key');
      suggestions.push('Verify your API key is correct');
      suggestions.push('Generate a new API key if needed');
      break;
    case 402:
      possibleCauses.push('Payment required');
      possibleCauses.push('Insufficient account balance');
      suggestions.push('Check your billing status');
      suggestions.push('Add funds to your account');
      break;
    case 403:
      possibleCauses.push('Insufficient permissions');
      possibleCauses.push('Account not authorized for ordering');
      suggestions.push('Check your account permissions');
      suggestions.push('Contact support to enable ordering');
      break;
    case 404:
      possibleCauses.push('Archive ID not found');
      possibleCauses.push('Resource no longer available');
      suggestions.push('Verify the archive ID is correct');
      suggestions.push('Search archive for current availability');
      break;
    case 422:
      possibleCauses.push('Order validation failed');
      possibleCauses.push('Infeasible request');
      suggestions.push('Use check_order_feasibility before ordering');
      suggestions.push('Adjust request parameters');
      break;
    case 429:
      possibleCauses.push('Rate limit exceeded');
      suggestions.push('Wait before placing more orders');
      suggestions.push('Consider upgrading your plan');
      break;
    default:
      possibleCauses.push('Server error');
      suggestions.push('Try again later');
      suggestions.push('Contact support if issue persists');
  }

  return { possibleCauses, suggestions };
}

// ==================== Tool Registration ====================

export function registerOrderTools(): void {
  toolRegistry.register(placeArchiveOrderDefinition, placeArchiveOrderHandler);
  toolRegistry.register(placeTaskingOrderDefinition, placeTaskingOrderHandler);
  toolRegistry.register(getOrderStatusDefinition, getOrderStatusHandler);
  toolRegistry.register(listOrdersDefinition, listOrdersHandler);
}

// Export handlers for testing
export {
  placeArchiveOrderHandler,
  placeTaskingOrderHandler,
  getOrderStatusHandler,
  listOrdersHandler,
  formatOrderErrorDetails,
  getStatusDescription,
};
