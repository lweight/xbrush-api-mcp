/**
 * Voice tools: list_voices
 *
 * GET /v1/voice/list returns a large payload (each voice carries samples and
 * tuning metadata). We summarise to id/name/category/preview so the result fits
 * the response size limit and is useful for picking a tts voice_id.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListVoicesSchema } from "../schemas/voice.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET } from "../constants.js";
import type { XBrushVoiceListResponse } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function formatVoicesMarkdown(resp: XBrushVoiceListResponse): string {
  const provider = resp.data?.provider ?? resp.provider ?? "unknown";
  const model = resp.model ?? "default";
  const voices = resp.data?.voices ?? [];

  const lines: string[] = [];
  lines.push(`# Voices (provider: ${provider}, model: ${model}) — ${voices.length} listed`);
  lines.push("");

  if (voices.length === 0) {
    lines.push(
      "No voices returned. Try a different `model` (see xbrush_list_models with category='audio')."
    );
    return lines.join("\n");
  }

  for (const v of voices) {
    const parts = [`\`${v.voice_id}\``];
    if (v.name) parts.push(v.name);
    if (v.category) parts.push(v.category);
    let line = `- ${parts.join(" | ")}`;
    if (v.preview_url) line += ` | [preview](${v.preview_url})`;
    lines.push(line);
  }

  if (resp.data?.pagination?.has_more) {
    lines.push("");
    lines.push("More voices available (results are paginated by the server).");
  }

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerVoiceTools(server: McpServer): void {
  server.registerTool(
    "xbrush_list_voices",
    {
      title: "List Voices",
      description: [
        "List the voices available for text-to-speech, optionally for a specific model/provider.",
        "Use a returned voice_id as the `voice_id` argument to xbrush_tts_generate.",
        "",
        "Args:",
        "  model (string, optional): TTS model ID (e.g. speech-2.8-hd, eleven-v3). Omit for the default provider.",
      ].join("\n"),
      inputSchema: ListVoicesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.model !== undefined) params.model = args.model;

        const resp = await makeApiRequest<XBrushVoiceListResponse>({
          method: "GET",
          url: "/v1/voice/list",
          params,
          timeout: TIMEOUT_GET,
        });

        return buildToolResult(formatVoicesMarkdown(resp));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
