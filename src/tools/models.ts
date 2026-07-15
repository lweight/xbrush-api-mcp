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

function formatCreditValue(v: number | Record<string, number>): string {
  if (typeof v === "number") return String(v);
  // Nested config (e.g. { audio: 0.52, noAudio: 0.26 } or quality tiers).
  return Object.entries(v)
    .map(([k, n]) => `${k} ${n}`)
    .join("/");
}

function formatCredit(m: XBrushModel): string {
  const ci = m.creditInfo;
  if (ci.creditValue != null) return `${ci.creditValue} credits/${m.calType}`;
  if (ci.creditConfig) {
    return Object.entries(ci.creditConfig)
      .map(([k, v]) => `${k}=${formatCreditValue(v)}`)
      .join(", ");
  }
  return "—";
}

/**
 * Video i2v models carry a `constraints` object describing their duration
 * range in seconds ({min,max,step,default}); other categories omit it.
 */
function formatConstraints(m: XBrushModel): string {
  const c = m.constraints;
  if (!c || (c.min == null && c.max == null)) return "";
  const range = `${c.min ?? "?"}-${c.max ?? "?"}s`;
  const extras: string[] = [];
  if (c.step != null && c.step !== 1) extras.push(`step ${c.step}`);
  if (c.default != null) extras.push(`default ${c.default}`);
  return ` | duration ${range}${extras.length ? ` (${extras.join(", ")})` : ""}`;
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
      const vendor = m.vendor ? ` (${m.vendor})` : "";
      lines.push(
        `- **${m.id}** — ${m.name}${vendor} | ${m.featureType} | ${formatCredit(m)}${formatConstraints(m)}`
      );
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
        "Models span image (generate/edit/upscale/remove-bg/outpaint/moderate), video (i2v/upscale/lipsync/extend/retake/moderate), audio (tts/music/sound-effect), text (chat LLMs for xbrush_chat, priced per 1M tokens), and utility.",
        "Video i2v entries include their duration constraints (min-max seconds, step, default).",
        "Watermark has no dedicated model list — call it directly.",
        "",
        "Args:",
        "  category (string, optional): 'image', 'video', 'audio', 'text', or 'utility'.",
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
