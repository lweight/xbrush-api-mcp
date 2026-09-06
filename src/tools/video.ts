/**
 * Video tools: generate, upscale, extend, retake, edit, vision
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only").
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  VideoGenerateSchema,
  VideoUpscaleSchema,
  VideoExtendSchema,
  VideoRetakeSchema,
  VideoEditSchema,
  VideoVisionSchema,
} from "../schemas/video.js";
import { submitAsync } from "../services/dispatch.js";
import { buildToolResult } from "../services/xbrush-client.js";

const ASYNC_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

// ── @ImageN reference guard ───────────────────────────────────────────
// Common mistake: the model writes @Image1 in the prompt/idea to mean "the
// first reference image", but @ImageN actually addresses the N-th entry of
// image_urls by 1-based ARRAY POSITION — first_frame/last_frame included. So
// for image_urls=[last_frame, reference_image] the reference is @Image2, and
// @Image1 points at the last_frame. We catch the two failure modes up front
// and return the real position→role mapping so the caller can correct it.
type ImageRef = string | { url: string; role?: string };

function roleOf(el: ImageRef): string | undefined {
  return typeof el === "object" && el !== null ? el.role : undefined;
}

function checkImageReferences(
  prompt: string | undefined,
  idea: string | undefined,
  imageUrls: ImageRef[] | undefined
): CallToolResult | null {
  if (!imageUrls || imageUrls.length === 0) return null;
  const text = `${prompt ?? ""}\n${idea ?? ""}`;
  const matches = [...text.matchAll(/@image\s*(\d+)/gi)];
  if (matches.length === 0) return null;

  const n = imageUrls.length;
  const mapping = imageUrls
    .map((el, i) => `@Image${i + 1}=${roleOf(el) ?? (typeof el === "string" ? "url" : "no role")}`)
    .join(", ");

  for (const m of matches) {
    const k = Number(m[1]);
    if (k < 1 || k > n) {
      return buildToolResult(
        `Error: prompt/idea references @Image${k}, but image_urls has ${n} ` +
          `entr${n === 1 ? "y" : "ies"} (valid: @Image1..@Image${n}). @ImageN addresses the N-th ` +
          `entry of image_urls by array position. Current mapping: ${mapping}.`,
        true
      );
    }
    const role = roleOf(imageUrls[k - 1]);
    if (role === "first_frame" || role === "last_frame") {
      const refs = imageUrls
        .map((el, i) => (roleOf(el) === "reference_image" ? `@Image${i + 1}` : null))
        .filter((x): x is string => x !== null);
      return buildToolResult(
        `Error: prompt/idea uses @Image${k}, but position ${k} of image_urls has role '${role}' ` +
          `(a frame, not a citable subject). @ImageN counts ALL entries by array position. ` +
          (refs.length
            ? `To cite a reference_image use: ${refs.join(", ")}. `
            : `There are no reference_image entries to cite. `) +
          `Either use the correct @Image position or reorder image_urls. Current mapping: ${mapping}.`,
        true
      );
    }
  }
  return null;
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerVideoTools(server: McpServer): void {
  // ── xbrush_video_generate ──────────────────────────────────────────

  server.registerTool(
    "xbrush_video_generate",
    {
      title: "Generate Video",
      description: [
        "Generate a video from a start image, a text prompt, and/or reference images (reference-to-video).",
        "Submits async — poll the returned request_id with xbrush_get_request (typical wait 2-10 min).",
        "",
        "Args:",
        "  model (string, required): Video model ID (e.g. seedance-2.5, seedance-2.0, kling-v3-pro, kling-v3-omni, kling-o3, veo3.1, wan-3.0-video, minimax-h3, ltx-2.3, gemini-omni-1.1-flash). Use xbrush_list_models(category='video') — entries include per-resolution prices and per-model duration constraints.",
        "  image_url (string, optional): Start image (first frame) for image-to-video. Not needed for text-to-video or reference-to-video.",
        "  image_urls (array, optional): Reference images for reference-to-video models (seedance-2.x, kling-o3-ref, minimax-h3-ref, wan-3.0-video-ref). Each item is a URL string OR an object {url, role} where role is first_frame/last_frame/reference_image — so one call can combine a start frame, an end frame, and subject references. NUMBERING: in prompt/idea, @ImageN = the N-th item here by 1-based ARRAY POSITION, counting first_frame/last_frame too (NOT 'the N-th reference'). E.g. [last_frame, reference_image] → the reference is @Image2. image_url is not required when this is set.",
        "  prompt (string, optional): ENGLISH motion/action description, sent to the model as-is. Reference an image_urls item as @ImageN (N = its 1-based position in image_urls). Use 'idea' instead for non-English text. Provide prompt or idea for text-to-video.",
        "  idea (string, optional): NON-English description (e.g. Korean) — the server translates it before generation. Use this instead of prompt when not writing in English. Reference an image_urls item as @ImageN (N = its 1-based position in image_urls).",
        "  negative_prompt (string, optional): Things to avoid.",
        "  audio_url (string, optional): Driving/reference audio for models with an audio input.",
        "  duration (int, optional): Seconds (1-30 endpoint-wide); valid range is model-specific (e.g. seedance-2.0 4–15, seedance-2.5 / wan-3.0 4–30, kling-v2 5/10, veo3.x 4–8).",
        "  resolution (string, optional): 480p/720p/1080p/1440p/2160p/2k/4k/512p/768p — each model supports a subset (prices per tier in xbrush_list_models). Server-validated per model.",
        "  aspect_ratio (string, optional): auto/adaptive/16:9/9:16/1:1/4:3/3:4/21:9/custom (custom → also pass width/height).",
        "  width / height (int, optional): Exact size with aspect_ratio 'custom' on models that allow it.",
        "  fps (int, optional): 24/25/48/50 on models that expose it. steps (int) and acceleration (none/regular/high): diffusion knobs (e.g. ltx-2.3).",
        "  seed (int, optional): Random seed.",
        "  generate_audio (bool, optional): Generate audio with the video (seedance-2.x, veo3.x, kling-v3, wan-3.0 — audio tiers cost more).",
        "  consistency_mode (string, optional): Reference consistency for reference-to-video (seedance-2.x): overlay/advanced/auto.",
        "  end_image_url, prompt_relevance: deprecated — no longer recognized by the endpoint (use image_urls role 'last_frame').",
        "",
        "Result output: videoUrl, width, height, fps, duration, nsfwDetected.",
      ].join("\n"),
      inputSchema: VideoGenerateSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const refError = checkImageReferences(args.prompt, args.idea, args.image_urls);
      if (refError) return refError;

      const body: Record<string, unknown> = {
        model: args.model,
      };
      if (args.image_url !== undefined) body.imageUrl = args.image_url;
      if (args.image_urls !== undefined) body.imageUrls = args.image_urls;
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.idea !== undefined) body.idea = args.idea;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.end_image_url !== undefined) body.endImageUrl = args.end_image_url;
      if (args.audio_url !== undefined) body.audioUrl = args.audio_url;
      if (args.duration !== undefined) body.duration = args.duration;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
      if (args.fps !== undefined) body.fps = args.fps;
      if (args.steps !== undefined) body.steps = args.steps;
      if (args.acceleration !== undefined) body.acceleration = args.acceleration;
      if (args.seed !== undefined) body.seed = args.seed;
      if (args.generate_audio !== undefined) body.generateAudio = args.generate_audio;
      if (args.consistency_mode !== undefined) body.consistencyMode = args.consistency_mode;
      if (args.prompt_relevance !== undefined) body.promptRelevance = args.prompt_relevance;

      return submitAsync({
        url: "/v1/video/generate",
        body,
        label: "Video generation",
      });
    }
  );

  // ── xbrush_video_upscale ───────────────────────────────────────────

  server.registerTool(
    "xbrush_video_upscale",
    {
      title: "Upscale Video",
      description: [
        "Upscale a video to higher resolution.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  video_url (string, required): URL of the video to upscale.",
        "  scale (int, required): Upscale multiplier (2 or 4).",
        "  model (string, optional): 'realesrgan' (0.0024 credits/megapixel-frame) or 'seedvr' (0.0013). Server default if omitted.",
      ].join("\n"),
      inputSchema: VideoUpscaleSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        videoUrl: args.video_url,
        scale: args.scale,
      };
      if (args.model !== undefined) body.model = args.model;

      return submitAsync({
        url: "/v1/video/upscale",
        body,
        label: "Video upscale",
      });
    }
  );

  // ── xbrush_video_extend ────────────────────────────────────────────

  server.registerTool(
    "xbrush_video_extend",
    {
      title: "Extend Video",
      description: [
        "Extend an existing video by generating additional seconds of motion.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): ltx-2.3-extend (2-20s, 0.13/s), pixverse-v6-extend (1-15s, 360p-1080p, optional audio/style), gemini-omni-1.1-flash (3-10s, 0.14/s). See xbrush_list_models(category='video'), featureType 'extend'.",
        "  video_url (string, required): URL of the source video to extend.",
        "  duration (number, required): Seconds of new video to append (1-20; model range in constraints).",
        "  prompt / idea (string, optional): What should happen next (English / non-English).",
        "  negative_prompt (string, optional): Things to avoid.",
        "  start_time (number, optional): Continue from this timestamp instead of the end.",
        "  resolution (string, optional): 360p/540p/720p/1080p (pixverse-v6-extend).",
        "  generate_audio (bool, optional): Audio for the extension (pixverse; costs more).",
        "  style (string, optional): anime/3d_animation/clay/comic/cyberpunk (pixverse).",
        "  seed (int, optional): Random seed.",
      ].join("\n"),
      inputSchema: VideoExtendSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        model: args.model,
        videoUrl: args.video_url,
        duration: args.duration,
      };
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.idea !== undefined) body.idea = args.idea;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.start_time !== undefined) body.startTime = args.start_time;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.generate_audio !== undefined) body.generateAudio = args.generate_audio;
      if (args.style !== undefined) body.style = args.style;
      if (args.seed !== undefined) body.seed = args.seed;
      return submitAsync({
        url: "/v1/video/extend",
        body,
        label: "Video extend",
      });
    }
  );

  // ── xbrush_video_retake ────────────────────────────────────────────

  server.registerTool(
    "xbrush_video_retake",
    {
      title: "Retake Video",
      description: [
        "Regenerate (retake) a segment of a video, producing a new variation of that part.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): Retake model (e.g. ltx-2.3-retake, 0.13/s). See xbrush_list_models(category='video'), featureType 'retake'.",
        "  video_url (string, required): URL of the source video to retake.",
        "  end_time (number, required): Timestamp in seconds (0-40) up to which to regenerate.",
        "  start_time (number, optional): Timestamp in seconds (0-20) where the retake starts (default 0).",
        "  prompt / idea (string, optional): Guidance for the regenerated segment (English / non-English).",
      ].join("\n"),
      inputSchema: VideoRetakeSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        model: args.model,
        videoUrl: args.video_url,
        endTime: args.end_time,
      };
      if (args.start_time !== undefined) body.startTime = args.start_time;
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.idea !== undefined) body.idea = args.idea;
      return submitAsync({
        url: "/v1/video/retake",
        body,
        label: "Video retake",
      });
    }
  );

  // ── xbrush_video_edit ──────────────────────────────────────────────

  server.registerTool(
    "xbrush_video_edit",
    {
      title: "Edit Video (prompt-driven)",
      description: [
        "Transform an entire video with a text instruction — restyle, color-grade, change weather/lighting,",
        "replace or remove elements — keeping the motion (model gemini-omni-1.1-flash, 0.143 credits/sec of source;",
        "a 5s clip cost 0.858 and took ~2 min). Submits async — poll with xbrush_get_request.",
        "Output: videoUrl (+ thumbnailUrl, width, height, fps, duration, audioSource).",
        "",
        "Args:",
        "  model (string, required): 'gemini-omni-1.1-flash' (featureType 'video_edit').",
        "  video_url (string, required): Source video URL.",
        "  prompt (string): English instruction (1-4000 chars) — or idea for non-English. One of the two is required.",
        "  audio (string, optional): 'source' (keep original audio), 'model' (generate), 'none' (silent).",
      ].join("\n"),
      inputSchema: VideoEditSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        model: args.model,
        videoUrl: args.video_url,
      };
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.idea !== undefined) body.idea = args.idea;
      if (args.audio !== undefined) body.audio = args.audio;
      return submitAsync({ url: "/v1/video/edit", body, label: "Video edit" });
    }
  );

  // ── xbrush_video_vision ────────────────────────────────────────────

  server.registerTool(
    "xbrush_video_vision",
    {
      title: "Analyze Video (transcript + on-screen text)",
      description: [
        "Video understanding: speech transcript with timed segments (whisper) plus OCR of sampled frames",
        "(model video-vision, 0.003 credits/sec; a 5s clip finished in ~4s). Submits async — poll with xbrush_get_request.",
        "Output: transcript {text, language, duration, segments[{start,end,text}]}, fullText (on-screen text), frames[], analyzedFrames.",
        "For audio-only files use xbrush_stt_transcribe (WAV).",
        "",
        "Args:",
        "  video_url (string, required): Video URL.",
        "  language (string, optional): Two-letter language hint for the transcript (e.g. 'en', 'ko').",
      ].join("\n"),
      inputSchema: VideoVisionSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = { videoUrl: args.video_url };
      if (args.language !== undefined) body.language = args.language;
      return submitAsync({ url: "/v1/video/vision", body, label: "Video vision" });
    }
  );
}
