# SkyFi MCP Server

A Model Context Protocol (MCP) server that enables AI agents to programmatically access SkyFi's geospatial/satellite imagery services.

## Features

- **Archive Search** - Find existing satellite imagery for any location
- **Pricing & Feasibility** - Get cost estimates before ordering
- **Order Placement** - Purchase imagery with user confirmation
- **Order Tracking** - Monitor order status and delivery
- **AOI Monitoring** - Set up alerts for new imagery

## Available Tools

| Category | Tools |
|----------|-------|
| Search | `search_archive` |
| Pricing | `get_pricing_estimate`, `check_order_feasibility` |
| Orders | `place_order`, `get_order_status`, `cancel_order`, `list_orders`, `poll_order_status` |
| Monitoring | `create_monitor`, `list_monitors`, `get_monitor`, `delete_monitor`, `pause_monitor`, `resume_monitor` |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- SkyFi API key

### Installation

```bash
# Clone the repository
git clone https://github.com/mfuechec/SkyFiMCP.git
cd SkyFiMCP

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and add your SKYFI_API_KEY

# Run in development
pnpm dev
```

### Claude Desktop Integration

Add to your Claude Desktop config:

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

### Running Tests

```bash
pnpm test
```

### Building

```bash
pnpm build
pnpm start
```

## Documentation

- [API Reference](docs/api/README.md) - Complete tool documentation with examples
- [Integration Guide](docs/integration/README.md) - Connect to Claude, GPT, and other AI agents
- [Deployment Guide](docs/deployment/README.md) - Production deployment and troubleshooting

## Example Usage

Ask Claude:

> "Search for satellite imagery of San Francisco from the last month with at least 1m resolution"

> "Get pricing for image img_abc123 and place an order if it's under $50"

> "Set up a daily monitor for new imagery over my construction site at these coordinates"

## License

MIT
