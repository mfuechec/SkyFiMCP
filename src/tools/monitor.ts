/**
 * AOI Monitoring Tools
 * MCP tools for setting up and managing area of interest monitoring (notifications)
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import { createSkyFiClient, SkyFiApiException } from '../services/skyfi/client.js';
import type {
  CreateMonitorRequest,
  Monitor,
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

// ==================== Create Monitor Tool ====================

const createMonitorDefinition = {
  name: 'create_monitor',
  description:
    'Create a new monitor (notification) for an area of interest. Monitors track changes in satellite imagery availability and send notifications via webhook.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'Location as coordinates "lat,lng", GeoJSON string, or WKT POLYGON',
      },
      webhookUrl: {
        type: 'string',
        description: 'URL to receive webhook notifications when new imagery is available',
      },
      name: {
        type: 'string',
        description: 'Optional name for the monitor',
      },
      resolutionMax: {
        type: 'number',
        description: 'Maximum resolution in meters to filter for',
      },
      cloudCoverMax: {
        type: 'number',
        description: 'Maximum cloud coverage percentage (0-100)',
      },
      offNadirMax: {
        type: 'number',
        description: 'Maximum off-nadir angle in degrees',
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

  const locationInput = args.location as string | undefined;
  const webhookUrl = args.webhookUrl as string;

  // Validate location
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

  // Validate webhook URL
  if (!webhookUrl || webhookUrl.trim() === '') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'INVALID_REQUEST',
            message: 'Webhook URL is required',
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

    // Build the monitor request
    const request: CreateMonitorRequest = {
      aoi,
      webhookUrl,
    };

    // Add optional name
    if (args.name) {
      request.name = args.name as string;
    }

    // Add filters if provided
    const resolutionMax = args.resolutionMax as number | undefined;
    const cloudCoverMax = args.cloudCoverMax as number | undefined;
    const offNadirMax = args.offNadirMax as number | undefined;

    if (resolutionMax !== undefined || cloudCoverMax !== undefined || offNadirMax !== undefined) {
      request.filters = {};
      if (resolutionMax !== undefined) request.filters.resolutionMax = resolutionMax;
      if (cloudCoverMax !== undefined) request.filters.cloudCoverMax = cloudCoverMax;
      if (offNadirMax !== undefined) request.filters.offNadirMax = offNadirMax;
    }

    const monitor: Monitor = await client.createMonitor(request);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.notificationId || monitor.id,
        status: monitor.status,
        name: monitor.name,
        aoi: monitor.aoi,
        filters: monitor.filters,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        message: `Monitor ${monitor.notificationId || monitor.id} created successfully`,
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
  description: 'List all active monitors (notifications) for the authenticated user.',
  inputSchema: {
    type: 'object',
    properties: {},
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
        id: monitor.notificationId || monitor.id,
        status: monitor.status,
        name: monitor.name,
        aoi: monitor.aoi,
        filters: monitor.filters,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        lastTriggered: monitor.lastTriggered,
        triggerCount: monitor.triggerCount,
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
  description: 'Get details of a specific monitor (notification) by ID.',
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
        id: monitor.notificationId || monitor.id,
        status: monitor.status,
        name: monitor.name,
        aoi: monitor.aoi,
        filters: monitor.filters,
        webhookUrl: monitor.webhookUrl,
        createdAt: monitor.createdAt,
        lastTriggered: monitor.lastTriggered,
        triggerCount: monitor.triggerCount,
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
  description: 'Delete a monitor (notification) permanently.',
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

// ==================== Tool Registration ====================

export function registerMonitorTools(): void {
  toolRegistry.register(createMonitorDefinition, createMonitorHandler);
  toolRegistry.register(listMonitorsDefinition, listMonitorsHandler);
  toolRegistry.register(getMonitorDefinition, getMonitorHandler);
  toolRegistry.register(deleteMonitorDefinition, deleteMonitorHandler);
}

// Export handlers for testing
export {
  createMonitorHandler,
  listMonitorsHandler,
  getMonitorHandler,
  deleteMonitorHandler,
};
