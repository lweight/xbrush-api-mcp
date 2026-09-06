/**
 * Request tools: get_request, list_requests, check_health
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetRequestSchema,
  ListRequestsSchema,
  CheckHealthSchema,
} from "../schemas/requests.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET } from "../constants.js";
import type {
  XBrushOutput,
  XBrushRequestDetail,
  XBrushRequestListResponse,
  XBrushHealthResponse,
} from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

const MAX_OUTPUT_JSON = 6000;

function compactJson(value: unknown, limit = MAX_OUTPUT_JSON): string {
  const s = JSON.stringify(value, null, 2);
  return s.length > limit ? `${s.slice(0, limit)}\n… (${s.length - limit} more chars — full payload in the API record)` : s;
}

function fmtSeconds(n: number | undefined): string {
  return n == null ? "" : `${Number(n.toFixed(2))}s`;
}

/**
 * Renders the typed part of every known output shape and then dumps whatever
 * keys are left as compact JSON, so new endpoints never lose information.
 */
export function formatOutput(out: XBrushOutput): string[] {
  const lines: string[] = [];
  const consumed = new Set<string>();
  const take = (...keys: string[]) => keys.forEach((k) => consumed.add(k));

  // Images (generate/edit/outpaint/inpaint/enhance/upscale/remove-bg/layer-split/media image)
  if (out.imageUrls?.length) {
    take("imageUrls", "imageDimensions", "seedOrder", "layers");
    out.imageUrls.forEach((url, i) => {
      const dim = out.imageDimensions?.[i];
      const layer = out.layers?.[i];
      const size = dim?.width && dim?.height ? ` (${dim.width}×${dim.height})` : "";
      const name = layer?.name ? ` — layer "${layer.name}" z${layer.zIndex ?? i}` : "";
      lines.push(`- Image ${i + 1}${size}${name}: ${url}`);
      if (layer?.boundingBox?.absolute) lines.push(`  - bbox [x0,y0,x1,y1]: ${layer.boundingBox.absolute.join(", ")}`);
      if (layer?.description) lines.push(`  - ${layer.description}`);
    });
  }

  // Video (generate/edit/extend/retake/upscale/lip-sync/media ffmpeg/graph)
  const videoUrl = out.videoUrl ?? (typeof out.processedVideoUrl === "string" ? out.processedVideoUrl : undefined);
  if (videoUrl) {
    take("videoUrl", "processedVideoUrl", "width", "height", "fps", "duration", "durationSeconds", "sizeBytes", "fileSize", "format", "thumbnailUrl", "thumbnailWidth", "thumbnailHeight", "nsfwDetected");
    const meta: string[] = [];
    if (out.width && out.height) meta.push(`${out.width}×${out.height}`);
    if (out.fps) meta.push(`${out.fps} fps`);
    const dur = out.durationSeconds ?? out.duration;
    if (dur != null) meta.push(fmtSeconds(dur));
    const size = out.sizeBytes ?? out.fileSize;
    if (size) meta.push(`${(size / 1024 / 1024).toFixed(2)} MB`);
    if (out.format) meta.push(out.format);
    lines.push(`- Video${meta.length ? ` (${meta.join(", ")})` : ""}: ${videoUrl}`);
    if (out.thumbnailUrl) lines.push(`- Thumbnail: ${out.thumbnailUrl}`);
    if (out.nsfwDetected) lines.push(`- NSFW detected: yes ⚠️`);
  } else if (out.imageUrls?.length && (out.width || out.format || out.sizeBytes)) {
    // media/image job metadata accompanying imageUrls
    take("width", "height", "format", "sizeBytes");
  }

  // Audio (tts/tts-wt/music/sound-effect)
  if (out.audioUrl) {
    take("audioUrl", "duration", "voiceId", "model", "alignment", "normalizedAlignment");
    const meta: string[] = [];
    if (out.duration != null) meta.push(fmtSeconds(out.duration));
    if (out.model) meta.push(String(out.model));
    if (out.voiceId) meta.push(`voice ${out.voiceId}`);
    lines.push(`- Audio${meta.length ? ` (${meta.join(", ")})` : ""}: ${out.audioUrl}`);
    const al = out.alignment;
    if (al?.characters?.length && al.character_start_times_seconds && al.character_end_times_seconds) {
      const n = al.characters.length;
      lines.push(`- Character alignment: ${n} characters, ${al.character_start_times_seconds[0]}s → ${al.character_end_times_seconds[n - 1]}s`);
      lines.push("```json");
      lines.push(compactJson(al, 4000));
      lines.push("```");
    }
  }

  // STT
  if (typeof out.text === "string" && !out.transcript) {
    take("text", "language", "duration", "model");
    const meta: string[] = [];
    if (out.language) meta.push(String(out.language));
    if (out.duration != null) meta.push(fmtSeconds(out.duration));
    if (out.model) meta.push(String(out.model));
    lines.push(`- Transcript${meta.length ? ` (${meta.join(", ")})` : ""}:`);
    lines.push("");
    lines.push(out.text || "_(empty)_");
    lines.push("");
  }

  // Video vision
  if (out.transcript && typeof out.transcript === "object") {
    take("transcript", "fullText", "frames", "analyzedFrames", "durationSec", "frameWidth", "frameHeight", "model");
    const t = out.transcript;
    const meta: string[] = [];
    if (t.language) meta.push(t.language);
    if (t.duration != null) meta.push(fmtSeconds(t.duration));
    lines.push(`- Speech transcript${meta.length ? ` (${meta.join(", ")})` : ""}: ${t.text ? t.text : "_(no speech)_"}`);
    for (const s of t.segments ?? []) {
      lines.push(`  - [${fmtSeconds(s.start)} → ${fmtSeconds(s.end)}] ${s.text ?? ""}`);
    }
    lines.push(`- On-screen text: ${out.fullText && out.fullText.trim() ? out.fullText : "_(none)_"}${out.analyzedFrames != null ? ` (${out.analyzedFrames} frames analyzed)` : ""}`);
  }

  // Moderation
  if (typeof out.flagged === "boolean") {
    take("flagged", "overallScore", "regionsMasked", "processedImageUrl");
    lines.push(`- Flagged: ${out.flagged ? "yes ⚠️" : "no"}`);
    if (typeof out.overallScore === "number") lines.push(`- Moderation score: ${out.overallScore}`);
    if (typeof out.regionsMasked === "number") lines.push(`- Regions masked: ${out.regionsMasked}`);
    if (out.processedImageUrl) lines.push(`- Masked image: ${out.processedImageUrl}`);
  }

  // Chat completions (domain text/action chat) — recover the text, e.g.
  // after a gateway 504 cut the synchronous xbrush_chat response.
  if (Array.isArray(out.choices) && out.choices.length > 0) {
    take("choices", "id", "object", "created", "model", "usage", "system_fingerprint", "service_tier", "warnings");
    const choice = out.choices[0];
    const content = choice?.message?.content;
    lines.push(`- Chat completion${choice?.finish_reason ? ` (finish: ${choice.finish_reason})` : ""}:`);
    lines.push("");
    lines.push(content ? content : "_(no content)_");
    if (choice?.message?.tool_calls?.length) {
      lines.push("");
      lines.push("```json");
      lines.push(compactJson(choice.message.tool_calls));
      lines.push("```");
    }
  }

  // Voice clone record
  const data = out.data;
  if (data && typeof data === "object" && ("voice_id" in data || "voiceId" in data)) {
    take("data", "success");
    lines.push(`- Voice ID: \`${String(data.voice_id ?? data.voiceId)}\`${data.provider ? ` (${String(data.provider)})` : ""}`);
    if (data.demo_audio_url) lines.push(`- Demo audio: ${String(data.demo_audio_url)}`);
  }

  if (out.url && !consumed.has("url")) {
    take("url");
    lines.push(`- URL: ${out.url}`);
  }

  const rest = Object.fromEntries(Object.entries(out).filter(([k]) => !consumed.has(k)));
  if (Object.keys(rest).length > 0) {
    lines.push(lines.length ? "- Other output fields:" : "- Output:");
    lines.push("```json");
    lines.push(compactJson(rest));
    lines.push("```");
  }
  return lines;
}

export function formatRequestDetail(r: XBrushRequestDetail): string {
  const lines: string[] = [];
  lines.push(`## Request ${r.requestId}`);
  lines.push("");
  lines.push(`- **Status**: ${r.status}`);
  lines.push(`- **Domain**: ${r.domain}`);
  lines.push(`- **Action**: ${r.action}`);
  if (r.credits && (r.credits.charged != null || r.credits.refunded != null)) {
    const refunded = r.credits.refunded ? ` (refunded ${r.credits.refunded})` : "";
    lines.push(`- **Credits charged**: ${r.credits.charged ?? r.creditCharged}${refunded}`);
  } else {
    lines.push(`- **Credits charged**: ${r.creditCharged}`);
  }
  if (r.createdAt) lines.push(`- **Created**: ${r.createdAt}`);
  if (r.completedAt) lines.push(`- **Completed**: ${r.completedAt}`);
  if (r.duration != null) lines.push(`- **Duration**: ${r.duration}s`);

  if (r.status === "completed" && r.output) {
    lines.push("");
    lines.push("### Output");
    lines.push(...formatOutput(r.output));
  } else if (r.status === "pending" || r.status === "processing") {
    lines.push("");
    lines.push("_Still running — poll again in a few seconds._");
  }

  if ((r.status === "failed" || r.status === "timeout" || r.status === "aborted") && r.error) {
    lines.push("");
    lines.push("### Error");
    lines.push(`- **Code**: ${r.error.code}`);
    lines.push(`- **Message**: ${r.error.message}`);
    if (r.credits?.refunded) lines.push(`- **Refunded**: ${r.credits.refunded} credits`);
  }

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerRequestTools(server: McpServer): void {
  // ── xbrush_get_request ──────────────────────────────────────────────

  server.registerTool(
    "xbrush_get_request",
    {
      title: "Get Request",
      description: [
        "Get the status and result of an XBrush API request.",
        "Use this to check the result of async operations (image/video/audio generation, media jobs, STT, LoRA training, …)",
        "and to recover synchronous results after a gateway timeout (chat, voice clone).",
        "Statuses: pending, processing, completed, failed, timeout, aborted. Failed/timeout requests are auto-refunded.",
        "",
        "Args:",
        "  request_id (string, required): Request ID starting with 'req'.",
      ].join("\n"),
      inputSchema: GetRequestSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const detail = await makeApiRequest<XBrushRequestDetail>({
          method: "GET",
          url: `/v1/requests/${args.request_id}`,
          timeout: TIMEOUT_GET,
        });
        return buildToolResult(formatRequestDetail(detail));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_list_requests ────────────────────────────────────────────

  server.registerTool(
    "xbrush_list_requests",
    {
      title: "List Requests",
      description: [
        "List recent XBrush API requests (newest first) with status, domain/action and credits, optionally filtered.",
        "",
        "Args:",
        "  limit (int, optional): Number of requests (1-100). Default: 20.",
        "  cursor (string, optional): Pagination cursor from previous response.",
        "  domain (string, optional): image | video | tts | tts-wt | music | sound-effect | stt | voice | lora | text | media.",
        "  action (string, optional): e.g. generate, edit, outpaint, inpaint, upscale, chat, clone, train, transcribe, video_edit, video_vision, ffmpeg, image, graph.",
        "  status (string, optional): pending | processing | completed | failed | timeout | aborted.",
      ].join("\n"),
      inputSchema: ListRequestsSchema,
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
        if (args.limit !== undefined) params.limit = args.limit;
        if (args.cursor !== undefined) params.cursor = args.cursor;
        if (args.domain !== undefined) params.domain = args.domain;
        if (args.action !== undefined) params.action = args.action;
        if (args.status !== undefined) params.status = String(args.status).toUpperCase();

        const response = await makeApiRequest<XBrushRequestListResponse>({
          method: "GET",
          url: "/v1/requests",
          params,
          timeout: TIMEOUT_GET,
        });

        const lines: string[] = [];
        lines.push(`# Requests (${response.data.length})`);
        if (response.hasMore) lines.push("More results available — use the cursor to paginate.");
        lines.push("");

        for (const r of response.data) {
          const status = String(r.status).toUpperCase();
          const credit = r.credits?.charged ?? r.creditCharged;
          const refunded = r.credits?.refunded ? ` (refunded ${r.credits.refunded})` : "";
          const when = r.createdAt ? ` | ${r.createdAt}` : "";
          lines.push(`- \`${r.requestId}\` | ${status} | ${r.domain}/${r.action} | credit: ${credit}${refunded}${when}`);
        }

        if (response.nextCursor) {
          lines.push("");
          lines.push(`**Next cursor**: \`${response.nextCursor}\``);
        }

        return buildToolResult(lines.join("\n"));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_check_health ─────────────────────────────────────────────

  server.registerTool(
    "xbrush_check_health",
    {
      title: "Check Health",
      description: "Check XBrush API server health status.",
      inputSchema: CheckHealthSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const health = await makeApiRequest<XBrushHealthResponse>({
          method: "GET",
          url: "/v1/health",
          timeout: TIMEOUT_GET,
        });
        return buildToolResult(
          `XBrush API is **${health.status}**` +
            (health.timestamp ? ` (${health.timestamp})` : "")
        );
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
