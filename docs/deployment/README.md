# SkyFi MCP Deployment Guide

How to deploy and configure the SkyFi MCP server.

## Prerequisites

- Node.js 20 or higher
- pnpm (recommended) or npm
- SkyFi API key

## Installation

### From Source

```bash
# Clone repository
git clone https://github.com/your-org/SkyFiMCP.git
cd SkyFiMCP

# Install dependencies
pnpm install

# Build
pnpm build
```

### From npm

```bash
npm install -g skyfi-mcp
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required
SKYFI_API_KEY=your-skyfi-api-key

# Optional
SKYFI_BASE_URL=https://api.skyfi.com/v1
SKYFI_TIMEOUT=30000
SKYFI_RETRY_ATTEMPTS=3
LOG_LEVEL=info
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| SKYFI_API_KEY | - | Your SkyFi API key (required) |
| SKYFI_BASE_URL | https://api.skyfi.com/v1 | API base URL |
| SKYFI_TIMEOUT | 30000 | Request timeout in ms |
| SKYFI_RETRY_ATTEMPTS | 3 | Number of retry attempts |
| LOG_LEVEL | info | Log level (debug, info, warn, error) |

## Running the Server

### Development Mode

```bash
pnpm dev
```

Runs with hot-reload for development.

### Production Mode

```bash
pnpm build
pnpm start
```

Or directly:

```bash
node dist/index.js
```

### With npx

```bash
npx skyfi-mcp
```

## MCP Transport

The server uses stdio transport by default, communicating via stdin/stdout. This is the standard for MCP servers.

### Custom Transport

To use a different transport (e.g., HTTP), modify `src/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HttpServerTransport } from '@modelcontextprotocol/sdk/server/http.js';

const transport = new HttpServerTransport({ port: 3000 });
await server.connect(transport);
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

CMD ["node", "dist/index.js"]
```

### Build and Run

```bash
docker build -t skyfi-mcp .
docker run -e SKYFI_API_KEY=your-key skyfi-mcp
```

### Docker Compose

```yaml
version: '3.8'
services:
  skyfi-mcp:
    build: .
    environment:
      - SKYFI_API_KEY=${SKYFI_API_KEY}
    restart: unless-stopped
```

## Cloud Deployment

### AWS Lambda

1. Package the application:
```bash
pnpm build
zip -r function.zip dist node_modules package.json
```

2. Create Lambda function with Node.js 20 runtime
3. Set environment variables
4. Configure API Gateway for HTTP transport

### Google Cloud Run

```bash
gcloud run deploy skyfi-mcp \
  --source . \
  --set-env-vars SKYFI_API_KEY=your-key \
  --allow-unauthenticated
```

### Heroku

```bash
heroku create skyfi-mcp
heroku config:set SKYFI_API_KEY=your-key
git push heroku main
```

## Security Considerations

### API Key Protection

- Never commit API keys to version control
- Use environment variables or secret management
- Rotate keys regularly
- Use separate keys for dev/staging/production

### Network Security

- Use HTTPS for all external communications
- Implement rate limiting
- Validate webhook signatures
- Sanitize user inputs

### Authentication

The server authenticates with SkyFi using API keys. For multi-tenant deployments, consider:

- Per-user API key management
- Token-based authentication
- OAuth integration

## Monitoring

### Health Checks

Use the `ping` tool to verify server health:

```json
{"tool": "ping"}
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00Z",
  "version": "0.1.0"
}
```

### Logging

Set `LOG_LEVEL=debug` for detailed logging during troubleshooting.

Log output includes:
- Tool invocations
- API requests/responses
- Errors and stack traces

### Metrics

For production monitoring, consider integrating:
- Prometheus metrics
- DataDog APM
- New Relic

## Troubleshooting

### Common Issues

#### "Invalid API key" Error

**Cause:** API key is missing, invalid, or expired.

**Solution:**
1. Verify `SKYFI_API_KEY` is set correctly
2. Check for extra whitespace or quotes
3. Generate a new key from SkyFi dashboard

#### "Connection refused" Error

**Cause:** Cannot reach SkyFi API.

**Solution:**
1. Check internet connectivity
2. Verify `SKYFI_BASE_URL` is correct
3. Check for firewall/proxy issues

#### "Rate limit exceeded" Error

**Cause:** Too many API requests.

**Solution:**
1. Implement exponential backoff
2. Reduce request frequency
3. Contact SkyFi for higher limits

#### Tools Not Appearing in Claude

**Cause:** MCP server not properly configured.

**Solution:**
1. Verify `claude_desktop_config.json` syntax
2. Check file paths are absolute
3. Restart Claude Desktop
4. Check server logs for errors

#### Timeout Errors

**Cause:** API requests taking too long.

**Solution:**
1. Increase `SKYFI_TIMEOUT`
2. Check network latency
3. Reduce request complexity

#### "ENOENT" or "Command not found"

**Cause:** Node.js or script path incorrect.

**Solution:**
1. Verify Node.js is installed: `node --version`
2. Use absolute paths in configuration
3. Check file permissions

### Debug Mode

Run with debug logging:

```bash
LOG_LEVEL=debug node dist/index.js
```

### Testing Connection

Test the SkyFi API directly:

```bash
curl -H "Authorization: Bearer $SKYFI_API_KEY" \
  https://api.skyfi.com/v1/health
```

### Getting Help

- Check [GitHub Issues](https://github.com/your-org/SkyFiMCP/issues)
- Join the Discord community
- Contact SkyFi support

## Updates

### Updating from npm

```bash
npm update -g skyfi-mcp
```

### Updating from Source

```bash
git pull origin main
pnpm install
pnpm build
```

### Changelog

See [CHANGELOG.md](../../CHANGELOG.md) for version history.

## Backup and Recovery

### Configuration Backup

Back up your configuration files:
- `.env`
- `claude_desktop_config.json`
- `.mcp.json`

### Data Recovery

The MCP server is stateless. All data is stored by SkyFi. To recover:
1. Reinstall the server
2. Restore configuration
3. Reconnect with same API key
