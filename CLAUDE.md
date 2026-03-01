# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # TypeScript compilation (tsc)
npm run dev            # Watch mode with tsx
npm start              # Run compiled server (stdio transport)
node dist/index.js --http   # Run as HTTP server on port 3000
PORT=8080 node dist/index.js --http  # Custom port
```

Docker:
```bash
docker build -t app-store-scraper-mcp .
docker run -p 3000:3000 app-store-scraper-mcp
```

## Architecture

This is an MCP (Model Context Protocol) server that wraps two app store scraper libraries into 21 tools (10 Apple, 11 Google) accessible via stdio or Streamable HTTP transport.

**Entry point** (`src/index.ts`): Creates the `McpServer`, registers all tools, and selects transport based on `--http` flag or `TRANSPORT` env var. Stdio is default; HTTP mode uses Express with stateless `StreamableHTTPServerTransport` on `/mcp`.

**Tool files** (`src/tools/apple.ts`, `src/tools/google.ts`): Each exports a `register*Tools(server)` function that calls `server.registerTool()` for every scraper method. Both use `createRequire(import.meta.url)` to load the CJS scraper packages in our ESM context.

**Shared helpers** (`src/utils.ts`): `jsonResult()`, `errorResult()`, `formatError()` — standardized MCP response wrappers used by all 21 tools.

## Key Patterns

- **Tool registration**: Every tool uses `inputSchema: z.object({...})` (Zod v3, wrapped — required by MCP SDK v2), annotations marking all tools as read-only/idempotent, and a try/catch handler returning `jsonResult()` or `errorResult()`.
- **Enum constants**: Scraper library constants (collection, sort, category, age) are exposed by key name (e.g. `"TOP_FREE_IOS"`) and mapped to internal values via `lookup*()` helpers that throw descriptive errors listing all valid values.
- **CJS interop**: Both `app-store-scraper-ts` and `google-play-scraper-ts` are CommonJS packages. They are loaded via `createRequire()` with manually defined TypeScript interfaces (`AppleStore`, `GooglePlayApi`, `GoogleConstants`).

## Adding a New Tool

1. Add the method to the interface in the relevant tool file
2. Register with `server.registerTool()` following the existing pattern: `z.object()` schema, annotations, async handler with try/catch
3. Map any enum parameters through a `lookup*()` function
4. Rebuild with `npm run build`

## Testing

No test framework. Smoke test via stdio:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | node dist/index.js 2>/dev/null
```

HTTP test (requires `Accept: application/json, text/event-stream` header):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```
