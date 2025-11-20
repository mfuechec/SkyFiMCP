/**
 * Tool Registry
 * Manages registration and lookup of MCP tools
 */

import type {
  ToolDefinition,
  ToolHandler,
  ToolRegistryEntry,
} from '../models/mcp.js';

class ToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();

  /**
   * Register a new tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolRegistryEntry | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition);
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

// Export class for testing
export { ToolRegistry };
