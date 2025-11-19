/**
 * Tools Index
 * Registers all available MCP tools
 */

import { registerPingTool } from './ping.js';

/**
 * Register all tools with the registry
 */
export function registerAllTools(): void {
  registerPingTool();
  // Add more tool registrations here as they are implemented
  // registerSearchArchiveTool();
  // registerGetPricingTool();
  // etc.
}
