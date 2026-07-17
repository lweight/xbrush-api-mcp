/**
 * Voice tools: list_voices, voice_clone
 *
 * GET /v1/voice/list returns a large payload (each voice carries samples and
 * tuning metadata). We summarise to id/name/category/preview so the result fits
 * the response size limit and is useful for picking a tts voice_id.
 *
 * POST /v1/voice/clone (2026-07-17) is SYNCHRONOUS — like chat, an exception
 * to the async-only rule: the server downloads the samples and calls the
 * provider inside the request. Failures are recorded (domain "voice", action
 * "clone", flat 50 credits, auto-refunded), so gateway 504s are recoverable
 * via xbrush_list_requests.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListVoicesSchema, VoiceCloneSchema } from "../schemas/voice.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET, TIMEOUT_VOICE_CLONE } from "../constants.js";
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

/**
 * The clone success payload is provider-shaped and not pinned down by a spec,
 * so surface any recognizable voice id and echo the raw payload for the rest.
 */
export function formatVoiceClone(resp: unknown, name: string): string {
  const r = (resp ?? {}) as Record<string, unknown>;
  const data = (r.data ?? {}) as Record<string, unknown>;
  const voiceId = r.voice_id ?? r.voiceId ?? data.voice_id ?? data.voiceId ?? null;

  const lines: string[] = [];
  lines.push(`# Voice clone — ${name}`);
  lines.push("");
  if (voiceId != null) {
    lines.push(`- **Voice ID**: \`${String(voiceId)}\` — use as \`voice_id\` in xbrush_tts_generate.`);
  } else {
    lines.push(
      "- Clone submitted synchronously; the provider response is below. Look for the new voice in xbrush_list_voices."
    );
  }
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(resp, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(
    "_Recorded in xbrush_list_requests as domain \"voice\" / action \"clone\" (flat 50 credits; failed attempts auto-refund)._"
  );
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

  server.registerTool(
    "xbrush_voice_clone",
    {
      title: "Clone Voice",
      description: [
        "Clone a voice from audio samples for use with xbrush_tts_generate (voice_id).",
        "SYNCHRONOUS — the server downloads the samples and calls the provider before answering",
        "(an unreachable audio URL fails immediately). COSTS a flat 50 credits per attempt;",
        "failed attempts are auto-refunded. On a 504 gateway timeout the request may still finish",
        "server-side — check xbrush_list_requests (domain 'voice', action 'clone').",
        "",
        "Provider notes (measured 2026-07-17):",
        "- model 'eleven' (ElevenLabs): platform-wide custom-voice slots can be exhausted",
        "  ('maximum amount of custom voices (30/30)') — the request fails (and refunds) until slots free up.",
        "- model 'speech-2.8-hd' / 'speech-2.6-hd' (MiniMax): rejects short samples ('voice duration",
        "  too short') — provide ≥10s, ideally 30s+ of clean single-speaker speech.",
        "",
        "Args:",
        "  name (string, required): Display name for the cloned voice.",
        "  audio_urls (array, required): ≥1 sample audio URLs (upload local files via xbrush_file_upload).",
        "  model (string, optional): 'eleven' | 'speech-2.8-hd' | 'speech-2.6-hd'. Omit for server default.",
        "  description (string, optional): Stored with the voice.",
        "  remove_background_noise (bool, optional): Denoise samples before cloning.",
      ].join("\n"),
      inputSchema: VoiceCloneSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          name: args.name,
          audioUrls: args.audio_urls,
        };
        if (args.model !== undefined) body.model = args.model;
        if (args.description !== undefined) body.description = args.description;
        if (args.remove_background_noise !== undefined)
          body.removeBackgroundNoise = args.remove_background_noise;

        const resp = await makeApiRequest<unknown>({
          method: "POST",
          url: "/v1/voice/clone",
          data: body,
          timeout: TIMEOUT_VOICE_CLONE,
        });
        return buildToolResult(formatVoiceClone(resp, args.name));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
