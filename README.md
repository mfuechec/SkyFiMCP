# SkyFi MCP Server

A Model Context Protocol (MCP) server that enables AI agents to programmatically access SkyFi's geospatial/satellite imagery services.

## Features

- **Archive Search** - Find existing satellite imagery for any location
- **Pricing & Feasibility** - Get cost estimates before ordering
- **Order Placement** - Purchase imagery with user confirmation
- **Order Tracking** - Monitor order status and delivery
- **AOI Monitoring** - Set up alerts for new imagery

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

- [API Reference](docs/api/) - Complete tool documentation
- [Integration Guide](docs/integration/) - Connect to AI agents
- [Deployment Guide](docs/deployment/) - Production deployment

## License

MIT
