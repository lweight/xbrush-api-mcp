/**
 * Selective tool disable via XBRUSH_DISABLED_TOOLS environment variable.
 *
 * Set XBRUSH_DISABLED_TOOLS to a comma-separated list of tool names; after
 * registration each matching tool is disabled through the MCP SDK's built-in
 * RegisteredTool.disable() method. This leaves SDK internals untouched —
 * tools/list hides disabled tools automatically.
 *
 *   XBRUSH_DISABLED_TOOLS="xbrush_tts_generate,xbrush_music_generate"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type RegisteredTool = {
  enabled?: boolean;
  disable?: () => void;
};

export function parseDisabledTools(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Wraps `server.registerTool` so that every registration is captured, and
 * right after the real register call the tool is `.disable()`d if its name
 * appears in `disabled`. Returns a function to run after all registration
 * finishes — it warns on entries in the env var that never matched a
 * registered tool (likely typos).
 */
export function applyDisableFilter(
  server: McpServer,
  disabled: Set<string>
): () => void {
  if (disabled.size === 0) return () => {};

  const matched = new Set<string>();
  const original = server.registerTool.bind(server);

  (server as unknown as { registerTool: McpServer["registerTool"] }).registerTool = ((
    name: string,
    ...rest: unknown[]
  ) => {
    const tool = (original as (...args: unknown[]) => RegisteredTool)(name, ...rest);
    if (disabled.has(name)) {
      matched.add(name);
      if (typeof tool?.disable === "function") {
        tool.disable();
      }
      console.error(
        `[xbrush-mcp] Tool disabled via XBRUSH_DISABLED_TOOLS: ${name}`
      );
    }
    return tool as ReturnType<McpServer["registerTool"]>;
  }) as McpServer["registerTool"];

  return () => {
    for (const name of disabled) {
      if (!matched.has(name)) {
        console.error(
          `[xbrush-mcp] XBRUSH_DISABLED_TOOLS entry did not match any tool: ${name}`
        );
      }
    }
  };
}
