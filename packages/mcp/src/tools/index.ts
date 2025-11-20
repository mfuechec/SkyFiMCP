/**
 * Tools Index
 * Registers all available MCP tools
 */

import { registerPingTool } from './ping.js';
import { registerPricingTools } from './pricing.js';
import { registerOrderTools } from './order.js';
import { registerMonitorTools } from './monitor.js';

/**
 * Register all tools with the registry
 */
export function registerAllTools(): void {
  registerPingTool();
  registerPricingTools();
  registerOrderTools();
  registerMonitorTools();
  // Add more tool registrations here as they are implemented
}
