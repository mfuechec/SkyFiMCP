/**
 * SkyFi MCP Server
 *
 * Model Context Protocol server for SkyFi geospatial/satellite imagery services.
 * Enables AI agents to search, price, order, and monitor satellite imagery.
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Placeholder for MCP endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'SkyFi MCP Server',
    version: '0.1.0',
    description: 'MCP server for SkyFi geospatial/satellite imagery services'
  });
});

app.listen(PORT, () => {
  console.log(`SkyFi MCP Server running on port ${PORT}`);
});

export { app };
