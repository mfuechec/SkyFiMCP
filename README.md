# SkyFi MCP Monorepo

A comprehensive satellite imagery platform integrating SkyFi API with AI assistants (via MCP) and web interface.

## Project Structure

```
skyfi-mcp/
├── apps/
│   ├── frontend/          # React web interface with interactive map
│   │   ├── src/
│   │   │   ├── App.tsx           # Main map component
│   │   │   ├── main.tsx          # Entry point
│   │   │   └── index.css         # Styles
│   │   ├── index.html
│   │   ├── vite.config.ts        # Vite configuration
│   │   └── package.json
│   │
│   └── backend/           # Express API server
│       ├── src/
│       │   └── index.ts          # API endpoints
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── mcp/              # MCP server (current implementation)
│   │   ├── src/
│   │   │   ├── index.ts          # MCP entry point
│   │   │   ├── tools/            # SkyFi tools
│   │   │   ├── services/         # API clients
│   │   │   └── mcp/              # MCP handlers
│   │   ├── tests/
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/           # Shared code between packages
│       ├── src/
│       │   ├── types/
│       │   │   ├── skyfi.ts      # SkyFi types
│       │   │   └── osm.ts        # OSM types (future)
│       │   └── utils/
│       │       └── validators.ts  # Shared utilities
│       ├── tsconfig.json
│       └── package.json
│
├── .taskmaster/          # Task Master AI integration
├── .claude/              # Claude Code configuration
├── docs/                 # Documentation
├── package.json          # Root workspace configuration
└── pnpm-workspace.yaml   # PNPM workspace definition
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build
```

## Development

### Run MCP Server

```bash
# Development mode with auto-reload
pnpm dev:mcp

# Or from packages/mcp directory
cd packages/mcp
pnpm dev
```

### Run Frontend

```bash
# Start Vite dev server (http://localhost:3000)
pnpm dev:frontend

# Or from apps/frontend directory
cd apps/frontend
pnpm dev
```

### Run Backend API

```bash
# Start Express server (http://localhost:3001)
pnpm dev:backend

# Or from apps/backend directory
cd apps/backend
pnpm dev
```

### Run Everything

```bash
# Run all services in parallel (requires concurrently or similar)
pnpm dev
```

## Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build:mcp
pnpm build:frontend
pnpm build:backend
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/mcp && pnpm test
```

## Deployment

### MCP Server

The MCP server can be deployed via npm or run locally:

**Via NPM (recommended):**
```bash
cd packages/mcp
npm publish --access public
```

Users install via `.mcp.json`:
```json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["-y", "@skyfi-mcp/server"],
      "env": {
        "SKYFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

**Local Installation:**
```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/path/to/skyfi-mcp/packages/mcp/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Frontend + Backend

**Development:**
```bash
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
pnpm dev:frontend & pnpm dev:backend
```

**Production:**
```bash
# Build both
pnpm build:frontend
pnpm build:backend

# Frontend build output: apps/frontend/dist
# Deploy to Vercel, Netlify, etc.

# Backend: Run with Node.js
cd apps/backend
node dist/index.js
# Or deploy to Railway, Render, AWS, etc.
```

## Environment Variables

Create `.env` files in each package as needed:

**packages/mcp/.env:**
```bash
SKYFI_API_KEY=your_skyfi_api_key
```

**apps/backend/.env:**
```bash
SKYFI_API_KEY=your_skyfi_api_key
PORT=3001
```

**apps/frontend/.env:**
```bash
VITE_API_URL=http://localhost:3001
```

## Package Scripts

### Root (workspace-level)

- `pnpm dev` - Run all dev servers
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all packages
- `pnpm typecheck` - Type-check all packages
- `pnpm clean` - Remove all node_modules and dist folders

### Individual Packages

- `pnpm dev:mcp` - Run MCP server in dev mode
- `pnpm dev:frontend` - Run frontend dev server
- `pnpm dev:backend` - Run backend dev server
- `pnpm build:mcp` - Build MCP server
- `pnpm build:frontend` - Build frontend
- `pnpm build:backend` - Build backend

## Features

### Current (MCP Server)

- ✅ SkyFi API integration
- ✅ Feasibility checks
- ✅ Pricing queries
- ✅ Image ordering
- ✅ Archive search
- ✅ Order monitoring
- ✅ Claude Desktop/Code integration

### Planned (Frontend + Backend)

- 🔄 Interactive map interface (Leaflet/OpenStreetMap)
- 🔄 Visual POI selection
- 🔄 Toggle layers (warehouses, solar farms, etc.)
- 🔄 Click-to-order satellite imagery
- 🔄 Real-time pricing preview
- 🔄 Order history and management
- 🔄 OpenStreetMap integration
  - Geocoding (address → coordinates)
  - Feature search (find POIs by type)
  - Reverse geocoding (coordinates → address)

## Architecture

### MCP Server (AI-Native Interface)

```
User → Claude Desktop/Code → MCP Server → SkyFi API
```

### Web App (Visual Interface)

```
User → Frontend (React) → Backend (Express) → SkyFi API
                                            → OSM API
```

### Shared Code

Both MCP and web app use the `@skyfi-mcp/shared` package for:
- Type definitions
- Validation utilities
- Business logic
- API client code (future)

## Available MCP Tools

| Category | Tools |
|----------|-------|
| Search | `search_archive` |
| Pricing | `get_pricing_estimate`, `check_order_feasibility` |
| Orders | `place_order`, `get_order_status`, `cancel_order`, `list_orders`, `poll_order_status` |
| Monitoring | `create_monitor`, `list_monitors`, `get_monitor`, `delete_monitor`, `pause_monitor`, `resume_monitor` |

## Example Usage

Ask Claude:

> "Search for satellite imagery of San Francisco from the last month with at least 1m resolution"

> "Get pricing for image img_abc123 and place an order if it's under $50"

> "Set up a daily monitor for new imagery over my construction site at these coordinates"

## Documentation

- [API Reference](docs/api/README.md) - Complete tool documentation with examples
- [Integration Guide](docs/integration/README.md) - Connect to Claude, GPT, and other AI agents
- [Deployment Guide](docs/deployment/DEPLOYMENT.md) - Production deployment options

## Contributing

This is a monorepo managed with PNPM workspaces. When adding dependencies:

```bash
# Add to specific package
pnpm --filter @skyfi-mcp/frontend add react-query

# Add to root (dev dependencies)
pnpm add -D -w prettier

# Add shared dependency to multiple packages
pnpm --filter "@skyfi-mcp/*" add lodash
```

## License

MIT
