/**
 * Get Archives Page Tool
 * MCP tool for paginating through SkyFi archive search results
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';
import {
  SkyFiClient,
  createSkyFiClient,
  SkyFiApiException,
} from '../services/skyfi/client.js';

// Tool definition
const getArchivesPageToolDefinition = {
  name: 'get_archives_page',
  description: `Get the next page of archive search results using a pagination hash.

IMPORTANT: The pageHash is returned in the 'nextPage' field from a previous search_archive call.

This tool allows you to retrieve additional results beyond the initial search page (which is limited to pageSize, typically 10-100 results).

Example workflow:
1. User: "search for imagery in San Francisco"
2. Call search_archive → returns 10 results + nextPage hash
3. User: "show me more results"
4. Call get_archives_page with the nextPage hash → returns next 10 results

Returns the same archive result format as search_archive.`,
  inputSchema: {
    type: 'object',
    properties: {
      pageHash: {
        type: 'string',
        description: 'REQUIRED. Pagination hash from the "nextPage" field of a previous search_archive response.',
      },
    },
    required: ['pageHash'],
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
async function getArchivesPageHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  try {
    // Validate required parameter
    const pageHash = args.pageHash as string | undefined;
    if (!pageHash || pageHash.trim() === '') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: pageHash parameter is required. This should be the "nextPage" value from a previous search_archive call.',
          },
        ],
        isError: true,
      };
    }

    // Get SkyFi client and fetch next page
    const client = getSkyFiClient();
    const response = await client.getArchivesPage(pageHash.trim());

    // Format results
    if (response.archives.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No more results found. This may be the end of the search results.`,
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

    const summary = `Page results: ${response.archives.length} image(s)${response.nextPage ? ' (more pages available - use nextPage hash to continue)' : ' (final page)'}.`;

    const nextPageInfo = response.nextPage
      ? `\n\nNext page hash: ${response.nextPage}`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `${summary}\n\n${resultText}${nextPageInfo}`,
        },
      ],
    };
  } catch (error) {
    // Handle SkyFi API errors
    if (error instanceof SkyFiApiException) {
      let errorMessage = `SkyFi API Error: ${error.message}`;

      // Provide helpful messages for common errors
      switch (error.code) {
        case 'INVALID_PAGE_HASH':
          errorMessage +=
            '\n\nTip: The page hash may have expired or is invalid. Try starting a new search with search_archive.';
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
        : 'An unexpected error occurred while fetching the next page of results.';

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
export function registerGetArchivesPageTool(): void {
  toolRegistry.register(getArchivesPageToolDefinition, getArchivesPageHandler);
}

// Export for testing
export {
  getArchivesPageHandler,
  getArchivesPageToolDefinition,
  getSkyFiClient,
  resetSkyFiClient,
};
