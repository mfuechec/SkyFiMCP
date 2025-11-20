# Migration to Monorepo Structure

This document explains the changes made to restructure the project as a monorepo.

## What Changed

### Before (Single Package)
```
skyfi-mcp/
├── src/              # MCP server code
├── tests/
├── package.json      # Single package.json
└── tsconfig.json
```

### After (Monorepo)
```
skyfi-mcp/
├── apps/
│   ├── frontend/     # NEW: React web app
│   └── backend/      # NEW: Express API
├── packages/
│   ├── mcp/          # MOVED: Your existing MCP code
│   └── shared/       # NEW: Shared utilities/types
└── package.json      # Root workspace config
```

## Setup Instructions

### 1. Clean Install

```bash
# Remove old dependencies
rm -rf node_modules pnpm-lock.yaml

# Install all workspace dependencies
pnpm install
```

### 2. Build Everything

```bash
# Build shared package first (others depend on it)
pnpm --filter @skyfi-mcp/shared build

# Build everything
pnpm build
```

### 3. Test MCP Server

```bash
# Run MCP server (your existing functionality)
pnpm dev:mcp

# Should work exactly as before
```

### 4. (Optional) Try Frontend

```bash
# In one terminal
pnpm dev:backend

# In another terminal
pnpm dev:frontend

# Visit http://localhost:3000
```

## What's Different for Development

### Running the MCP Server

**Before:**
```bash
pnpm dev
```

**After:**
```bash
pnpm dev:mcp
# OR
cd packages/mcp && pnpm dev
```

### Building

**Before:**
```bash
pnpm build
```

**After (build everything):**
```bash
pnpm build

# OR build just MCP
pnpm build:mcp
```

### Testing

**Before:**
```bash
pnpm test
```

**After:**
```bash
# Test MCP server only
cd packages/mcp && pnpm test

# OR test everything
pnpm test
```

### Adding Dependencies

**Before:**
```bash
pnpm add axios
```

**After:**
```bash
# For MCP server
pnpm --filter @skyfi-mcp/server add axios

# For frontend
pnpm --filter @skyfi-mcp/frontend add react-query

# For shared package
pnpm --filter @skyfi-mcp/shared add lodash

# For root (dev tools)
pnpm add -D -w prettier
```

## Claude Desktop Configuration

Update your `.mcp.json`:

**Before:**
```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/path/to/SkyFiMCP/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "your_key"
      }
    }
  }
}
```

**After:**
```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/path/to/SkyFiMCP/packages/mcp/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "your_key"
      }
    }
  }
}
```

Notice the path changed from `/dist/index.js` to `/packages/mcp/dist/index.js`.

## Deployment Changes

### MCP Server Deployment

**NPM Publishing:**

```bash
# Before (from root)
npm publish

# After (from MCP package)
cd packages/mcp
npm publish
```

**EC2 Deployment:**

Update your `deploy.sh`:

```bash
#!/bin/bash
ssh -i "SkyFyMCP-MF.pem" ec2-user@ec2-54-166-96-63.compute-1.amazonaws.com << 'EOF'
  cd skyfi-mcp
  git pull origin master
  pnpm install
  pnpm build:mcp  # Changed from 'pnpm build'
  pm2 restart skyfi-mcp || pm2 start packages/mcp/dist/index.js --name skyfi-mcp  # Updated path
EOF
```

## Troubleshooting

### "Cannot find module '@skyfi-mcp/shared'"

**Solution:**
```bash
# Build shared package first
pnpm --filter @skyfi-mcp/shared build

# Or build everything
pnpm build
```

### "Workspace package not found"

**Solution:**
```bash
# Make sure pnpm-workspace.yaml exists
cat pnpm-workspace.yaml

# Should show:
# packages:
#   - 'apps/*'
#   - 'packages/*'
```

### Dev server not working

**Solution:**
```bash
# From project root
pnpm dev:mcp

# OR from package directory
cd packages/mcp
pnpm dev
```

### Import errors in TypeScript

**Solution:**
```bash
# Rebuild shared package
pnpm --filter @skyfi-mcp/shared build

# Then rebuild the package with errors
pnpm build:mcp
```

## Benefits of This Structure

1. **Separation of Concerns**
   - MCP server (`packages/mcp`)
   - Web frontend (`apps/frontend`)
   - API backend (`apps/backend`)
   - Shared code (`packages/shared`)

2. **Code Reuse**
   - Types in `@skyfi-mcp/shared` used by all packages
   - No duplication of SkyFi types, validators, etc.

3. **Independent Development**
   - Work on frontend without affecting MCP
   - Deploy packages independently
   - Different teams can own different packages

4. **Future Ready**
   - Easy to add OSM integration to shared package
   - Frontend and backend can use same OSM utilities
   - MCP, web app, and mobile app could all share logic

## What's Still the Same

- Your existing MCP server code works identically
- All your tests still pass
- API client logic unchanged
- Claude Desktop integration works the same (just path change)

## Next Steps

1. ✅ Install dependencies (`pnpm install`)
2. ✅ Build packages (`pnpm build`)
3. ✅ Test MCP server (`pnpm dev:mcp`)
4. ✅ Update `.mcp.json` path if using local installation
5. 🔄 Start building frontend/backend when ready

The MCP server is now in `packages/mcp` but functions exactly as before!
