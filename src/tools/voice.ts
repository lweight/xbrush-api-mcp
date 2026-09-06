/**
 * Voice tools: list_voices (list or single-voice detail), voice_clone
 *
 * GET /v1/voice/list returns a large payload (each voice carries samples and
 * tuning metadata). We summarise to id/name/category/preview so the result fits
 * the response size limit and is useful for picking a tts voice_id.
 * GET /v1/voice/{voiceId} (2026-09) returns one voice's detail — exposed via the
 * `voice_id` argument of the same tool.
 *
 * POST /v1/voice/clone is SYNCHRONOUS — like chat, an exception to the
 * async-only rule: the server downloads the samples and calls the provider
 * inside the request and answers 202 with status "completed" (~6-10s,
 * verified 2026-09-06 on MiniMax and Seed). The result payload lives in the
 * request record (output.data.voice_id …), so the tool fetches it right away.
 * Failures are recorded (domain "voice", action "clone") and auto-refunded,
 * so gateway 504s are recoverable via xbrush_list_requests.
 *
 * DELETE /v1/voice/{voiceId} exists but answered VOICE_NOT_FOUND for voices
 * that GET returns (2026-09-06) — not exposed until it works.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListVoicesSchema, VoiceCloneSchema } from "../schemas/voice.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET, TIMEOUT_VOICE_CLONE } from "../constants.js";
import type {
  XBrushAsyncResponse,
  XBrushRequestDetail,
  XBrushVoiceDetail,
  XBrushVoiceListResponse,
} from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

/** Server enum for /v1/voice/list?model= — TTS model ids are mapped onto it. */
const VOICE_LIST_MODEL_ALIASES: Record<string, string> = {
  "eleven-v3": "eleven",
  elevenlabs: "eleven",
  "speech-2.8-turbo": "speech-2.8-hd",
  minimax: "speech-2.8-hd",
  "seed-tts-2.0": "seed-icl-2.0",
};

export function normalizeVoiceListModel(model: string): string {
  return VOICE_LIST_MODEL_ALIASES[model] ?? model;
}

function formatVoicesMarkdown(resp: XBrushVoiceListResponse): string {
  const provider = resp.data?.provider ?? resp.provider ?? "unknown";
  const model = resp.model ?? "default";
  const voices = resp.data?.voices ?? [];

  const lines: string[] = [];
  lines.push(`# Voices (provider: ${provider}, model: ${model}) — ${voices.length} listed`);
  lines.push("");

  if (voices.length === 0) {
    lines.push(
      resp.data?.note ??
        "No voices returned. Try a different `model` (eleven, speech-2.8-hd, speech-2.6-hd, seed-icl-2.0)."
    );
    if (provider === "byteplus") {
      lines.push("");
      lines.push(
        "Seed voices are only the ones you cloned (xbseed_* ids returned by xbrush_voice_clone; look them up with voice_id)."
      );
    }
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

export function formatVoiceDetail(v: XBrushVoiceDetail): string {
  const lines: string[] = [];
  lines.push(`# Voice \`${v.voiceId}\``);
  lines.push("");
  if (v.name) lines.push(`- **Name**: ${v.name}`);
  if (v.model) lines.push(`- **Model**: ${v.model} — use as \`model\` with this \`voice_id\` in xbrush_tts_generate`);
  if (v.provider) lines.push(`- **Provider**: ${v.provider}`);
  if (v.description) lines.push(`- **Description**: ${v.description}`);
  if (v.demoAudioUrl) lines.push(`- **Demo audio**: ${v.demoAudioUrl}`);
  if (v.status != null) lines.push(`- **Status**: ${v.status}`);
  if (v.retrainable != null) lines.push(`- **Retrainable**: ${v.retrainable ? "yes (xbrush_voice_clone with voice_id)" : "no"}`);
  if (v.createdAt) lines.push(`- **Created**: ${v.createdAt}`);
  return lines.join("\n");
}

/**
 * Clone success payload (record output, verified 2026-09-06):
 *   { success, data: { voice_id, name, provider, demo_audio_url, requires_verification,
 *     stored_audio_urls?, audio_hashes?, vendor_status?, available_training_times? } }
 * The submit response itself is a bare 202 envelope with status "completed".
 */
export function formatVoiceClone(
  submit: XBrushAsyncResponse,
  record: XBrushRequestDetail | null,
  name: string,
  model: string | undefined
): string {
  const out = (record?.output ?? {}) as Record<string, unknown>;
  const data = (out.data ?? out) as Record<string, unknown>;
  const voiceId = data.voice_id ?? data.voiceId ?? null;
  const provider = data.provider ?? null;
  const demo = data.demo_audio_url ?? data.demoAudioUrl ?? null;
  const trainingLeft = data.available_training_times;
  const credits = record?.credits?.charged ?? submit.creditCharged;

  const lines: string[] = [];
  lines.push(`# Voice clone — ${name}`);
  lines.push("");
  lines.push(`- **Status**: ${record?.status ?? submit.status}`);
  if (voiceId != null) {
    lines.push(
      `- **Voice ID**: \`${String(voiceId)}\` — use as \`voice_id\` in xbrush_tts_generate` +
        (model ? ` with model \`${model === "eleven" ? "eleven-v3" : model}\`` : "") +
        "."
    );
  } else if ((record?.status ?? submit.status) === "completed") {
    lines.push("- Clone completed but no voice id was found in the record — see the raw output below and xbrush_list_voices.");
  } else {
    lines.push(`- Clone is still ${record?.status ?? submit.status} — check xbrush_get_request (request_id \`${submit.requestId}\`).`);
  }
  if (provider) lines.push(`- **Provider**: ${String(provider)}`);
  if (demo) lines.push(`- **Demo audio**: ${String(demo)}`);
  if (trainingLeft != null) lines.push(`- **Remaining retrain runs**: ${String(trainingLeft)}`);
  lines.push(`- **Credits charged**: ${credits}`);
  lines.push(`- **Request ID**: \`${submit.requestId}\` (domain voice / action clone)`);
  if (record?.error) {
    lines.push("");
    lines.push(`Error: ${record.error.code} — ${record.error.message}`);
  }
  if (voiceId == null && record?.output) {
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(record.output, null, 2));
    lines.push("```");
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
        "List the voices available for text-to-speech for a provider, or fetch one voice's detail.",
        "Use a returned voice_id as the `voice_id` argument to xbrush_tts_generate (with the matching model).",
        "Providers: 'eleven' (ElevenLabs presets + clones; default), 'speech-2.8-hd' / 'speech-2.6-hd' (MiniMax — moss_audio_* clones),",
        "'seed-icl-2.0' (ByteDance — vendor listing unsupported; look clones up by voice_id).",
        "",
        "Args:",
        "  model (string, optional): eleven | speech-2.8-hd | speech-2.6-hd | seed-icl-2.0 (TTS ids like eleven-v3 / speech-2.8-turbo are mapped). Omit for the default provider.",
        "  voice_id (string, optional): Return detail for this voice instead (name, model, provider, demo audio, status).",
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
        if (args.voice_id !== undefined) {
          const detail = await makeApiRequest<XBrushVoiceDetail>({
            method: "GET",
            url: `/v1/voice/${encodeURIComponent(args.voice_id)}`,
            timeout: TIMEOUT_GET,
          });
          return buildToolResult(formatVoiceDetail(detail));
        }

        const params: Record<string, unknown> = {};
        if (args.model !== undefined) params.model = normalizeVoiceListModel(args.model);

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
        "SYNCHRONOUS — the server downloads the samples and calls the provider before answering (~6-10s;",
        "an unreachable audio URL fails immediately). COST: flat per attempt — 2 credits (eleven, speech-2.8-hd,",
        "speech-2.6-hd) or 2.6 credits (seed-icl-2.0); failed attempts are auto-refunded. On a 504 gateway timeout",
        "the request may still finish server-side — check xbrush_list_requests (domain 'voice', action 'clone').",
        "Returns the new voice_id (moss_audio_* for MiniMax, xbseed_* for Seed) plus a demo audio URL.",
        "",
        "Provider notes (measured 2026-09-06):",
        "- 'seed-icl-2.0' (ByteDance): fastest, retrainable (up to 15 runs via voice_id); the clone is used with model seed-icl-2.0.",
        "- 'speech-2.8-hd' / 'speech-2.6-hd' (MiniMax): rejects short samples ('voice duration too short') — provide ≥10s,",
        "  ideally 30s+ of clean single-speaker speech; used with the MiniMax speech-* models.",
        "- 'eleven' (ElevenLabs): platform-wide custom-voice slots can be exhausted ('maximum amount of custom voices') — then it fails and refunds.",
        "",
        "Args:",
        "  name (string, required): Display name for the cloned voice.",
        "  audio_urls (array, required): ≥1 sample audio URLs (upload local files via xbrush_file_upload; TTS output URLs work too).",
        "  model (string, optional): 'seed-icl-2.0' | 'speech-2.8-hd' | 'speech-2.6-hd' | 'eleven'. Omit for server default.",
        "  voice_id (string, optional): xbseed_* id to RETRAIN an existing Seed voice instead of creating a new one.",
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
        if (args.voice_id !== undefined) body.voiceId = args.voice_id;
        if (args.description !== undefined) body.description = args.description;
        if (args.remove_background_noise !== undefined)
          body.removeBackgroundNoise = args.remove_background_noise;

        const submit = await makeApiRequest<XBrushAsyncResponse>({
          method: "POST",
          url: "/v1/voice/clone",
          data: body,
          timeout: TIMEOUT_VOICE_CLONE,
        });

        // The voice id lives in the request record, not in the 202 envelope.
        let record: XBrushRequestDetail | null = null;
        if (submit?.requestId) {
          try {
            record = await makeApiRequest<XBrushRequestDetail>({
              method: "GET",
              url: `/v1/requests/${submit.requestId}`,
              timeout: TIMEOUT_GET,
            });
          } catch {
            record = null; // fall back to the envelope; the caller can poll manually
          }
        }
        return buildToolResult(formatVoiceClone(submit, record, args.name, args.model));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
