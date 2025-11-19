/**
 * SkyFi MCP Server
 *
 * Model Context Protocol server for SkyFi geospatial/satellite imagery services.
 * Enables AI agents to search, price, order, and monitor satellite imagery.
 */

import express, { type Application } from 'express';
import { mcpRouter, mcpErrorHandler, toolRegistry } from './mcp/index.js';
import { registerAllTools } from './tools/index.js';

// Register all tools
registerAllTools();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    tools: toolRegistry.size,
  });
});

// Server info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'SkyFi MCP Server',
    version: '0.1.0',
    description: 'MCP server for SkyFi geospatial/satellite imagery services',
    endpoints: {
      health: 'GET /health',
      mcp: 'POST /mcp',
      tools: 'GET /mcp/tools',
      callTool: 'POST /mcp/tools/:name',
    },
  });
});

// MCP routes
app.use('/mcp', mcpRouter);

// MCP error handler (must be after routes)
app.use('/mcp', mcpErrorHandler);

// Global error handler
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`SkyFi MCP Server running on port ${PORT}`);
    console.log(`Registered tools: ${toolRegistry.size}`);
  });
}

export { app };
