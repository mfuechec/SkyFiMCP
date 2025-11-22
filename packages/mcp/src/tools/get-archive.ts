/**
 * Get Archive Tool
 * MCP tool for retrieving detailed information about a specific archive image
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import {
  SkyFiClient,
  createSkyFiClient,
  SkyFiApiException,
} from '../services/skyfi/client.js';

// Tool definition
const getArchiveToolDefinition = {
  name: 'get_archive',
  description: `Get detailed information for a specific archive image by its ID.

IMPORTANT: The archiveId is returned in search results from search_archive or get_archives_page.

This tool provides complete metadata for a known archive asset including:
- Full capture details (timestamp, cloud coverage, off-nadir angle)
- Pricing information (price per square km)
- Delivery timeframe
- Provider and constellation details
- Resolution and product type
- Footprint (coverage area in WKT format)
- Thumbnail URLs

Use this when:
- User wants detailed information about a specific archive image
- User wants to see pricing before ordering
- User needs the complete metadata for an archive they're interested in

Example workflow:
1. search_archive returns: Archive ID "abc123"
2. User: "tell me more about that first image"
3. Call get_archive with archiveId="abc123" → returns full details`,
  inputSchema: {
    type: 'object',
    properties: {
      archiveId: {
        type: 'string',
        description: 'REQUIRED. The unique identifier for the archive image (from search results).',
      },
    },
    required: ['archiveId'],
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

// Tool handler
async function getArchiveHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  try {
    // Validate required parameter
    const archiveId = args.archiveId as string | undefined;
    if (!archiveId || archiveId.trim() === '') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: archiveId parameter is required. This should be an archive ID from search results.',
          },
        ],
        isError: true,
      };
    }

    // Get SkyFi client and fetch archive details
    const client = getSkyFiClient();
    const archive = await client.getArchive(archiveId.trim());

    // Format detailed results
    const details: string[] = [
      `=== Archive Details: ${archive.archiveId} ===`,
      '',
      `Provider: ${archive.provider}`,
    ];

    if (archive.constellation) {
      details.push(`Constellation: ${archive.constellation}`);
    }

    details.push(
      `Product Type: ${archive.productType}`,
      `Resolution: ${archive.resolution}`
    );

    if (archive.platformResolution) {
      details.push(`Platform Resolution: ${archive.platformResolution}m`);
    }

    if (archive.gsd) {
      details.push(`Ground Sample Distance (GSD): ${archive.gsd}m`);
    }

    details.push(
      '',
      '--- Capture Information ---',
      `Capture Date: ${archive.captureTimestamp}`
    );

    if (archive.cloudCoveragePercent !== undefined) {
      details.push(`Cloud Coverage: ${archive.cloudCoveragePercent}%`);
    }

    if (archive.offNadirAngle !== undefined) {
      details.push(`Off-Nadir Angle: ${archive.offNadirAngle}°`);
    }

    if (archive.priceForOneSquareKm !== undefined || archive.deliveryTimeHours !== undefined) {
      details.push('', '--- Pricing & Delivery ---');

      if (archive.priceForOneSquareKm !== undefined) {
        details.push(`Price: $${archive.priceForOneSquareKm} per km²`);
      }

      if (archive.minSquareKms !== undefined) {
        details.push(`Minimum Area: ${archive.minSquareKms} km²`);
      }

      if (archive.maxSquareKms !== undefined) {
        details.push(`Maximum Area: ${archive.maxSquareKms} km²`);
      }

      if (archive.deliveryTimeHours !== undefined) {
        details.push(`Delivery Time: ${archive.deliveryTimeHours} hours`);
      }
    }

    if (archive.thumbnailUrls) {
      details.push('', '--- Thumbnails ---');
      if (archive.thumbnailUrls.small) {
        details.push(`Small: ${archive.thumbnailUrls.small}`);
      }
      if (archive.thumbnailUrls.medium) {
        details.push(`Medium: ${archive.thumbnailUrls.medium}`);
      }
      if (archive.thumbnailUrls.large) {
        details.push(`Large: ${archive.thumbnailUrls.large}`);
      }
    }

    if (archive.footprint) {
      details.push(
        '',
        '--- Coverage Area ---',
        `Footprint (WKT): ${archive.footprint.substring(0, 100)}${archive.footprint.length > 100 ? '...' : ''}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: details.join('\n'),
        },
      ],
    };
  } catch (error) {
    // Handle SkyFi API errors
    if (error instanceof SkyFiApiException) {
      let errorMessage = `SkyFi API Error: ${error.message}`;

      // Provide helpful messages for common errors
      switch (error.code) {
        case 'NOT_FOUND':
          errorMessage +=
            '\n\nTip: The archive ID may not exist or may have been removed. Check the archive ID and try again.';
          break;
        case 'INVALID_ARCHIVE_ID':
          errorMessage +=
            '\n\nTip: The archive ID format is invalid. Make sure you\'re using a valid archive ID from search results.';
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
        : 'An unexpected error occurred while fetching archive details.';

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
export function registerGetArchiveTool(): void {
  toolRegistry.register(getArchiveToolDefinition, getArchiveHandler);
}

// Export for testing
export {
  getArchiveHandler,
  getArchiveToolDefinition,
  getSkyFiClient,
  resetSkyFiClient,
};
