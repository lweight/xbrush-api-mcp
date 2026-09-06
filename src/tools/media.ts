/**
 * Media utility tools (2026-09): ffmpeg pipeline, still-image pipeline,
 * filter-graph, and a free metadata probe.
 *
 * The three processing tools submit asynchronously (domain "media") and are
 * polled with xbrush_get_request; jobs typically finish in 1-3 seconds. Output
 * shapes: video jobs → videoUrl, thumbnailUrl, width, height, durationSeconds,
 * sizeBytes, format; image jobs → imageUrls[], width, height, sizeBytes, format.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MediaFfmpegSchema,
  MediaImageProcessSchema,
  MediaGraphSchema,
  MediaInfoSchema,
} from "../schemas/media.js";
import { callSync, submitAsync } from "../services/dispatch.js";
import { TIMEOUT_SYNC_UTILITY } from "../constants.js";
import type { XBrushMediaInfoResponse } from "../types.js";

const ASYNC_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function formatMediaInfo(r: XBrushMediaInfoResponse, url: string): string {
  const lines: string[] = [];
  if (r.error) {
    lines.push(`# Media info — unreadable`);
    lines.push("");
    lines.push(`- **URL**: ${r.url ?? url}`);
    lines.push(`- **Error**: ${r.error}`);
    lines.push("");
    lines.push("The server could not read this object (only public https URLs it can fetch — e.g. assets.xbrush.ai CDN URLs from other tools — are probed).");
    return lines.join("\n");
  }
  const isImage = r.kind === "image" || (r.frames != null && r.hasVideo == null);
  lines.push(`# Media info — ${isImage ? "image" : "video"}`);
  lines.push("");
  lines.push(`- **URL**: ${url}`);
  if (r.format) lines.push(`- **Format**: ${r.format}`);
  if (r.videoCodec) lines.push(`- **Video codec**: ${r.videoCodec}`);
  if (r.width != null && r.height != null) lines.push(`- **Size**: ${r.width}×${r.height}`);
  if (r.durationInSeconds != null) lines.push(`- **Duration**: ${r.durationInSeconds.toFixed(3)}s`);
  if (r.fps != null) lines.push(`- **FPS**: ${r.fps}`);
  if (r.hasVideo != null || r.hasAudio != null) lines.push(`- **Streams**: video ${r.hasVideo ? "yes" : "no"} · audio ${r.hasAudio ? "yes" : "no"}`);
  if (r.frames != null) lines.push(`- **Frames**: ${r.frames}`);
  if (r.hasAlpha != null) lines.push(`- **Alpha**: ${r.hasAlpha ? "yes" : "no"}`);
  if (r.sizeBytes != null) lines.push(`- **File size**: ${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB (${r.sizeBytes} bytes)`);
  const known = new Set(["error", "url", "format", "videoCodec", "width", "height", "durationInSeconds", "videoDurationInSeconds", "fps", "hasVideo", "hasAudio", "frames", "hasAlpha", "sizeBytes", "kind", "hasIccProfile", "exifOrientation"]);
  const rest = Object.fromEntries(Object.entries(r).filter(([k]) => !known.has(k)));
  if (Object.keys(rest).length) lines.push(`- **Other**: ${JSON.stringify(rest)}`);
  return lines.join("\n");
}

export function registerMediaTools(server: McpServer): void {
  // ── xbrush_media_ffmpeg ────────────────────────────────────────────

  server.registerTool(
    "xbrush_media_ffmpeg",
    {
      title: "Process Video/Audio (ffmpeg pipeline)",
      description: [
        "Deterministic ffmpeg post-processing on existing media — trim, concat, transcode, scale, extract-audio,",
        "thumbnail, watermark, gif, speed, crop, rotate, fade, subtitle (burn .srt/.vtt), merge-audio, still (image → clip).",
        "Cheap and fast (per output second: h264 0.0004 credits, h265 ×9, vp9 ×35, gif ×29; floor 0.002; a 2s trim = 0.002, ~2s).",
        "Submits async (domain media/ffmpeg) — poll with xbrush_get_request. Output: videoUrl (or audio/image URL per format),",
        "thumbnailUrl, width, height, durationSeconds, sizeBytes.",
        "The server reads input metadata at submit time — unreachable inputs fail immediately (400 INVALID_INPUT, no charge).",
        "Typical use: `extract-audio` + output.format 'wav' to feed xbrush_stt_transcribe; `trim`/`concat` to assemble generated clips;",
        "`still` to turn an image into a 5s clip for concat.",
        "",
        "Args:",
        "  inputs (string[], required): 1-10 media URLs (index 0 is the primary; concat joins all in order).",
        "  operations (array, required): 1-20 of {op, ...params} applied in order. Params by op:",
        "    trim {start, end | duration} · transcode {codec h264|h265|vp9, crf, bitrate} · scale {width, height, fit crop|contain|pad}",
        "    thumbnail {at, count} · watermark {src, position, margin, scale, opacity} · gif {fps, width, loop} · speed {factor}",
        "    crop {width, height, x, y | aspect} · rotate {degrees 90|180|270} · fade {type in|out, duration} · subtitle {src, style default|boxed|large}",
        "    merge-audio {src} · still {duration} · concat / extract-audio: no params",
        "  output (object, optional): {format mp4|webm|mov|gif|mp3|m4a|wav|jpg|png, fps 1-120, quality}.",
      ].join("\n"),
      inputSchema: MediaFfmpegSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        inputs: args.inputs,
        operations: args.operations.map((op) => stripUndefined(op)),
      };
      if (args.output !== undefined) body.output = stripUndefined(args.output);
      return submitAsync({ url: "/v1/media/ffmpeg", body, label: "Media ffmpeg job" });
    }
  );

  // ── xbrush_media_image_process ─────────────────────────────────────

  server.registerTool(
    "xbrush_media_image_process",
    {
      title: "Process Image (resize/crop/composite/filters)",
      description: [
        "Deterministic image post-processing (no AI model): resize, crop, rotate, flip, pad, trim, composite, stack (grid/strip),",
        "text overlay, border, adjust (brightness/contrast/saturation/hue), blur, sharpen, sepia, negate, posterize, solarize,",
        "vignette, emboss, charcoal, oil_paint, swirl, tint, pixelate, auto_contrast, level, noise, glow, hald_clut, stylize,",
        "pencil_sketch, detail_enhance, smooth, denoise, clahe, white_balance, straighten_document.",
        "Very cheap (~0.0001 credits per megapixel-step, floor 0.0004; a 256px webp resize = 0.0006, ~1s).",
        "Submits async (domain media/image) — poll with xbrush_get_request. Output: imageUrls[], width, height, format, sizeBytes.",
        "",
        "Args:",
        "  inputs (string[], required): 1-6 image URLs (composite/stack use all; other ops apply to input 0).",
        "  operations (array, required): 1-10 of {op, ...params}, e.g. {op:'resize', width:1024, fit:'contain'},",
        "    {op:'crop', aspect:'1:1', gravity:'center'}, {op:'pad', width:1080, height:1080, background:'#ffffff'},",
        "    {op:'stack', direction:'horizontal', gap:16}, {op:'text', text:'SALE', size:96, color:'#ff0000', gravity:'south'},",
        "    {op:'adjust', brightness:10, contrast:5}, {op:'blur', sigma:2}, {op:'sharpen', amount:1.2}.",
        "  output (object, optional): {format jpg|png|webp|gif, quality 1-100}.",
      ].join("\n"),
      inputSchema: MediaImageProcessSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        inputs: args.inputs,
        operations: args.operations.map((op) => stripUndefined(op)),
      };
      if (args.output !== undefined) body.output = stripUndefined(args.output);
      return submitAsync({ url: "/v1/media/image", body, label: "Media image job" });
    }
  );

  // ── xbrush_media_graph ─────────────────────────────────────────────

  server.registerTool(
    "xbrush_media_graph",
    {
      title: "Compose Media (filter graph)",
      description: [
        "Node-graph media composition (ffmpeg filter graph IR) for anything the linear pipeline can't express: overlays",
        "(picture-in-picture, logo), crossfades between clips (xfade), chroma key, color grading (eq/hue/curves/lut3d),",
        "drawtext captions, zoompan (Ken Burns on stills), audio mixing/normalizing (amix, loudnorm, volume, afade), muting",
        "or replacing a soundtrack (set_audio), generated color/silence sources.",
        "Billed like ffmpeg jobs (per output second, floor 0.002). Submits async (domain media/graph) — poll with xbrush_get_request.",
        "Output: videoUrl, thumbnailUrl, width, height, durationSeconds, sizeBytes.",
        "",
        "Shape: inputs [{id, url}] → nodes [{id, op, from:{port: id|[ids]}, params:{…}}] → output {from: nodeId, format}.",
        "Ports: most ops take {in: id} (arrays for concat/xfade/blend/amix/aconcat); overlay {base, over}; alphamerge {base, alpha};",
        "set_audio {video, audio}; sources color/silence take none. Params are per op — the server rejects unknown ones and lists",
        "the allowed set (e.g. trim {start, duration}; overlay {position, margin, scale, start, end}; xfade {transition, duration};",
        "drawtext {text, font, size, color, position, margin} where font is a key from GET /v1/media/fonts (206 fonts incl. Korean:",
        "Pretendard, NotoSansKR-style names); lut3d {lut} from GET /v1/media/luts (cinematic_v1, golden_v1, monofilm_v1, …)).",
        "Example — logo overlay + fade out:",
        "  inputs [{id:'a', url:VIDEO}, {id:'logo', url:PNG}]",
        "  nodes [{id:'s', op:'still', from:{in:'logo'}, params:{duration:5}},",
        "         {id:'o', op:'overlay', from:{base:'a', over:'s'}, params:{position:'top-right', margin:24, scale:0.2}},",
        "         {id:'f', op:'fade', from:{in:'o'}, params:{type:'out', duration:1}}]",
        "  output {from:'f', format:'mp4'}",
        "",
        "Args:",
        "  inputs (array, required): 1-10 {id (lowercase ^[a-z][a-z0-9_]{0,31}$), url} — videos or jpg/png/webp images.",
        "  nodes (array, required): 1-50 {id, op, from?, params?}.",
        "  output (object, required): {from, format mp4|webm|gif|mp3|m4a|wav, quality low|medium|high, fps}.",
      ].join("\n"),
      inputSchema: MediaGraphSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        inputs: args.inputs,
        nodes: args.nodes.map((n) => stripUndefined(n)),
        output: stripUndefined(args.output),
      };
      return submitAsync({ url: "/v1/media/graph", body, label: "Media graph job" });
    }
  );

  // ── xbrush_media_info ──────────────────────────────────────────────

  server.registerTool(
    "xbrush_media_info",
    {
      title: "Probe Media Metadata",
      description: [
        "Read metadata of a video or image URL (free, synchronous, ~1s): videos → width, height, fps, duration, codec,",
        "has audio, file size; images → format, width, height, frames, alpha, file size.",
        "Use it to check a generated asset before passing it on (e.g. duration for trim/extend, dimensions for outpaint canvas math).",
        "",
        "Args:",
        "  url (string, required): http(s) media URL (CDN URLs from other tools work; arbitrary hosts may be unreadable).",
      ].join("\n"),
      inputSchema: MediaInfoSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      callSync<XBrushMediaInfoResponse>({
        method: "GET",
        url: "/v1/media/info",
        params: { url: args.url },
        timeout: TIMEOUT_SYNC_UTILITY,
        format: (r) => formatMediaInfo(r, args.url),
      })
  );
}
