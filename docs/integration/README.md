# SkyFi MCP Integration Guide

How to connect AI agents to the SkyFi MCP server.

## Overview

The SkyFi MCP server implements the Model Context Protocol, allowing AI agents like Claude and GPT to access satellite imagery services through a standardized interface.

## Claude Desktop Integration

### Configuration

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/path/to/SkyFiMCP/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Using with npx

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["-y", "skyfi-mcp"],
      "env": {
        "SKYFI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Verify Connection

After restarting Claude Desktop, you should see the SkyFi tools available. Try asking:

> "Search for satellite imagery of San Francisco from the last month"

## Claude Code Integration

### Configuration

Create or edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/path/to/SkyFiMCP/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Usage

The tools will be available as `mcp__skyfi__<tool_name>`. For example:

```
mcp__skyfi__search_archive
mcp__skyfi__get_pricing_estimate
mcp__skyfi__place_order
```

## OpenAI GPT Integration

### Custom GPT Actions

You can expose the MCP server as an API for custom GPTs:

1. Run the MCP server with HTTP transport
2. Create an OpenAPI spec for the tools
3. Add as an action in your custom GPT

### Function Calling

For direct API integration:

```python
import openai

tools = [
    {
        "type": "function",
        "function": {
            "name": "search_archive",
            "description": "Search for satellite imagery",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Location to search"
                    },
                    "resolution": {
                        "type": "string",
                        "description": "Minimum resolution"
                    }
                },
                "required": ["location"]
            }
        }
    }
]

response = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Find satellite imagery of NYC"}],
    tools=tools
)
```

## Common Workflows

### 1. Search and Order Workflow

```
User: Find high-resolution imagery of downtown Seattle

Agent:
1. search_archive(location="downtown Seattle", resolution="0.5m")
2. Present results to user
3. get_pricing_estimate(imageId="selected_image_id")
4. User confirms price
5. place_order(imageId="selected_image_id", userConfirmationToken="token")
6. poll_order_status(orderId="order_id")
7. Return download URLs when complete
```

### 2. New Capture Workflow

```
User: I need new imagery of this construction site

Agent:
1. check_order_feasibility(taskingRequest={location, resolution, captureDate})
2. If feasible, get_pricing_estimate(taskingRequest={...})
3. User confirms price
4. place_order(taskingRequest={...}, userConfirmationToken="token")
5. poll_order_status to track progress
```

### 3. Monitoring Workflow

```
User: Alert me when new imagery is available for my farm

Agent:
1. create_monitor(location={polygon}, webhookUrl="...", frequency="daily")
2. Return monitor ID and confirmation
3. User receives webhook notifications when new imagery matches
```

## Best Practices

### API Key Security

- Never hardcode API keys in source code
- Use environment variables
- Rotate keys periodically
- Use separate keys for development and production

### Error Handling

Always handle potential errors:

```javascript
const result = await searchArchive({
  apiKey: process.env.SKYFI_API_KEY,
  location: "San Francisco"
});

if (result.isError) {
  // Handle error
  console.error(result.content[0].text);
} else {
  // Process results
  const data = JSON.parse(result.content[0].text);
}
```

### Rate Limiting

- Implement exponential backoff for retries
- Cache results when appropriate
- Use polling with reasonable intervals (30+ seconds)

### User Confirmation

For order placement, always:
1. Show pricing to user first
2. Get explicit confirmation
3. Use the confirmation token
4. Never auto-approve orders without user consent

## Webhook Integration

### Webhook Payload

When a monitor triggers, SkyFi sends:

```json
{
  "event": "new_imagery",
  "monitorId": "mon_abc123",
  "imagery": {
    "id": "img_xyz789",
    "captureDate": "2025-01-15T10:00:00Z",
    "resolution": "1m",
    "price": 45.00
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Webhook Security

- Verify webhook signatures
- Use HTTPS endpoints
- Implement idempotency for duplicate events

## Testing

### Mock Server

For development and testing, you can use the test fixtures:

```javascript
import nock from 'nock';

nock('https://api.skyfi.com/v1')
  .post('/archive/search')
  .reply(200, {
    results: [...],
    total: 10,
    hasMore: false
  });
```

### Test API Key

Contact SkyFi support for a sandbox API key with test credentials.

## Troubleshooting

See [Deployment Guide - Troubleshooting](../deployment/README.md#troubleshooting) for common issues and solutions.
