#!/usr/bin/env node

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { registerAppleTools } from "./tools/apple.js";
import { registerGoogleTools } from "./tools/google.js";

// Read at runtime (package.json sits next to dist/, also in the Docker image) so the advertised version can't drift.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

function createServer(): McpServer {
  const server = new McpServer({
    name: "app-store-scraper-mcp-server",
    version,
  });
  registerAppleTools(server);
  registerGoogleTools(server);
  return server;
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Scraper MCP server running on stdio");
}

async function runHttp() {
  // Localhost bind by default: createMcpExpressApp then rejects non-localhost Host/Origin (DNS rebinding).
  // Docker sets HOST=0.0.0.0; add ALLOWED_HOSTS if it ever sits behind a public hostname.
  const host = process.env.HOST || "127.0.0.1";
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, allowedHosts });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Stateless server: no SSE stream (GET) and no session to terminate (DELETE).
  app.all("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({ error: "Method not allowed. Use POST for MCP requests." });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  // Express 5 hands listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
  app.listen(port, host, (error?: Error) => {
    if (error) {
      console.error("Server error:", error);
      process.exit(1);
    }
    console.error(`App Store Scraper MCP server running on http://${host}:${port}/mcp`);
  });
}

const transport = process.argv.includes("--http") || process.env.TRANSPORT === "http"
  ? "http"
  : "stdio";

(transport === "http" ? runHttp() : runStdio()).catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
