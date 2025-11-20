/**
 * SkyFi MCP Server
 *
 * Model Context Protocol server for SkyFi geospatial/satellite imagery services.
 * Enables AI agents to search, price, order, and monitor satellite imagery.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import { toolRegistry } from './mcp/index.js';
import { registerAllTools } from './tools/index.js';

// Register all tools
registerAllTools();

// Create MCP server
const server = new Server(
  {
    name: 'skyfi-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = toolRegistry.listTools();
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle call tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = toolRegistry.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'TOOL_NOT_FOUND',
            message: `Tool "${name}" not found`,
          }),
        },
      ],
      isError: true,
    };
  }

  const result = await tool.handler(args || {});

  return {
    content: result.content,
    isError: result.isError,
  };
});

// Start the server with appropriate transport
async function main() {
  const transportType = process.env.MCP_TRANSPORT || 'stdio';

  if (transportType === 'http') {
    // HTTP/SSE transport for remote deployment
    const app = express();
    const port = parseInt(process.env.PORT || '3000', 10);

    // Note: Don't use express.json() globally - the MCP SDK's SSEServerTransport
    // needs to read the raw request body stream itself

    // Single transport for simplicity (supports one client at a time)
    let activeTransport: SSEServerTransport | null = null;

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        server: 'skyfi-mcp',
        version: '0.1.0',
        tools: toolRegistry.size,
        uptime: process.uptime(),
      });
    });

    // SSE endpoint for MCP connections
    app.get('/sse', async (_req: Request, res: Response) => {
      console.log('New SSE connection established');

      const transport = new SSEServerTransport('/message', res);
      activeTransport = transport;

      // Clean up on connection close
      res.on('close', () => {
        console.log('SSE connection closed');
        if (activeTransport === transport) {
          activeTransport = null;
        }
      });

      await server.connect(transport);
    });

    // Message endpoint for client-to-server communication
    app.post('/message', async (req: Request, res: Response) => {
      console.log('POST /message received');

      if (!activeTransport) {
        console.log('No active transport - client must connect to /sse first');
        res.status(404).json({ error: 'No active session. Connect to /sse first.' });
        return;
      }

      try {
        await activeTransport.handlePostMessage(req, res);
        console.log('Message handled successfully');
      } catch (error) {
        console.error('Error handling message:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    app.listen(port, () => {
      console.log(`SkyFi MCP Server (HTTP) listening on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`SSE endpoint: http://localhost:${port}/sse`);
      console.log(`Tools registered: ${toolRegistry.size}`);
    });

  } else {
    // Stdio transport for local development
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log to stderr so it doesn't interfere with stdio protocol
    console.error(`SkyFi MCP Server (stdio) started with ${toolRegistry.size} tools`);
  }
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
