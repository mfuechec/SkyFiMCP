# Quick Start Guide

## For Existing Users

If you had this repo before the monorepo migration:

```bash
# 1. Pull latest changes
git pull

# 2. Clean and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 3. Build everything
pnpm build

# 4. Run MCP server (same functionality, new location)
pnpm dev:mcp
```

**Update your `.mcp.json` path:**
- Old: `/path/to/SkyFiMCP/dist/index.js`
- New: `/path/to/SkyFiMCP/packages/mcp/dist/index.js`

## For New Users

```bash
# Clone the repo
git clone <your-repo-url>
cd skyfi-mcp

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run what you need:
pnpm dev:mcp        # MCP server for Claude
pnpm dev:frontend   # React web app (experimental)
pnpm dev:backend    # API server (experimental)
```

## Project Layout

```
skyfi-mcp/
├── packages/mcp/      # Your existing MCP server (READY)
├── apps/frontend/     # Web interface (SKELETON - for future)
├── apps/backend/      # API server (SKELETON - for future)
└── packages/shared/   # Shared utilities (BASE - for future)
```

## What's Ready to Use

### ✅ MCP Server (Production Ready)

Everything you had before, just moved to `packages/mcp/`:

- SkyFi API integration
- All tools (feasibility, pricing, ordering, monitoring)
- Claude Desktop/Code integration
- Tests, documentation, etc.

**Run it:**
```bash
pnpm dev:mcp
```

**Deploy it:**
```bash
cd packages/mcp
npm publish
```

### 🚧 Frontend/Backend (Future - Not Implemented Yet)

Basic scaffolding exists for:
- React + Leaflet map interface
- Express API backend
- Shared type definitions

These are **placeholders** for when you want to build the visual interface. Right now they're just empty shells with basic examples.

## Development Workflow

### Just using MCP server:

```bash
cd packages/mcp
pnpm dev          # Run with auto-reload
pnpm test         # Run tests
pnpm build        # Build for production
```

### Working on multiple packages:

```bash
# From project root
pnpm dev:mcp          # Run MCP
pnpm dev:frontend     # Run web UI
pnpm dev:backend      # Run API
pnpm build            # Build everything
pnpm test             # Test everything
```

## Deployment Options

### 1. NPM Package (Recommended for MCP)

```bash
cd packages/mcp
npm publish --access public
```

Users install via:
```bash
npx -y @yourname/skyfi-mcp
```

### 2. Local Install

Build and point your `.mcp.json` to:
```
/path/to/skyfi-mcp/packages/mcp/dist/index.js
```

### 3. Hosted Server (EC2/Railway/etc)

Update your `deploy.sh` to use `packages/mcp/dist/index.js`

See [DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) for full details.

## Common Tasks

### Add dependency to MCP server

```bash
pnpm --filter @skyfi-mcp/server add axios
```

### Update shared types

```bash
# Edit packages/shared/src/types/skyfi.ts
# Then rebuild
pnpm --filter @skyfi-mcp/shared build
pnpm build:mcp
```

### Run tests

```bash
# MCP tests only
cd packages/mcp && pnpm test

# All tests
pnpm test
```

## Next Steps

1. **Using just MCP?** Ignore `apps/` - it's for future web interface
2. **Building web interface?** Start with `apps/frontend` and `apps/backend`
3. **Adding OSM integration?** Add to `packages/shared` so both MCP and web can use it

## Questions?

- **Docs:** See [README.md](README.md) for full documentation
- **Migration:** See [MIGRATION.md](MIGRATION.md) if upgrading from old structure
- **Deployment:** See [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)
