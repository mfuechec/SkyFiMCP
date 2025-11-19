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
  description:
    'Search the SkyFi satellite imagery archive. Returns available imagery based on location, date range, resolution, and other filters.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description:
          'Location to search. Can be coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), GeoJSON object as a JSON string, or WKT POLYGON format.',
      },
      startDate: {
        type: 'string',
        description:
          'Start date for imagery search in ISO 8601 format (e.g., "2024-01-01"). Optional.',
      },
      endDate: {
        type: 'string',
        description:
          'End date for imagery search in ISO 8601 format (e.g., "2024-12-31"). Optional.',
      },
      resolutionMin: {
        type: 'number',
        description:
          'Minimum resolution in meters (e.g., 0.5 for 50cm resolution). Optional.',
      },
      resolutionMax: {
        type: 'number',
        description:
          'Maximum resolution in meters. Optional.',
      },
      cloudCoverMax: {
        type: 'number',
        description:
          'Maximum cloud coverage percentage (0-100). Optional.',
      },
      offNadirMax: {
        type: 'number',
        description:
          'Maximum off-nadir angle in degrees. Optional.',
      },
      openDataOnly: {
        type: 'boolean',
        description:
          'If true, only return free/open data imagery. Default is false. Optional.',
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of results to return. Default is 10, max is 100. Optional.',
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
    `Invalid location format: "${location}". Please provide coordinates (lat,lng), GeoJSON, or WKT POLYGON.`
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
        searchRequest.dateFrom = startDate;
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
        searchRequest.dateTo = endDate;
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

    // Add optional resolution range
    const resolutionMin = args.resolutionMin as number | undefined;
    const resolutionMax = args.resolutionMax as number | undefined;

    if (resolutionMin !== undefined) {
      if (resolutionMin <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid resolutionMin "${resolutionMin}". Must be a positive number.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.resolutionFrom = resolutionMin;
    }

    if (resolutionMax !== undefined) {
      if (resolutionMax <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid resolutionMax "${resolutionMax}". Must be a positive number.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.resolutionTo = resolutionMax;
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
      searchRequest.cloudCoverFrom = 0;
      searchRequest.cloudCoverTo = cloudCoverMax;
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
      searchRequest.offNadirFrom = 0;
      searchRequest.offNadirTo = offNadirMax;
    }

    // Add optional openDataOnly flag
    const openDataOnly = args.openDataOnly as boolean | undefined;
    if (openDataOnly !== undefined) {
      searchRequest.openDataOnly = openDataOnly;
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
    if (response.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No imagery found for the specified search criteria.\n\nSearch parameters:\n- Location: ${locationArg}${startDate ? `\n- Start date: ${startDate}` : ''}${endDate ? `\n- End date: ${endDate}` : ''}${resolutionMax ? `\n- Max resolution: ${resolutionMax}m` : ''}${cloudCoverMax ? `\n- Max cloud cover: ${cloudCoverMax}%` : ''}${openDataOnly ? `\n- Open data only: yes` : ''}\n\nTry adjusting your search parameters or expanding the date range.`,
          },
        ],
      };
    }

    // Format successful results
    const resultText = response.results
      .map((img, index) => {
        const lines = [
          `${index + 1}. Archive ID: ${img.archiveId || img.id}`,
          `   Provider: ${img.provider}`,
          `   Capture Date: ${img.captureDate}`,
          `   Resolution: ${img.resolution}m`,
        ];

        if (img.cloudCover !== undefined) {
          lines.push(`   Cloud Coverage: ${img.cloudCover}%`);
        }

        if (img.offNadir !== undefined) {
          lines.push(`   Off-Nadir: ${img.offNadir}°`);
        }

        if (img.sunElevation !== undefined) {
          lines.push(`   Sun Elevation: ${img.sunElevation}°`);
        }

        if (img.preview) {
          lines.push(`   Preview: ${img.preview}`);
        }

        if (img.thumbnail) {
          lines.push(`   Thumbnail: ${img.thumbnail}`);
        }

        return lines.join('\n');
      })
      .join('\n\n');

    const summary = `Found ${response.total} image(s)${response.hasMore ? ' (more available)' : ''}.`;

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
