/**
 * Tools Index
 * Registers all available MCP tools
 */

import { registerPingTool } from './ping.js';
import { registerPricingTools } from './pricing.js';
import { registerOrderTools } from './order.js';
import { registerMonitorTools } from './monitor.js';
import { registerSearchArchiveTool } from './search-archive.js';
import { registerGetArchivesPageTool } from './get-archives-page.js';
import { registerGetArchiveTool } from './get-archive.js';
import { registerBulkOperationsTools } from './bulk-operations.js';

/**
 * Register all tools with the registry
 */
export function registerAllTools(): void {
  registerPingTool();
  registerPricingTools();
  registerOrderTools();
  registerMonitorTools();
  registerSearchArchiveTool();
  registerGetArchivesPageTool();
  registerGetArchiveTool();
  registerBulkOperationsTools();
  // Add more tool registrations here as they are implemented
}
