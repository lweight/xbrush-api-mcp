/**
 * Model tools: list_models
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListModelsSchema } from "../schemas/models.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET } from "../constants.js";
import type { XBrushModelsResponse, XBrushModel } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function formatCredit(m: XBrushModel): string {
  const ci = m.creditInfo;
  if (ci.creditValue != null) return `${ci.creditValue} credits/${m.calType}`;
  if (ci.creditConfig) {
    return Object.entries(ci.creditConfig)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
  }
  return "—";
}

function formatModelsMarkdown(models: XBrushModel[]): string {
  const lines: string[] = [];

  const grouped: Record<string, XBrushModel[]> = {};
  for (const m of models) {
    const cat = m.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }

  lines.push(`# Models (${models.length} total)`);
  lines.push("");

  for (const [category, list] of Object.entries(grouped)) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} (${list.length})`);
    lines.push("");
    for (const m of list) {
      lines.push(`- **${m.id}** — ${m.name} | ${m.featureType} | ${formatCredit(m)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerModelTools(server: McpServer): void {
  server.registerTool(
    "xbrush_list_models",
    {
      title: "List Models",
      description: [
        "List available XBrush AI models with pricing info.",
        "Models include image generation/editing, video generation, and audio (TTS).",
        "",
        "Args:",
        "  category (string, optional): Filter by 'image', 'video', or 'audio'.",
      ].join("\n"),
      inputSchema: ListModelsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const response = await makeApiRequest<XBrushModelsResponse>({
          method: "GET",
          url: "/v1/models",
          timeout: TIMEOUT_GET,
        });

        let models = response.models;
        if (args.category) {
          models = models.filter((m) => m.category === args.category);
        }

        return buildToolResult(formatModelsMarkdown(models));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
