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
  ListOrdersRequest,
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

  throw new Error(
    `Invalid location format: "${location}". ` +
    `Location must be numeric coordinates:\n` +
    `- Coordinates: "37.7749,-122.4194" (latitude,longitude)\n` +
    `- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'\n` +
    `- WKT POLYGON\n\n` +
    `Place names like "San Francisco" are not supported.`
  );
}

// ==================== Place Archive Order Tool ====================

const placeArchiveOrderDefinition = {
  name: 'place_archive_order',
  description: `Place an order for existing archive satellite imagery.

WORKFLOW: First use search_archive to find available imagery, then use the archiveId from the results.

Location format (REQUIRED):
- Coordinates: "37.7749,-122.4194" (latitude,longitude)
- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'
- WKT POLYGON: "POLYGON((-122.42 37.77, -122.41 37.77, -122.41 37.78, -122.42 37.78, -122.42 37.77))"

Do NOT use place names - you must provide numeric coordinates.

Delivery drivers: S3 (AWS), GS (Google Cloud), AZURE (Azure Blob)`,
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'REQUIRED. Archive ID from search_archive results (e.g., "abc123-def456")',
      },
      location: {
        type: 'string',
        description: 'REQUIRED. Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON',
      },
      deliveryDriver: {
        type: 'string',
        enum: ['S3', 'GS', 'AZURE'],
        description: 'REQUIRED. Cloud storage: S3 (AWS), GS (Google Cloud), or AZURE',
      },
      deliveryBucket: {
        type: 'string',
        description: 'REQUIRED. Your bucket name (e.g., "my-imagery-bucket")',
      },
      deliveryPath: {
        type: 'string',
        description: 'Path within bucket (e.g., "imagery/2024/")',
      },
      webhookUrl: {
        type: 'string',
        description: 'URL for status notifications (e.g., "https://myapi.com/webhooks/skyfi")',
      },
    },
    required: ['archiveId', 'location', 'deliveryDriver', 'deliveryBucket'],
  },
};

async function placeArchiveOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const archiveId = args.archiveId as string | undefined;
  const locationInput = args.location as string | undefined;
  const deliveryDriver = args.deliveryDriver as 'S3' | 'GS' | 'AZURE' | undefined;
  const deliveryBucket = args.deliveryBucket as string | undefined;

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

  if (!deliveryDriver) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Delivery driver is required (S3, GS, or AZURE)',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!deliveryBucket || deliveryBucket.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Delivery bucket is required',
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

    const orderRequest: PlaceArchiveOrderRequest = {
      aoi,
      archiveId,
      deliveryDriver,
      deliveryParams: {
        bucket: deliveryBucket,
      },
    };

    // Add optional delivery path
    const deliveryPath = args.deliveryPath as string | undefined;
    if (deliveryPath) {
      orderRequest.deliveryParams.path = deliveryPath;
    }

    // Add optional webhook URL
    const webhookUrl = args.webhookUrl as string | undefined;
    if (webhookUrl) {
      orderRequest.webhook_url = webhookUrl;
    }

    const order: Order = await client.placeArchiveOrder(orderRequest);

    const formattedResponse = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        type: 'archive',
        archiveId: order.archiveId,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
        message: `Archive order ${order.id} has been placed successfully`,
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
  description: `Place a tasking order for NEW satellite imagery capture (not archive imagery).

WORKFLOW: Use check_order_feasibility first to verify the satellite can capture imagery for your location and dates.

Location format (REQUIRED):
- Coordinates: "37.7749,-122.4194" (latitude,longitude)
- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'
- WKT POLYGON: "POLYGON((-122.42 37.77, -122.41 37.77, -122.41 37.78, -122.42 37.78, -122.42 37.77))"

Do NOT use place names - you must provide numeric coordinates.

Date format: ISO 8601 with timezone (e.g., "2025-01-15T00:00:00+00:00")

Resolution must be one of: LOW, MEDIUM, HIGH, VERY HIGH, SUPER HIGH, ULTRA HIGH, CM 30, CM 50

Product types: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, STEREO

Delivery drivers: S3 (AWS), GS (Google Cloud), AZURE (Azure Blob)`,
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'REQUIRED. Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON',
      },
      windowStart: {
        type: 'string',
        description: 'REQUIRED. Capture window start in ISO 8601 format with timezone (e.g., "2025-01-15T00:00:00+00:00")',
      },
      windowEnd: {
        type: 'string',
        description: 'REQUIRED. Capture window end in ISO 8601 format with timezone (e.g., "2025-02-15T00:00:00+00:00")',
      },
      productType: {
        type: 'string',
        enum: ['DAY', 'NIGHT', 'VIDEO', 'SAR', 'HYPERSPECTRAL', 'MULTISPECTRAL', 'STEREO'],
        description: 'REQUIRED. Product type: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, or STEREO',
      },
      resolution: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH', 'SUPER HIGH', 'ULTRA HIGH', 'CM 30', 'CM 50'],
        description: 'REQUIRED. Resolution level: LOW, MEDIUM, HIGH, VERY HIGH, SUPER HIGH, ULTRA HIGH, CM 30, or CM 50',
      },
      deliveryDriver: {
        type: 'string',
        enum: ['S3', 'GS', 'AZURE'],
        description: 'REQUIRED. Cloud storage: S3 (AWS), GS (Google Cloud), or AZURE',
      },
      deliveryBucket: {
        type: 'string',
        description: 'REQUIRED. Your bucket name (e.g., "my-imagery-bucket")',
      },
      maxCloudCoveragePercent: {
        type: 'integer',
        description: 'Max cloud coverage 0-100 (e.g., 20 for max 20% clouds)',
      },
      maxOffNadirAngle: {
        type: 'integer',
        description: 'Max off-nadir angle 0-90 degrees (e.g., 30)',
      },
      deliveryPath: {
        type: 'string',
        description: 'Path within bucket (e.g., "imagery/2024/")',
      },
      webhookUrl: {
        type: 'string',
        description: 'URL for status notifications',
      },
      requiredProvider: {
        type: 'string',
        enum: ['PLANET', 'UMBRA'],
        description: 'Specific provider: PLANET or UMBRA',
      },
    },
    required: ['location', 'windowStart', 'windowEnd', 'productType', 'resolution', 'deliveryDriver', 'deliveryBucket'],
  },
};

async function placeTaskingOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const locationInput = args.location as string | undefined;
  const windowStart = args.windowStart as string | undefined;
  const windowEnd = args.windowEnd as string | undefined;
  const productType = args.productType as string | undefined;
  const resolution = args.resolution as string | undefined;
  const deliveryDriver = args.deliveryDriver as 'S3' | 'GS' | 'AZURE' | undefined;
  const deliveryBucket = args.deliveryBucket as string | undefined;

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

  if (!windowStart || !windowEnd) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Both windowStart and windowEnd are required',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!productType) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Product type is required',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!resolution) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Resolution is required',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!deliveryDriver) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Delivery driver is required (S3, GS, or AZURE)',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!deliveryBucket || deliveryBucket.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Delivery bucket is required',
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
      windowStart,
      windowEnd,
      productType,
      resolution,
      deliveryDriver,
      deliveryParams: {
        bucket: deliveryBucket,
      },
    };

    // Add optional delivery path
    const deliveryPath = args.deliveryPath as string | undefined;
    if (deliveryPath) {
      orderRequest.deliveryParams.path = deliveryPath;
    }

    // Add optional parameters
    if (args.maxCloudCoveragePercent !== undefined) {
      orderRequest.maxCloudCoveragePercent = args.maxCloudCoveragePercent as number;
    }
    if (args.maxOffNadirAngle !== undefined) {
      orderRequest.maxOffNadirAngle = args.maxOffNadirAngle as number;
    }
    if (args.priorityItem) {
      orderRequest.priorityItem = args.priorityItem as string;
    }
    if (args.webhookUrl) {
      orderRequest.webhookUrl = args.webhookUrl as string;
    }
    if (args.requiredProvider) {
      orderRequest.requiredProvider = args.requiredProvider as string;
    }

    const order: Order = await client.placeTaskingOrder(orderRequest);

    const formattedResponse = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        type: 'tasking',
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
        message: `Tasking order ${order.id} has been placed successfully`,
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
        id: order.id,
        status: order.status,
        type: order.orderType,
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
        enum: ['ARCHIVE', 'TASKING'],
        description: 'Filter orders by type (ARCHIVE or TASKING)',
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

    const request: ListOrdersRequest = {};

    if (args.type !== undefined) {
      request.type = args.type as 'ARCHIVE' | 'TASKING';
    }

    const response = await client.listOrders(request);

    const formattedResponse = {
      success: true,
      orders: response.orders.map((order) => ({
        id: order.id,
        status: order.status,
        type: order.orderType,
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
