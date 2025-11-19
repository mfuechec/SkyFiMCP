/**
 * MCP Protocol Types
 * Based on the Model Context Protocol specification
 */

import { z } from 'zod';

// Tool parameter schema
export const ToolParameterSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  required: z.array(z.string()).optional(),
  properties: z.record(z.any()).optional(),
});

// Tool definition schema
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: ToolParameterSchema,
});

// Tool call request schema
export const ToolCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any()).optional(),
  }),
});

// Tool list request schema
export const ToolListRequestSchema = z.object({
  method: z.literal('tools/list'),
});

// MCP request schema (union of all request types)
export const MCPRequestSchema = z.discriminatedUnion('method', [
  ToolCallRequestSchema,
  ToolListRequestSchema,
]);

// Types derived from schemas
export type ToolParameter = z.infer<typeof ToolParameterSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
export type ToolListRequest = z.infer<typeof ToolListRequestSchema>;
export type MCPRequest = z.infer<typeof MCPRequestSchema>;

// Response types
export interface MCPToolListResponse {
  tools: ToolDefinition[];
}

export interface MCPToolCallResponse {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// Error types
export interface MCPError {
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export type MCPErrorCode =
  | 'INVALID_REQUEST'
  | 'TOOL_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'INTERNAL_ERROR'
  | 'AUTH_INVALID'
  | 'RATE_LIMITED';

// Tool handler type
export type ToolHandler = (
  args: Record<string, unknown>
) => Promise<MCPToolCallResponse>;

// Tool registry entry
export interface ToolRegistryEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}
