# SkyFi MCP Deployment Guide

## Deployment Options

Your MCP server can be deployed in several ways depending on your use case.

---

## Option 1: NPM Package (Recommended for MCP)

**Best for:** Distributing to end users who will use it with Claude Desktop/Code

### Setup

1. **Prepare package.json**

```json
{
  "name": "@yourname/skyfi-mcp",
  "version": "1.0.0",
  "description": "MCP server for SkyFi satellite imagery",
  "main": "dist/index.js",
  "bin": {
    "skyfi-mcp": "dist/index.js"
  },
  "files": [
    "dist/**/*",
    "README.md"
  ],
  "keywords": ["mcp", "skyfi", "satellite", "imagery"],
  "author": "Your Name",
  "license": "MIT"
}
```

2. **Build and publish**

```bash
# Build TypeScript
pnpm build

# Test locally first
npm link

# Publish to npm
npm login
npm publish --access public
```

3. **Users install via**

```bash
# In their .mcp.json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["-y", "@yourname/skyfi-mcp"],
      "env": {
        "SKYFI_API_KEY": "their_key_here"
      }
    }
  }
}
```

**Pros:**
- ✅ Easy distribution
- ✅ Version management
- ✅ Users get updates via `npx -y`
- ✅ No server hosting needed

**Cons:**
- ❌ Requires npm account
- ❌ Public or paid npm for private packages

---

## Option 2: Direct Installation (Git)

**Best for:** Development, private use, or before npm publish

### Setup

```bash
# Users clone your repo
git clone https://github.com/yourname/skyfi-mcp.git
cd skyfi-mcp
pnpm install
pnpm build
```

### Configuration in .mcp.json

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "node",
      "args": ["/absolute/path/to/skyfi-mcp/dist/index.js"],
      "env": {
        "SKYFI_API_KEY": "their_key_here"
      }
    }
  }
}
```

**Pros:**
- ✅ No npm account needed
- ✅ Full control over updates
- ✅ Easy for private development

**Cons:**
- ❌ Manual updates
- ❌ Absolute paths required
- ❌ Users need to build locally

---

## Option 3: Hosted MCP Server (SSE Transport)

**Best for:** Shared team access, enterprise use, or if you want centralized control

### Architecture

```
User → Claude Desktop → Your Hosted MCP Server (HTTP/SSE) → SkyFi API
```

### Implementation

1. **Enable SSE transport in your MCP**

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
const server = new Server(/* ... */);

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

app.listen(3000);
```

2. **Deploy to hosting platform**

```bash
# Example: Deploy to Railway.app
railway login
railway init
railway up

# Or Render.com, Fly.io, AWS, etc.
```

3. **Users configure .mcp.json**

```json
{
  "mcpServers": {
    "skyfi": {
      "url": "https://your-mcp-server.railway.app/sse"
    }
  }
}
```

**Pros:**
- ✅ Centralized updates
- ✅ Shared API key management
- ✅ Usage analytics possible
- ✅ Team collaboration

**Cons:**
- ❌ Hosting costs
- ❌ Need to manage uptime
- ❌ Security considerations (auth, rate limiting)
- ❌ More complex setup

---

## Option 4: Docker Container

**Best for:** Self-hosting, enterprise deployments, or reproducible environments

### Setup

1. **Create Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript
RUN pnpm build

# Expose port (if using SSE)
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

2. **Build and run**

```bash
# Build image
docker build -t skyfi-mcp .

# Run locally
docker run -e SKYFI_API_KEY=your_key skyfi-mcp

# Or use docker-compose
```

3. **Create docker-compose.yml**

```yaml
version: '3.8'
services:
  skyfi-mcp:
    build: .
    environment:
      - SKYFI_API_KEY=${SKYFI_API_KEY}
    ports:
      - "3000:3000"
    restart: unless-stopped
```

**Pros:**
- ✅ Consistent environment
- ✅ Easy deployment
- ✅ Works anywhere

**Cons:**
- ❌ Docker knowledge required
- ❌ Overhead for simple MCP

---

## Current Deployment (EC2 Instance)

Based on your `deploy.sh`, you're currently using:

### Your Setup

```bash
#!/bin/bash
ssh -i "SkyFyMCP-MF.pem" ec2-user@ec2-54-166-96-63.compute-1.amazonaws.com << 'EOF'
  cd skyfi-mcp
  git pull origin master
  pnpm install
  pnpm build
  pm2 restart skyfi-mcp || pm2 start dist/index.js --name skyfi-mcp
EOF
```

**This is Option 3 (Hosted Server)** running on AWS EC2.

### Improvements for Your Current Setup

1. **Add environment variables**

```bash
# On EC2 instance, create .env file
cat > ~/skyfi-mcp/.env << 'ENVEOF'
SKYFI_API_KEY=your_key_here
NODE_ENV=production
PORT=3000
ENVEOF
```

2. **Use PM2 ecosystem file**

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'skyfi-mcp',
    script: 'dist/index.js',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '1G',
    instances: 1,
    autorestart: true
  }]
};

// Update deploy.sh to use it
pm2 startOrRestart ecosystem.config.js
```

3. **Add health checks**

```typescript
// Add to your server
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});
```

4. **Setup SSL with nginx**

```nginx
# /etc/nginx/sites-available/skyfi-mcp
server {
  listen 80;
  server_name mcp.yourdomain.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

---

## Recommended Deployment Strategy

**For your SkyFi MCP, I recommend:**

### Phase 1: NPM Package (Now)
- Publish to npm as `@yourname/skyfi-mcp`
- Easy for users to install
- No hosting costs
- Perfect for MCP use case

### Phase 2: Keep EC2 for Web App (Later)
- When you build the visual interface
- Use your existing EC2 deployment
- MCP and web app can share backend code

### Steps to Deploy as NPM Package

```bash
# 1. Update package.json (add bin field)
# 2. Add shebang to dist/index.js
#!/usr/bin/env node

# 3. Build
pnpm build

# 4. Test locally
npm link
# Test in .mcp.json with: "command": "skyfi-mcp"

# 5. Publish
npm login
npm publish --access public

# 6. Users install
npx -y @yourname/skyfi-mcp
```

---

## Environment Variables

All deployment options need these:

```bash
# Required
SKYFI_API_KEY=your_skyfi_api_key

# Optional
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

---

## Monitoring & Maintenance

### For NPM Package
- Monitor npm download stats
- GitHub issues for bug reports
- Release notes for updates

### For Hosted Server
- PM2 monitoring: `pm2 monit`
- Logs: `pm2 logs skyfi-mcp`
- Restart: `pm2 restart skyfi-mcp`
- EC2 CloudWatch for instance health

---

## Next Steps

1. **For MCP distribution:** Publish to npm
2. **For development:** Keep using local git clone
3. **For hosted API:** Improve your EC2 setup with above suggestions

Would you like me to help you set up npm publishing?
