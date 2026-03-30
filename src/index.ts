#!/usr/bin/env node

/**
 * XBrush MCP Server
 *
 * MCP server for the XBrush AI media generation API.
 * Provides tools for image generation/editing, model listing,
 * request tracking, and file upload.
 *
 * Transport: stdio (local use with Claude Code)
 * Auth: XBRUSH_API_KEY environment variable (X-API-Key header)
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerImageTools } from "./tools/image.js";
import { registerRequestTools } from "./tools/requests.js";
import { registerModelTools } from "./tools/models.js";
import { registerFileUploadTools } from "./tools/file-upload.js";

// ── Read version from package.json ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf-8")
);

// ── Server Initialization ─────────────────────────────────────────────

const server = new McpServer(
  {
    name: pkg.name,
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Register All Tools ────────────────────────────────────────────────

registerImageTools(server); // 4 tools: generate, edit, upscale, remove_bg
registerRequestTools(server); // 3 tools: get_request, list_requests, check_health
registerModelTools(server); // 1 tool:  list_models
registerFileUploadTools(server); // 1 tool:  file_upload

// ── Start Server ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("XBrush MCP server started (stdio transport)");
}

main().catch((error) => {
  console.error("Failed to start XBrush MCP server:", error);
  process.exit(1);
});
