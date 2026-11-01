# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # TypeScript compilation (tsc)
npm run dev            # Watch mode with tsx
npm start              # Run compiled server (stdio transport)
node dist/index.js --http   # Run as HTTP server on 127.0.0.1:3000
PORT=8080 node dist/index.js --http  # Custom port
HOST=0.0.0.0 node dist/index.js --http  # Expose on the network (drops localhost-only Host/Origin check; ALLOWED_HOSTS=a,b re-adds one)
```

Docker:
```bash
docker build -t app-store-scraper-mcp .
docker run --init -p 3000:3000 app-store-scraper-mcp
```

## Architecture

This is an MCP (Model Context Protocol) server that wraps two app store scraper libraries into 22 tools (11 Apple, 11 Google) accessible via stdio or Streamable HTTP transport.

**Entry point** (`src/index.ts`): Creates the `McpServer`, registers all tools, and selects transport based on `--http` flag or `TRANSPORT` env var. Stdio is default; HTTP mode uses `createMcpExpressApp()` (`@modelcontextprotocol/express`, DNS rebinding protection) with a stateless `NodeStreamableHTTPServerTransport` on `/mcp`, one `McpServer` per request.

**Tool files** (`src/tools/apple.ts`, `src/tools/google.ts`): Each exports a `register*Tools(server)` function that calls `server.registerTool()` for every scraper method. Both import the scraper packages directly and use their bundled types.

**Shared helpers** (`src/utils.ts`): `jsonResult()` (compact JSON text result), `keysOf()` (constant-table keys as a `z.enum` tuple), `READ_ONLY` (tool annotations).

## Key Patterns

- **Tool registration**: Every tool uses `inputSchema: z.object({...})` (Zod v4; MCP SDK v2 takes Standard Schema objects), `annotations: READ_ONLY`, and a handler returning `jsonResult()`. Handlers just throw on failure: `McpServer` turns the error into an `isError` result. Zod-parsed params are passed straight to the scraper when the names match.
- **Enum constants**: Scraper library constants (collection, sort, category, age) are exposed by key name (e.g. `"TOP_FREE_IOS"`) via `z.enum(keysOf(table))`, so Zod rejects bad values and the JSON schema lists the valid ones; handlers then index the table (`collection[params.collection]`).
- **Scraper imports**: `app-store-scraper-ts` is CommonJS (named exports work from ESM); `google-play-scraper-ts` ships ESM. Both bundle their own types, so the compiler catches API drift on upgrade.

## Adding a New Tool

1. Register with `server.registerTool()` following the existing pattern: `z.object()` schema, `annotations: READ_ONLY`, async handler returning `jsonResult()`
2. Expose enum parameters with `z.enum(keysOf(table))` and map them with `table[key]`
3. Rebuild with `npm run build`

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
