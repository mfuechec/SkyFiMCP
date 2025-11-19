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

    throw new Error(
      `Invalid location format: "${location}". ` +
      `Location must be numeric coordinates:\n` +
      `- Coordinates: "37.7749,-122.4194" (latitude,longitude)\n` +
      `- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'\n` +
      `- WKT POLYGON\n\n` +
      `Place names like "San Francisco" are not supported.`
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

// ==================== Create Monitor Tool ====================

const createMonitorDefinition = {
  name: 'create_monitor',
  description: `Create a monitor to receive webhook notifications when new satellite imagery becomes available for an area.

Location format (REQUIRED):
- Coordinates: "37.7749,-122.4194" (latitude,longitude)
- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'
- WKT POLYGON: "POLYGON((-122.42 37.77, -122.41 37.77, -122.41 37.78, -122.42 37.78, -122.42 37.77))"

Do NOT use place names - you must provide numeric coordinates.

GSD (Ground Sample Distance) is resolution in meters. Lower GSD = higher resolution imagery.

Product types: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, STEREO`,
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'REQUIRED. Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON',
      },
      webhookUrl: {
        type: 'string',
        description: 'REQUIRED. URL to receive notifications (e.g., "https://myapi.com/webhooks/skyfi")',
      },
      gsdMin: {
        type: 'integer',
        description: 'Min resolution in meters (e.g., 1 for 1m)',
      },
      gsdMax: {
        type: 'integer',
        description: 'Max resolution in meters (e.g., 5 for 5m)',
      },
      productType: {
        type: 'string',
        enum: ['DAY', 'NIGHT', 'VIDEO', 'SAR', 'HYPERSPECTRAL', 'MULTISPECTRAL', 'STEREO'],
        description: 'Product type filter: DAY, NIGHT, VIDEO, SAR, HYPERSPECTRAL, MULTISPECTRAL, or STEREO',
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

    // Add optional filters
    const gsdMin = args.gsdMin as number | undefined;
    const gsdMax = args.gsdMax as number | undefined;
    const productType = args.productType as string | undefined;

    if (gsdMin !== undefined) {
      request.gsdMin = gsdMin;
    }
    if (gsdMax !== undefined) {
      request.gsdMax = gsdMax;
    }
    if (productType) {
      request.productType = productType;
    }

    const monitor: Monitor = await client.createMonitor(request);

    const formattedResponse = {
      success: true,
      monitor: {
        id: monitor.id,
        status: monitor.status,
        aoi: monitor.aoi,
        gsdMin: monitor.gsdMin,
        gsdMax: monitor.gsdMax,
        productType: monitor.productType,
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
      monitors: response.notifications.map((monitor) => ({
        id: monitor.id,
        status: monitor.status,
        aoi: monitor.aoi,
        gsdMin: monitor.gsdMin,
        gsdMax: monitor.gsdMax,
        productType: monitor.productType,
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
        id: monitor.id,
        status: monitor.status,
        aoi: monitor.aoi,
        gsdMin: monitor.gsdMin,
        gsdMax: monitor.gsdMax,
        productType: monitor.productType,
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
