/**
 * Order Placement Tool
 * MCP tool for placing orders with user confirmation workflow
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import { createSkyFiClient, SkyFiApiException } from '../services/skyfi/client.js';
import type {
  PlaceOrderRequest,
  Order,
  TaskingRequest,
  GeoJSON,
  ImageType,
} from '../services/skyfi/types.js';

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

// ==================== Place Order Tool ====================

const placeOrderDefinition = {
  name: 'place_order',
  description:
    'Place an order for satellite imagery. Requires a user confirmation token to ensure secure transactions. Use get_pricing_estimate first to get pricing and generate a confirmation token.',
  inputSchema: {
    type: 'object',
    properties: {
      userConfirmationToken: {
        type: 'string',
        description:
          'User confirmation token to authorize the transaction. This token confirms user acknowledgment of pricing and terms.',
      },
      imageId: {
        type: 'string',
        description: 'ID of existing archive imagery to order',
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
      deliveryOptions: {
        type: 'object',
        description: 'Options for how the imagery should be delivered',
        properties: {
          cloudStorage: {
            type: 'string',
            description:
              'Cloud storage destination (e.g., "s3://bucket/path" or "gs://bucket/path")',
          },
          format: {
            type: 'string',
            description: 'Output format (e.g., "geotiff", "jp2", "png")',
          },
        },
      },
    },
    required: ['userConfirmationToken'],
    oneOf: [{ required: ['imageId'] }, { required: ['taskingRequest'] }],
  },
};

async function placeOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const userConfirmationToken = args.userConfirmationToken as string | undefined;
  const imageId = args.imageId as string | undefined;
  const taskingRequestInput = args.taskingRequest as Record<string, unknown> | undefined;
  const deliveryOptionsInput = args.deliveryOptions as Record<string, unknown> | undefined;

  // Validate confirmation token is provided
  if (!userConfirmationToken || userConfirmationToken.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'MISSING_CONFIRMATION_TOKEN',
            message: 'User confirmation token is required to place an order',
            details: {
              hint: 'First use get_pricing_estimate to get pricing information, then confirm the order with the user before proceeding',
              workflow: [
                '1. Call get_pricing_estimate to get pricing',
                '2. Present pricing to user for confirmation',
                '3. Generate or obtain confirmation token',
                '4. Call place_order with the confirmation token',
              ],
            },
          }),
        },
      ],
      isError: true,
    };
  }

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

    // Build the order request
    const orderRequest: PlaceOrderRequest = {
      userConfirmationToken: userConfirmationToken,
    };

    if (imageId) {
      orderRequest.imageId = imageId;
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

      orderRequest.taskingRequest = taskingRequest;
    }

    // Add delivery options if provided
    if (deliveryOptionsInput) {
      orderRequest.deliveryOptions = {};
      if (deliveryOptionsInput.cloudStorage) {
        orderRequest.deliveryOptions.cloudStorage = deliveryOptionsInput.cloudStorage as string;
      }
      if (deliveryOptionsInput.format) {
        orderRequest.deliveryOptions.format = deliveryOptionsInput.format as string;
      }
    }

    const order: Order = await client.placeOrder(orderRequest);

    // Format the successful response
    const formattedResponse = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        estimatedDelivery: order.estimatedDelivery,
        message: `Order ${order.id} has been placed successfully`,
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
      // Provide detailed error messaging based on error type
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

// ==================== Get Order Status Tool ====================

const getOrderStatusDefinition = {
  name: 'get_order_status',
  description:
    'Check the status of an existing order. Returns order details including current status, progress, and download URLs when available.',
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
            details: {
              hint: 'Provide the order ID returned from a previous place_order call',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const order: Order = await client.getOrderStatus(orderId);

    // Format the response based on order status
    const formattedResponse = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        price: order.price,
        currency: order.currency,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        estimatedDelivery: order.estimatedDelivery,
        progress: order.progress,
        downloadUrls: order.downloadUrls,
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

// ==================== Cancel Order Tool ====================

const cancelOrderDefinition = {
  name: 'cancel_order',
  description:
    'Cancel a pending or processing order. Cannot cancel orders that are already completed or failed.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'ID of the order to cancel',
      },
    },
    required: ['orderId'],
  },
};

async function cancelOrderHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
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
            details: {
              hint: 'Provide the order ID of the order you want to cancel',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const order: Order = await client.cancelOrder(orderId);

    const formattedResponse = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        message: `Order ${order.id} has been cancelled`,
        updatedAt: order.updatedAt,
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
      const errorDetails = formatCancelErrorDetails(error);

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
      status: {
        type: 'string',
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        description: 'Filter orders by status',
      },
      dateRange: {
        type: 'object',
        description: 'Filter orders by date range',
        properties: {
          start: {
            type: 'string',
            description: 'Start date in ISO 8601 format',
          },
          end: {
            type: 'string',
            description: 'End date in ISO 8601 format',
          },
        },
      },
    },
  },
};

async function listOrdersHandler(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;
  const limit = args.limit as number | undefined;
  const offset = args.offset as number | undefined;
  const status = args.status as string | undefined;
  const dateRange = args.dateRange as { start: string; end: string } | undefined;

  try {
    const client = createSkyFiClient({ apiKey });

    const request: {
      limit?: number;
      offset?: number;
      status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
      dateRange?: { start: string; end: string };
    } = {};

    if (limit !== undefined) request.limit = limit;
    if (offset !== undefined) request.offset = offset;
    if (status !== undefined)
      request.status = status as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    if (dateRange !== undefined) request.dateRange = dateRange;

    const response = await client.listOrders(request);

    const formattedResponse = {
      success: true,
      orders: response.orders.map((order) => ({
        id: order.id,
        status: order.status,
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

// ==================== Poll Order Status Tool ====================

const pollOrderStatusDefinition = {
  name: 'poll_order_status',
  description:
    'Poll an order status until it reaches a terminal state (completed, failed, or cancelled). Useful for waiting on order completion.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'ID of the order to poll',
      },
      maxAttempts: {
        type: 'number',
        description: 'Maximum number of polling attempts (default: 10)',
      },
      intervalSeconds: {
        type: 'number',
        description: 'Seconds between polling attempts (default: 30)',
      },
    },
    required: ['orderId'],
  },
};

async function pollOrderStatusHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const orderId = args.orderId as string;
  const maxAttempts = args.maxAttempts !== undefined ? (args.maxAttempts as number) : 10;
  const intervalSeconds = args.intervalSeconds !== undefined ? (args.intervalSeconds as number) : 30;

  if (!orderId || orderId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Order ID is required',
            details: {
              hint: 'Provide the order ID returned from a previous place_order call',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate polling parameters
  if (maxAttempts < 1 || maxAttempts > 100) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'maxAttempts must be between 1 and 100',
          }),
        },
      ],
      isError: true,
    };
  }

  if (intervalSeconds < 5 || intervalSeconds > 300) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'intervalSeconds must be between 5 and 300',
          }),
        },
      ],
      isError: true,
    };
  }

  const terminalStates = ['completed', 'failed', 'cancelled'];
  const client = createSkyFiClient({ apiKey });
  const statusHistory: Array<{ status: string; timestamp: string; progress?: number }> = [];

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const order: Order = await client.getOrderStatus(orderId);

      statusHistory.push({
        status: order.status,
        timestamp: new Date().toISOString(),
        progress: order.progress,
      });

      // Check if we've reached a terminal state
      if (terminalStates.includes(order.status)) {
        const formattedResponse = {
          success: true,
          completed: true,
          order: {
            id: order.id,
            status: order.status,
            price: order.price,
            currency: order.currency,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            estimatedDelivery: order.estimatedDelivery,
            progress: order.progress,
            downloadUrls: order.downloadUrls,
            errorMessage: order.errorMessage,
            statusDescription: getStatusDescription(order.status),
          },
          polling: {
            attempts: attempt,
            maxAttempts,
            intervalSeconds,
            statusHistory,
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
      }

      // If not the last attempt, wait before next poll
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
      }
    }

    // Max attempts reached without terminal state
    const lastOrder = await client.getOrderStatus(orderId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            completed: false,
            message: `Order did not reach terminal state after ${maxAttempts} attempts`,
            order: {
              id: lastOrder.id,
              status: lastOrder.status,
              progress: lastOrder.progress,
              statusDescription: getStatusDescription(lastOrder.status),
            },
            polling: {
              attempts: maxAttempts,
              maxAttempts,
              intervalSeconds,
              statusHistory,
            },
            suggestion: 'Increase maxAttempts or intervalSeconds to continue polling',
          }),
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
              polling: {
                attempts: statusHistory.length,
                maxAttempts,
                intervalSeconds,
                statusHistory,
              },
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
            polling: {
              attempts: statusHistory.length,
              statusHistory,
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

  // Check for specific error codes
  const errorCode = error.code?.toLowerCase() || '';
  const errorMessage = error.message?.toLowerCase() || '';

  // Handle insufficient funds error
  if (
    errorCode.includes('insufficient') ||
    errorCode.includes('funds') ||
    errorCode.includes('balance') ||
    errorMessage.includes('insufficient') ||
    errorMessage.includes('funds') ||
    errorMessage.includes('balance')
  ) {
    possibleCauses.push('Account balance is too low for this order');
    possibleCauses.push('Credit limit exceeded');
    suggestions.push('Add funds to your account');
    suggestions.push('Contact billing support to increase credit limit');
    suggestions.push('Consider a lower resolution or smaller area to reduce cost');
    return { possibleCauses, suggestions };
  }

  // Handle token mismatch/invalid errors
  if (
    errorCode.includes('token') ||
    errorCode.includes('confirmation') ||
    errorCode.includes('invalid_token') ||
    errorMessage.includes('token') ||
    errorMessage.includes('confirmation') ||
    errorMessage.includes('mismatch')
  ) {
    possibleCauses.push('Confirmation token is invalid or expired');
    possibleCauses.push('Token was generated for a different order');
    possibleCauses.push('Token has already been used');
    suggestions.push('Get new pricing estimate and generate a fresh token');
    suggestions.push('Ensure the token matches the current order request');
    suggestions.push('Token may have expired - retry the workflow from pricing step');
    return { possibleCauses, suggestions };
  }

  // Handle based on HTTP status code
  switch (error.statusCode) {
    case 400:
      possibleCauses.push('Invalid request parameters');
      possibleCauses.push('Malformed order request');
      suggestions.push('Verify all required fields are provided');
      suggestions.push('Check image ID or tasking request format');
      break;
    case 401:
      possibleCauses.push('Invalid API key');
      possibleCauses.push('Expired API key');
      suggestions.push('Verify your API key is correct');
      suggestions.push('Generate a new API key if needed');
      break;
    case 402:
      possibleCauses.push('Payment required');
      possibleCauses.push('Account has unpaid invoices');
      suggestions.push('Check your billing status');
      suggestions.push('Add a valid payment method');
      break;
    case 403:
      possibleCauses.push('Insufficient permissions');
      possibleCauses.push('Account not authorized for ordering');
      suggestions.push('Check your account permissions');
      suggestions.push('Contact support to enable ordering');
      break;
    case 404:
      possibleCauses.push('Image ID not found');
      possibleCauses.push('Resource no longer available');
      suggestions.push('Verify the image ID is correct');
      suggestions.push('Search archive for current availability');
      break;
    case 409:
      possibleCauses.push('Duplicate order');
      possibleCauses.push('Order already exists');
      suggestions.push('Check existing orders with list_orders');
      suggestions.push('Wait for existing order to complete');
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

/**
 * Format detailed troubleshooting info for cancel errors
 */
function formatCancelErrorDetails(error: SkyFiApiException): {
  possibleCauses: string[];
  suggestions: string[];
} {
  const possibleCauses: string[] = [];
  const suggestions: string[] = [];

  if (error.statusCode === 404) {
    possibleCauses.push('Order not found');
    suggestions.push('Verify the order ID is correct');
    suggestions.push('The order may have already been deleted');
  } else if (error.statusCode === 409) {
    possibleCauses.push('Order cannot be cancelled in current state');
    possibleCauses.push('Order may already be completed or cancelled');
    suggestions.push('Check order status with get_order_status');
    suggestions.push('Completed orders cannot be cancelled');
  } else {
    possibleCauses.push('Unable to cancel order');
    suggestions.push('Check order status');
    suggestions.push('Contact support for assistance');
  }

  return { possibleCauses, suggestions };
}

// ==================== Tool Registration ====================

export function registerOrderTools(): void {
  toolRegistry.register(placeOrderDefinition, placeOrderHandler);
  toolRegistry.register(getOrderStatusDefinition, getOrderStatusHandler);
  toolRegistry.register(cancelOrderDefinition, cancelOrderHandler);
  toolRegistry.register(listOrdersDefinition, listOrdersHandler);
  toolRegistry.register(pollOrderStatusDefinition, pollOrderStatusHandler);
}

// Export handlers for testing
export {
  placeOrderHandler,
  getOrderStatusHandler,
  cancelOrderHandler,
  listOrdersHandler,
  pollOrderStatusHandler,
  formatOrderErrorDetails,
  formatCancelErrorDetails,
  getStatusDescription,
};
