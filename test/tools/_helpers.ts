/**
 * Shared test helpers for tool handler tests.
 * Creates a mock McpServer that captures registered handlers.
 */
import { vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface MockServerResult {
  server: McpServer;
  handlers: Map<string, Function>;
  configs: Map<string, unknown>;
}

export function createMockServer(): MockServerResult {
  const handlers = new Map<string, Function>();
  const configs = new Map<string, unknown>();

  const server = {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      handlers.set(name, handler);
      configs.set(name, config);
    }),
  } as unknown as McpServer;

  return { server, handlers, configs };
}
