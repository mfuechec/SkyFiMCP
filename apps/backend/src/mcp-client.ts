/**
 * MCP Client for communicating with the SkyFi MCP Server
 */
import axios from 'axios';
import { EventSource } from 'eventsource';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPToolsResponse {
  tools: MCPTool[];
}

interface MCPToolCallResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

class MCPClient {
  private sessionId: number = 0;
  private eventSource: EventSource | null = null;
  private connected: boolean = false;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = new Map();

  async connect() {
    if (this.connected) return;

    return new Promise<void>((resolve, reject) => {
      this.eventSource = new EventSource(`${MCP_SERVER_URL}/sse`);

      this.eventSource.onopen = () => {
        console.log('✅ Connected to MCP server');
        this.connected = true;
        resolve();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 MCP message:', data);

          if (data.id !== undefined && this.pendingRequests.has(data.id)) {
            const pending = this.pendingRequests.get(data.id)!;
            this.pendingRequests.delete(data.id);

            if (data.error) {
              pending.reject(new Error(data.error.message || 'MCP error'));
            } else {
              pending.resolve(data.result);
            }
          }
        } catch (error) {
          console.error('Error parsing MCP message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('❌ MCP SSE error:', error);
        this.connected = false;
        if (!this.pendingRequests.size) {
          reject(new Error('Failed to connect to MCP server'));
        }
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('MCP connection timeout'));
        }
      }, 5000);
    });
  }

  private async sendRequest(method: string, params: any = {}): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const id = ++this.sessionId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    console.log('📤 Sending to MCP:', request);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      axios.post(`${MCP_SERVER_URL}/message`, request)
        .catch((error) => {
          this.pendingRequests.delete(id);
          reject(error);
        });

      // Timeout individual requests after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  async listTools(): Promise<MCPTool[]> {
    try {
      const response = await this.sendRequest('tools/list');
      return response.tools || [];
    } catch (error) {
      console.error('Failed to list MCP tools:', error);
      return [];
    }
  }

  async callTool(name: string, args: any): Promise<MCPToolCallResponse> {
    try {
      const response = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });
      return response;
    } catch (error) {
      console.error(`Failed to call MCP tool ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'MCP tool call failed', details: String(error) }),
          },
        ],
        isError: true,
      };
    }
  }

  async disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
  }
}

export const mcpClient = new MCPClient();

/**
 * Convert MCP tool schema to OpenAI function format
 */
export function convertMCPToolToOpenAI(mcpTool: MCPTool) {
  return {
    type: 'function',
    function: {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    },
  };
}
