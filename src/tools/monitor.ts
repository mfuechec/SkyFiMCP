/**
 * AOI Monitoring Tools
 * MCP tools for setting up and managing area of interest monitoring
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import { createSkyFiClient, SkyFiApiException } from '../services/skyfi/client.js';
import type {
  CreateMonitorRequest,
  Monitor,
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

// ==================== Create Monitor Tool ====================

const createMonitorDefinition = {
  name: 'create_monitor',
  description:
    'Create a new monitor for an area of interest (AOI). Monitors track changes in satellite imagery availability and send notifications via webhook.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'object',
        description: 'GeoJSON Point or Polygon for the area to monitor',
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
      webhookUrl: {
        type: 'string',
        description: 'URL to receive webhook notifications when new imagery is available',
      },
      resolution: {
        type: 'string',
        description: 'Minimum resolution to monitor for (e.g., "0.5m", "1m", "3m")',
      },
      imageType: {
        type: 'string',
        enum: ['optical', 'sar', 'multispectral', 'hyperspectral'],
        description: 'Type of imagery to monitor for (default: optical)',
      },
      frequency: {
        type: 'string',
        description: 'How often to check for new imagery (e.g., "daily", "weekly")',
      },
      notifyOnNewImagery: {
        type: 'boolean',
        description: 'Send notification when new imagery is available (default: true)',
      },
      notifyOnPriceChange: {
        type: 'boolean',
        description: 'Send notification when pricing changes (default: false)',
      },
    },
    required: ['location', 'webhookUrl'],
  },
};

async function createMonitorHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const locationInput = args.location as Record<string, unknown>;
  const webhookUrl = args.webhookUrl as string;
  const resolution = args.resolution as string | undefined;
  const imageType = args.imageType as ImageType | undefined;
  const frequency = args.frequency as string | undefined;
  const notifyOnNewImagery = args.notifyOnNewImagery as boolean | undefined;
  const notifyOnPriceChange = args.notifyOnPriceChange as boolean | undefined;

  // Validate webhook URL
  if (!webhookUrl || webhookUrl.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Webhook URL is required',
            details: {
              hint: 'Provide a valid URL to receive notifications',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  // Basic URL validation
  try {
    new URL(webhookUrl);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Invalid webhook URL format',
            details: {
              hint: 'Provide a valid HTTP or HTTPS URL',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate location
  if (!locationInput || !locationInput.type || !locationInput.coordinates) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Location is required with type and coordinates',
            details: {
              hint: 'Provide a GeoJSON Point or Polygon',
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });

    // Build the monitor request
    const request: CreateMonitorRequest = {
      location: {
        type: locationInput.type as 'Point' | 'Polygon',
        coordinates: locationInput.coordinates,
      } as GeoJSON,
      criteria: {},
      webhookUrl,
    };

    // Add criteria if provided
    if (resolution) {
      request.criteria.resolution = resolution;
    }
    if (imageType) {
      request.criteria.imageType = imageType;
    }
    if (frequency) {
      request.criteria.frequency = frequency;
    }

    // Add notification preferences
    if (notifyOnNewImagery !== undefined || notifyOnPriceChange !== undefined) {
      request.notificationPreferences = {
        onNewImagery: notifyOnNewImagery ?? true,
        onPriceChange: notifyOnPriceChange ?? false,
      };
    }

    const monitor: Monitor = await client.createMonitor(request);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.id,
        status: monitor.status,
        location: monitor.location,
        criteria: monitor.criteria,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        message: `Monitor ${monitor.id} created successfully`,
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

// ==================== List Monitors Tool ====================

const listMonitorsDefinition = {
  name: 'list_monitors',
  description: 'List all active monitors for the authenticated user.',
  inputSchema: {
    type: 'object',
    properties: {
    },
    required: [],
  },
};

async function listMonitorsHandler(
  _args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  try {
    const client = createSkyFiClient({ apiKey });
    const response = await client.listMonitors();

    const formattedResponse = {
      success: true,
      monitors: response.monitors.map((monitor) => ({
        id: monitor.id,
        status: monitor.status,
        location: monitor.location,
        criteria: monitor.criteria,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        lastTriggered: monitor.lastTriggered,
      })),
      total: response.total,
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

// ==================== Get Monitor Tool ====================

const getMonitorDefinition = {
  name: 'get_monitor',
  description: 'Get details of a specific monitor by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      monitorId: {
        type: 'string',
        description: 'ID of the monitor to retrieve',
      },
    },
    required: ['monitorId'],
  },
};

async function getMonitorHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const monitorId = args.monitorId as string;

  if (!monitorId || monitorId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Monitor ID is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const monitor: Monitor = await client.getMonitor(monitorId);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.id,
        status: monitor.status,
        location: monitor.location,
        criteria: monitor.criteria,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        lastTriggered: monitor.lastTriggered,
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

// ==================== Delete Monitor Tool ====================

const deleteMonitorDefinition = {
  name: 'delete_monitor',
  description: 'Delete a monitor permanently.',
  inputSchema: {
    type: 'object',
    properties: {
      monitorId: {
        type: 'string',
        description: 'ID of the monitor to delete',
      },
    },
    required: ['monitorId'],
  },
};

async function deleteMonitorHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const monitorId = args.monitorId as string;

  if (!monitorId || monitorId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Monitor ID is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    await client.deleteMonitor(monitorId);

    const formattedResponse = {
      success: true,
      message: `Monitor ${monitorId} has been deleted`,
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

// ==================== Pause Monitor Tool ====================

const pauseMonitorDefinition = {
  name: 'pause_monitor',
  description: 'Pause an active monitor. The monitor will stop sending notifications until resumed.',
  inputSchema: {
    type: 'object',
    properties: {
      monitorId: {
        type: 'string',
        description: 'ID of the monitor to pause',
      },
    },
    required: ['monitorId'],
  },
};

async function pauseMonitorHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const monitorId = args.monitorId as string;

  if (!monitorId || monitorId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Monitor ID is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const monitor: Monitor = await client.pauseMonitor(monitorId);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.id,
        status: monitor.status,
        message: `Monitor ${monitor.id} has been paused`,
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

// ==================== Resume Monitor Tool ====================

const resumeMonitorDefinition = {
  name: 'resume_monitor',
  description: 'Resume a paused monitor. The monitor will start sending notifications again.',
  inputSchema: {
    type: 'object',
    properties: {
      monitorId: {
        type: 'string',
        description: 'ID of the monitor to resume',
      },
    },
    required: ['monitorId'],
  },
};

async function resumeMonitorHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const result = getApiKeyOrError();
  if ('error' in result) return result.error;
  const { apiKey } = result;

  const monitorId = args.monitorId as string;

  if (!monitorId || monitorId.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Monitor ID is required',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const client = createSkyFiClient({ apiKey });
    const monitor: Monitor = await client.resumeMonitor(monitorId);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.id,
        status: monitor.status,
        message: `Monitor ${monitor.id} has been resumed`,
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

// ==================== Tool Registration ====================

export function registerMonitorTools(): void {
  toolRegistry.register(createMonitorDefinition, createMonitorHandler);
  toolRegistry.register(listMonitorsDefinition, listMonitorsHandler);
  toolRegistry.register(getMonitorDefinition, getMonitorHandler);
  toolRegistry.register(deleteMonitorDefinition, deleteMonitorHandler);
  toolRegistry.register(pauseMonitorDefinition, pauseMonitorHandler);
  toolRegistry.register(resumeMonitorDefinition, resumeMonitorHandler);
}

// Export handlers for testing
export {
  createMonitorHandler,
  listMonitorsHandler,
  getMonitorHandler,
  deleteMonitorHandler,
  pauseMonitorHandler,
  resumeMonitorHandler,
};
