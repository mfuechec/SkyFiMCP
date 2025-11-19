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
  ImageType,
  GeoJSON,
  GeoJSONPoint,
} from '../services/skyfi/types.js';

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
          'Location to search. Can be a place name (e.g., "San Francisco, CA"), coordinates as "lat,lng" (e.g., "37.7749,-122.4194"), or GeoJSON object as a JSON string.',
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
      resolution: {
        type: 'string',
        description:
          'Minimum resolution in meters (e.g., "0.5" for 50cm resolution). Optional.',
      },
      imageType: {
        type: 'string',
        enum: ['optical', 'sar', 'multispectral', 'hyperspectral'],
        description:
          'Type of imagery to search for. Options: optical, sar, multispectral, hyperspectral. Optional.',
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

// Parse location string to appropriate format
function parseLocation(location: string): string | GeoJSON {
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

    // Return as GeoJSON Point
    return {
      type: 'Point',
      coordinates: [lng, lat], // GeoJSON uses [lng, lat] order
    } as GeoJSONPoint;
  }

  // Check if it's a GeoJSON string
  if (location.startsWith('{')) {
    try {
      const geojson = JSON.parse(location);
      if (geojson.type === 'Point' || geojson.type === 'Polygon') {
        return geojson as GeoJSON;
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

  // Return as place name string (API will geocode it)
  return location;
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
            text: 'Error: Location parameter is required. Please provide a place name, coordinates (lat,lng), or GeoJSON.',
          },
        ],
        isError: true,
      };
    }

    // Parse location
    let parsedLocation: string | GeoJSON;
    try {
      parsedLocation = parseLocation(locationArg.trim());
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
      location: parsedLocation,
    };

    // Add optional date range
    const startDate = args.startDate as string | undefined;
    const endDate = args.endDate as string | undefined;

    if (startDate || endDate) {
      if (startDate) {
        try {
          validateDate(startDate, 'startDate');
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

      searchRequest.dateRange = {
        start: startDate || '1900-01-01',
        end: endDate || new Date().toISOString().split('T')[0],
      };
    }

    // Add optional resolution
    const resolution = args.resolution as string | undefined;
    if (resolution) {
      const resNum = parseFloat(resolution);
      if (isNaN(resNum) || resNum <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid resolution "${resolution}". Must be a positive number in meters.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.resolution = resolution;
    }

    // Add optional image type
    const imageType = args.imageType as string | undefined;
    if (imageType) {
      const validTypes = ['optical', 'sar', 'multispectral', 'hyperspectral'];
      if (!validTypes.includes(imageType)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid imageType "${imageType}". Must be one of: ${validTypes.join(', ')}.`,
            },
          ],
          isError: true,
        };
      }
      searchRequest.imageType = imageType as ImageType;
    }

    // Add optional openDataOnly flag
    const openDataOnly = args.openDataOnly as boolean | undefined;
    if (openDataOnly !== undefined) {
      searchRequest.openDataOnly = openDataOnly;
    }

    // Add optional limit
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
      searchRequest.limit = limit;
    } else {
      searchRequest.limit = 10; // Default limit
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
            text: `No imagery found for the specified search criteria.\n\nSearch parameters:\n- Location: ${locationArg}${startDate ? `\n- Start date: ${startDate}` : ''}${endDate ? `\n- End date: ${endDate}` : ''}${resolution ? `\n- Resolution: ${resolution}m` : ''}${imageType ? `\n- Image type: ${imageType}` : ''}${openDataOnly ? `\n- Open data only: yes` : ''}\n\nTry adjusting your search parameters or expanding the date range.`,
          },
        ],
      };
    }

    // Format successful results
    const resultText = response.results
      .map((img, index) => {
        const lines = [
          `${index + 1}. Image ID: ${img.id}`,
          `   Provider: ${img.provider}`,
          `   Capture Date: ${img.captureDate}`,
          `   Resolution: ${img.resolution}`,
          `   Type: ${img.imageType}`,
          `   Price: ${img.currency} ${img.price.toFixed(2)}`,
        ];

        if (img.cloudCoverage !== undefined) {
          lines.push(`   Cloud Coverage: ${img.cloudCoverage}%`);
        }

        if (img.previewUrl) {
          lines.push(`   Preview: ${img.previewUrl}`);
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
            '\n\nTip: Make sure the location is a valid place name, coordinates (lat,lng), or GeoJSON.';
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
  parseLocation,
  validateDate,
  getSkyFiClient,
  resetSkyFiClient,
};
