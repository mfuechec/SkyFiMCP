import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleToolsList, handleToolsCall } from '../../src/mcp/handlers.js';
import { toolRegistry } from '../../src/mcp/registry.js';
import { MCPException } from '../../src/mcp/errors.js';
import type { ToolDefinition, MCPToolCallResponse, ToolCallRequest } from '../../src/models/mcp.js';

describe('MCP Handlers', () => {
  const mockToolDefinition: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  };

  const mockHandler = async (args: Record<string, unknown>): Promise<MCPToolCallResponse> => ({
    content: [{ type: 'text', text: `Response: ${args.message || 'default'}` }],
  });

  beforeEach(() => {
    toolRegistry.clear();
  });

  afterEach(() => {
    toolRegistry.clear();
  });

  describe('handleToolsList', () => {
    it('should return empty tools array when no tools registered', async () => {
      const response = await handleToolsList();
      expect(response.tools).toEqual([]);
    });

    it('should return all registered tools', async () => {
      toolRegistry.register(mockToolDefinition, mockHandler);
      toolRegistry.register(
        { ...mockToolDefinition, name: 'another_tool' },
        mockHandler
      );

      const response = await handleToolsList();
      expect(response.tools).toHaveLength(2);
      expect(response.tools.map((t) => t.name)).toContain('test_tool');
      expect(response.tools.map((t) => t.name)).toContain('another_tool');
    });
  });

  describe('handleToolsCall', () => {
    it('should execute tool and return response', async () => {
      toolRegistry.register(mockToolDefinition, mockHandler);

      const request: ToolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { message: 'hello' },
        },
      };

      const response = await handleToolsCall(request);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].text).toBe('Response: hello');
    });

    it('should use default arguments when none provided', async () => {
      toolRegistry.register(mockToolDefinition, mockHandler);

      const request: ToolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'test_tool',
        },
      };

      const response = await handleToolsCall(request);
      expect(response.content[0].text).toBe('Response: default');
    });

    it('should throw TOOL_NOT_FOUND when tool does not exist', async () => {
      const request: ToolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'nonexistent',
        },
      };

      await expect(handleToolsCall(request)).rejects.toThrow(MCPException);
      await expect(handleToolsCall(request)).rejects.toMatchObject({
        code: 'TOOL_NOT_FOUND',
      });
    });

    it('should wrap handler errors in INTERNAL_ERROR', async () => {
      const errorHandler = async (): Promise<MCPToolCallResponse> => {
        throw new Error('Handler failed');
      };

      toolRegistry.register(mockToolDefinition, errorHandler);

      const request: ToolCallRequest = {
        method: 'tools/call',
        params: {
          name: 'test_tool',
        },
      };

      await expect(handleToolsCall(request)).rejects.toThrow(MCPException);
      await expect(handleToolsCall(request)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
