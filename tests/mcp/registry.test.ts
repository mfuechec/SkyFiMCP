import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/mcp/registry.js';
import type { ToolDefinition, MCPToolCallResponse } from '../../src/models/mcp.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const mockToolDefinition: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
    },
  };

  const mockHandler = async (): Promise<MCPToolCallResponse> => ({
    content: [{ type: 'text', text: 'test response' }],
  });

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a new tool', () => {
      registry.register(mockToolDefinition, mockHandler);
      expect(registry.has('test_tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw error when registering duplicate tool', () => {
      registry.register(mockToolDefinition, mockHandler);
      expect(() => registry.register(mockToolDefinition, mockHandler)).toThrow(
        'Tool "test_tool" is already registered'
      );
    });
  });

  describe('get', () => {
    it('should return tool entry when tool exists', () => {
      registry.register(mockToolDefinition, mockHandler);
      const entry = registry.get('test_tool');
      expect(entry).toBeDefined();
      expect(entry?.definition.name).toBe('test_tool');
    });

    it('should return undefined when tool does not exist', () => {
      const entry = registry.get('nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('listTools', () => {
    it('should return empty array when no tools registered', () => {
      const tools = registry.listTools();
      expect(tools).toEqual([]);
    });

    it('should return all registered tool definitions', () => {
      registry.register(mockToolDefinition, mockHandler);
      registry.register(
        { ...mockToolDefinition, name: 'another_tool' },
        mockHandler
      );

      const tools = registry.listTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('test_tool');
      expect(tools.map((t) => t.name)).toContain('another_tool');
    });
  });

  describe('clear', () => {
    it('should remove all registered tools', () => {
      registry.register(mockToolDefinition, mockHandler);
      expect(registry.size).toBe(1);

      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.has('test_tool')).toBe(false);
    });
  });
});
