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

function formatCreditValue(v: number | boolean | Record<string, number>): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Nested config (e.g. { audio: 0.52, noAudio: 0.26 } or quality tiers).
  return Object.entries(v)
    .map(([k, n]) => `${k} ${n}`)
    .join("/");
}

function formatCredit(m: XBrushModel): string {
  const ci = m.creditInfo;
  const parts: string[] = [];
  if (ci.creditValue != null) parts.push(`${ci.creditValue} credits/${m.calType}`);
  if (ci.creditConfig) {
    parts.push(
      Object.entries(ci.creditConfig)
        .map(([k, v]) => `${k}=${formatCreditValue(v)}`)
        .join(", ")
    );
  }
  return parts.length ? parts.join(" | ") : "—";
}

/**
 * `constraints` differ by family: video i2v/extend/retake carry a duration
 * range ({min,max,step,default}); text chat models carry capability flags
 * (vision, functionCalling, structuredOutputHonored, …) and per-parameter
 * quirks (samplingHonored, penaltiesHonored, stopHonored, reasoning*);
 * image/video models may carry defaultResolution; STT carries input limits.
 */
function formatConstraints(m: XBrushModel): string {
  const c = m.constraints;
  if (!c) return "";
  const parts: string[] = [];
  if (c.min != null || c.max != null) {
    const extras: string[] = [];
    if (c.step != null && c.step !== 1) extras.push(`step ${c.step}`);
    if (c.default != null) extras.push(`default ${c.default}`);
    parts.push(
      `duration ${c.min ?? "?"}-${c.max ?? "?"}s${extras.length ? ` (${extras.join(", ")})` : ""}`
    );
  }
  if (c.defaultResolution) parts.push(`default ${c.defaultResolution}`);
  if (c.vision === true) {
    const extras: string[] = [];
    if (c.maxImages != null) extras.push(`max ${c.maxImages} images`);
    if (c.tokensPerImage != null) extras.push(`~${c.tokensPerImage} tokens/image`);
    if (c.imageDetailHonored === true) extras.push("detail honored");
    parts.push(`vision${extras.length ? ` (${extras.join(", ")})` : ""}`);
  } else if (c.vision === false) {
    parts.push("text-only");
  }
  if (c.functionCalling === true) {
    const extras: string[] = [];
    if (c.toolsFixedTokens != null) extras.push(`~${c.toolsFixedTokens} fixed tokens/request`);
    if (c.forcedChoiceHonored != null) {
      extras.push(c.forcedChoiceHonored ? "forced choice honored" : "forced choice NOT honored");
    }
    if (c.toolsRequireReasoningNone === true) extras.push("tools force reasoning none");
    parts.push(`function calling${extras.length ? ` (${extras.join(", ")})` : ""}`);
  } else if (c.functionCalling === false) {
    parts.push("no function calling");
  }
  if (c.structuredOutputHonored === true) parts.push("structured output (response_format)");
  if (c.samplingHonored === false) parts.push("temperature/top_p ignored");
  if (c.penaltiesHonored === false) parts.push("penalties ignored");
  if (c.stopHonored === false) parts.push("stop ignored");
  if (c.reasoningUnsupported === true) parts.push("no reasoning");
  if (c.reasoningMaxClampsToHigh === true) parts.push("reasoning max→high");
  if (c.reasoningMinimalMapsToLow === true) parts.push("reasoning minimal→low");
  if (c.reasoningNoneMapsToMinimal === true) parts.push("reasoning none→minimal");
  if (c.reasoningMidTiersPromoteToHigh === true) parts.push("reasoning low/medium→high");
  if (c.maxDuration != null) parts.push(`max ${c.maxDuration}s`);
  if (c.inputFormats?.length) parts.push(`input ${c.inputFormats.join("/")}`);
  if (c.maxAudioBytes != null) parts.push(`max ${(c.maxAudioBytes / 1024 / 1024).toFixed(0)} MB`);
  return parts.length ? ` | ${parts.join(" | ")}` : "";
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
        "List available XBrush AI models with pricing info (128 entries as of 2026-09).",
        "Categories → featureType: image (generate/edit/outpaint/upscale/remove_bg/moderate/lora_train/layer_split),",
        "video (i2v/extend/retake/upscale/lipsync/moderate/video_edit), audio (tts/tts-wt/music/soundeffect/soundeffect-text/",
        "voice_clone/stt/lipsync), text (chat LLMs for xbrush_chat, priced per 1M tokens), utility (ffmpeg/image-process/",
        "image_vision/video_vision/segment_detect/product_lookup — the media & analysis tools).",
        "Video entries include duration constraints (min-max seconds, step, default) and per-resolution prices;",
        "text entries flag vision, function calling (fixed token overhead, forced tool_choice honored?), structured output,",
        "and which sampling params are ignored/adjusted per model.",
        "Watermark and inpaint have no dedicated model list — call the tools directly.",
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
