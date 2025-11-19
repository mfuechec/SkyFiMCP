/**
 * Search Archive Tool
 * MCP tool for searching SkyFi satellite imagery archive
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import {
  SkyFiClient,
  createSkyFiClient,
  SkyFiApiException,
} from '../services/skyfi/client.js';
import type {
  SearchArchiveRequest,
  GeoJSON,
  GeoJSONPoint,
} from '../services/skyfi/types.js';
import { geoJSONToWKT } from '../services/skyfi/types.js';

// Tool definition with comprehensive parameter schema
const searchArchiveToolDefinition = {
  name: 'search_archive',
  description: `Search the SkyFi satellite imagery archive for existing imagery.

IMPORTANT: Location must be in one of these formats:
- Coordinates: "37.7749,-122.4194" (latitude,longitude as decimal degrees)
- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}' (note: longitude first in coordinates)
- WKT POLYGON: "POLYGON((-122.42 37.77, -122.41 37.77, -122.41 37.78, -122.42 37.78, -122.42 37.77))"

Do NOT use place names like "San Francisco" - you must provide numeric coordinates.

Date format: YYYY-MM-DD (e.g., "2024-01-15")

Returns archive imagery with archiveId that can be used for ordering.`,
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'REQUIRED. Coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON string, or WKT POLYGON. Do NOT use place names.',
      },
      startDate: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format (e.g., "2024-01-01")',
      },
      endDate: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format (e.g., "2024-12-31")',
      },
      providers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by providers (e.g., ["MAXAR", "PLANET", "AIRBUS"])',
      },
      productTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by product types',
      },
      cloudCoverMax: {
        type: 'number',
        description: 'Maximum cloud coverage percentage, 0-100 (e.g., 20 for max 20% clouds)',
      },
      offNadirMax: {
        type: 'number',
        description: 'Maximum off-nadir angle in degrees, 0-90 (e.g., 30)',
      },
      openDataOnly: {
        type: 'boolean',
        description: 'If true, only return free/open data imagery',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (1-100, default 10)',
      },
    },
    required: ['location'],
  },
};

// Get or create SkyFi client
let skyfiClient: SkyFiClient | null = null;

function getSkyFiClient(): SkyFiClient {
  if (!skyfiClient) {
    const apiKey = process.env.SKYFI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'SKYFI_API_KEY environment variable is not set. Please configure your SkyFi API key.'
      );
    }
    skyfiClient = createSkyFiClient({ apiKey });
  }
  return skyfiClient;
}

// Reset client for testing purposes
function resetSkyFiClient(): void {
  skyfiClient = null;
}

// Parse location string to WKT format
function parseLocationToWKT(location: string): string {
  // Check if it's already WKT format
  if (location.toUpperCase().startsWith('POLYGON')) {
    return location;
  }

  // Check if it's a coordinate string (lat,lng)
  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);

    // Validate coordinates
    if (lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90.`);
    }
    if (lng < -180 || lng > 180) {
      throw new Error(
        `Invalid longitude: ${lng}. Must be between -180 and 180.`
      );
    }

    // Convert to WKT POLYGON (small bounding box around point)
    const geojson: GeoJSONPoint = {
      type: 'Point',
      coordinates: [lng, lat],
    };
    return geoJSONToWKT(geojson);
  }

  // Check if it's a GeoJSON string
  if (location.startsWith('{')) {
    try {
      const geojson = JSON.parse(location);
      if (geojson.type === 'Point' || geojson.type === 'Polygon') {
        return geoJSONToWKT(geojson as GeoJSON);
      }
      throw new Error(
        `Invalid GeoJSON type: ${geojson.type}. Must be Point or Polygon.`
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid GeoJSON format: ${error.message}`);
      }
      throw error;
    }
  }

  // Cannot geocode place names - require explicit coordinates
  throw new Error(
    `Invalid location format: "${location}". ` +
    `Location must be numeric coordinates in one of these formats:\n` +
    `- Coordinates: "37.7749,-122.4194" (latitude,longitude)\n` +
    `- GeoJSON: '{"type":"Point","coordinates":[-122.4194,37.7749]}'\n` +
    `- WKT: "POLYGON((-122.42 37.77, -122.41 37.77, ...))"\n\n` +
    `Place names like "San Francisco" are not supported. Please use numeric coordinates.`
  );
}

// Validate date format
function validateDate(dateStr: string, fieldName: string): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error(
      `Invalid ${fieldName} format: "${dateStr}". Expected ISO 8601 date format (YYYY-MM-DD).`
    );
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}: "${dateStr}" is not a valid date.`);
  }
}

// Tool handler
async function searchArchiveHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  try {
    // Validate required parameter
    const locationArg = args.location as string | undefined;
    if (!locationArg || locationArg.trim() === '') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Location parameter is required. Please provide coordinates (lat,lng), GeoJSON, or WKT POLYGON.',
          },
        ],
        isError: true,
      };
    }

    // Parse location to WKT
    let aoi: string;
    try {
      aoi = parseLocationToWKT(locationArg.trim());
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }

    // Build search request
    const searchRequest: SearchArchiveRequest = {
      aoi,
    };

    // Add optional date range
    const startDate = args.startDate as string | undefined;
    const endDate = args.endDate as string | undefined;

    if (startDate) {
      try {
        validateDate(startDate, 'startDate');
        searchRequest.fromDate = startDate;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (endDate) {
      try {
        validateDate(endDate, 'endDate');
        searchRequest.toDate = endDate;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Validate date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Start date (${startDate}) must be before or equal to end date (${endDate}).`,
            },
          ],
          isError: true,
        };
      }
    }

    // Add optional cloud cover
    const cloudCoverMax = args.cloudCoverMax as number | undefined;
    if (cloudCoverMax !== undefined) {
      if (cloudCoverMax < 0 || cloudCoverMax > 100) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid cloudCoverMax "${cloudCoverMax}". Must be between 0 and 100.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.maxCloudCoveragePercent = cloudCoverMax;
    }

    // Add optional off-nadir
    const offNadirMax = args.offNadirMax as number | undefined;
    if (offNadirMax !== undefined) {
      if (offNadirMax < 0 || offNadirMax > 90) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid offNadirMax "${offNadirMax}". Must be between 0 and 90.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.maxOffNadirAngle = offNadirMax;
    }

    // Add optional providers
    const providers = args.providers as string[] | undefined;
    if (providers && providers.length > 0) {
      searchRequest.providers = providers;
    }

    // Add optional product types
    const productTypes = args.productTypes as string[] | undefined;
    if (productTypes && productTypes.length > 0) {
      searchRequest.productTypes = productTypes;
    }

    // Add optional openData flag
    const openDataOnly = args.openDataOnly as boolean | undefined;
    if (openDataOnly !== undefined) {
      searchRequest.openData = openDataOnly;
    }

    // Add optional limit (pageSize)
    const limit = args.limit as number | undefined;
    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid limit "${limit}". Must be an integer between 1 and 100.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.pageSize = limit;
    } else {
      searchRequest.pageSize = 10; // Default limit
    }

    // Get SkyFi client and execute search
    const client = getSkyFiClient();
    const response = await client.searchArchive(searchRequest);

    // Format results
    if (response.archives.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No imagery found for the specified search criteria.\n\nSearch parameters:\n- Location: ${locationArg}${startDate ? `\n- Start date: ${startDate}` : ''}${endDate ? `\n- End date: ${endDate}` : ''}${cloudCoverMax ? `\n- Max cloud cover: ${cloudCoverMax}%` : ''}${openDataOnly ? `\n- Open data only: yes` : ''}\n\nTry adjusting your search parameters or expanding the date range.`,
          },
        ],
      };
    }

    // Format successful results
    const resultText = response.archives
      .map((img, index) => {
        const lines = [
          `${index + 1}. Archive ID: ${img.archiveId}`,
          `   Provider: ${img.provider}`,
          `   Product Type: ${img.productType}`,
          `   Capture Date: ${img.captureTimestamp}`,
          `   Resolution: ${img.resolution}`,
        ];

        if (img.cloudCoveragePercent !== undefined) {
          lines.push(`   Cloud Coverage: ${img.cloudCoveragePercent}%`);
        }

        if (img.offNadirAngle !== undefined) {
          lines.push(`   Off-Nadir: ${img.offNadirAngle}°`);
        }

        if (img.priceForOneSquareKm !== undefined) {
          lines.push(`   Price: $${img.priceForOneSquareKm}/km²`);
        }

        if (img.deliveryTimeHours !== undefined) {
          lines.push(`   Delivery: ${img.deliveryTimeHours}h`);
        }

        if (img.thumbnailUrls?.small) {
          lines.push(`   Thumbnail: ${img.thumbnailUrls.small}`);
        }

        return lines.join('\n');
      })
      .join('\n\n');

    const summary = `Found ${response.total} image(s)${response.nextPage ? ' (more available)' : ''}.`;

    return {
      content: [
        {
          type: 'text',
          text: `${summary}\n\n${resultText}`,
        },
      ],
    };
  } catch (error) {
    // Handle SkyFi API errors
    if (error instanceof SkyFiApiException) {
      let errorMessage = `SkyFi API Error: ${error.message}`;

      // Provide helpful messages for common errors
      switch (error.code) {
        case 'INVALID_LOCATION':
          errorMessage +=
            '\n\nTip: Make sure the location is valid coordinates (lat,lng), GeoJSON, or WKT POLYGON.';
          break;
        case 'AUTH_INVALID':
          errorMessage +=
            '\n\nTip: Check that your SKYFI_API_KEY is valid and not expired.';
          break;
        case 'RATE_LIMITED':
          errorMessage += '\n\nTip: Please wait a moment before trying again.';
          break;
        case 'NETWORK_ERROR':
          errorMessage +=
            '\n\nTip: Check your network connection and try again.';
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }

    // Handle other errors
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while searching the archive.';

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

// Register the tool
export function registerSearchArchiveTool(): void {
  toolRegistry.register(searchArchiveToolDefinition, searchArchiveHandler);
}

// Export for testing
export {
  searchArchiveHandler,
  searchArchiveToolDefinition,
  parseLocationToWKT,
  validateDate,
  getSkyFiClient,
  resetSkyFiClient,
};
