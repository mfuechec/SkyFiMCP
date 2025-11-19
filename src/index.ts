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

    // Store active transports by session ID
    const transports = new Map<string, SSEServerTransport>();

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

      // Get the session ID from the transport after it's initialized
      // The transport sends this to the client in the endpoint event
      const sessionId = crypto.randomUUID();
      transports.set(sessionId, transport);

      // Clean up on connection close
      res.on('close', () => {
        console.log('SSE connection closed');
        transports.delete(sessionId);
      });

      await server.connect(transport);
    });

    // Message endpoint for client-to-server communication
    app.post('/message', express.json(), async (req: Request, res: Response) => {
      // Get session ID from query parameter
      const sessionId = req.query.sessionId as string;

      if (sessionId) {
        const transport = transports.get(sessionId);
        if (transport) {
          try {
            await transport.handlePostMessage(req, res);
            return;
          } catch (error) {
            console.error('Error handling message:', error);
            res.status(500).json({ error: 'Internal server error' });
            return;
          }
        }
      }

      // Fallback: try the most recent transport (for clients that don't send sessionId)
      const allTransports = Array.from(transports.values());
      if (allTransports.length > 0) {
        try {
          await allTransports[allTransports.length - 1].handlePostMessage(req, res);
          return;
        } catch (error) {
          console.error('Error handling message:', error);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }
      }

      res.status(404).json({ error: 'No active session' });
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
