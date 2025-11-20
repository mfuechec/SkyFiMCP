/**
 * Ping Tool
 * Simple test tool to verify MCP server functionality
 */

import { toolRegistry, type MCPToolCallResponse } from '../mcp/index.js';

// Tool definition
const pingToolDefinition = {
  name: 'ping',
  description: 'Test tool that returns a pong response. Use this to verify the MCP server is working.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Optional message to echo back',
      },
    },
  },
};

// Tool handler
async function pingHandler(
  args: Record<string, unknown>
): Promise<MCPToolCallResponse> {
  const message = args.message as string | undefined;

  return {
    content: [
      {
        type: 'text',
        text: message ? `Pong: ${message}` : 'Pong!',
      },
    ],
  };
}

// Register the tool
export function registerPingTool(): void {
  toolRegistry.register(pingToolDefinition, pingHandler);
}
