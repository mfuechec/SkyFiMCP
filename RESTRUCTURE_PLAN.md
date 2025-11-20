# Monorepo Structure Plan

## Target Structure

```
skyfi-mcp/
├── apps/
│   ├── frontend/          # React/Vue map interface
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── backend/           # Express API server
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── mcp/              # MCP server (current code)
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/           # Shared types/utils
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── .taskmaster/          # Task Master (stays at root)
├── .claude/              # Claude Code config
├── package.json          # Root workspace config
├── pnpm-workspace.yaml
└── README.md
```

## Migration Steps

1. Create workspace structure
2. Move current code to packages/mcp
3. Create apps/frontend skeleton
4. Create apps/backend skeleton  
5. Create packages/shared
6. Update root package.json
7. Update build scripts
