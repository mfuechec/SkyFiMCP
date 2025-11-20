/**
 * MCP Protocol Routes
 * Express router for MCP endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import {
  MCPRequestSchema,
  ToolCallRequestSchema,
} from '../models/mcp.js';
import { handleToolsList, handleToolsCall } from './handlers.js';
import { formatErrorResponse, MCPErrors } from './errors.js';

const router: RouterType = Router();

/**
 * POST /mcp
 * Main MCP endpoint - handles all MCP protocol requests
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request format
    const parseResult = MCPRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw MCPErrors.invalidRequest(
        `Invalid MCP request: ${parseResult.error.message}`
      );
    }

    const request = parseResult.data;

    // Route to appropriate handler based on method
    let response;
    switch (request.method) {
      case 'tools/list':
        response = await handleToolsList();
        break;
      case 'tools/call':
        response = await handleToolsCall(request);
        break;
      default:
        throw MCPErrors.invalidRequest(`Unknown method: ${(request as { method: string }).method}`);
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mcp/tools
 * Convenience endpoint to list all tools (alternative to POST with tools/list)
 */
router.get('/tools', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await handleToolsList();
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mcp/tools/:name
 * Convenience endpoint to call a specific tool
 */
router.post(
  '/tools/:name',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const toolCallRequest = {
        method: 'tools/call' as const,
        params: {
          name: req.params.name,
          arguments: req.body,
        },
      };

      // Validate
      const parseResult = ToolCallRequestSchema.safeParse(toolCallRequest);
      if (!parseResult.success) {
        throw MCPErrors.invalidRequest(parseResult.error.message);
      }

      const response = await handleToolsCall(parseResult.data);
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * MCP Error handling middleware
 */
export function mcpErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { error: errorResponse, statusCode } = formatErrorResponse(error);
  res.status(statusCode).json({ error: errorResponse });
}

export { router as mcpRouter };
