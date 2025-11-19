/**
 * MCP Protocol Handlers
 * Handles tools/list and tools/call requests
 */

import type {
  MCPToolListResponse,
  MCPToolCallResponse,
  ToolCallRequest,
} from '../models/mcp.js';
import { toolRegistry } from './registry.js';
import { MCPErrors } from './errors.js';

/**
 * Handle tools/list request
 * Returns all registered tools with their definitions
 */
export async function handleToolsList(): Promise<MCPToolListResponse> {
  const tools = toolRegistry.listTools();
  return { tools };
}

/**
 * Handle tools/call request
 * Executes the specified tool with provided arguments
 */
export async function handleToolsCall(
  request: ToolCallRequest
): Promise<MCPToolCallResponse> {
  const { name, arguments: args = {} } = request.params;

  // Check if tool exists
  const tool = toolRegistry.get(name);
  if (!tool) {
    throw MCPErrors.toolNotFound(name);
  }

  try {
    // Execute the tool handler
    const result = await tool.handler(args);
    return result;
  } catch (error) {
    // If it's already an MCP error, re-throw
    if (error instanceof Error && error.name === 'MCPException') {
      throw error;
    }

    // Wrap unexpected errors
    const message =
      error instanceof Error ? error.message : 'Tool execution failed';
    throw MCPErrors.internalError(`Tool "${name}" failed: ${message}`);
  }
}
