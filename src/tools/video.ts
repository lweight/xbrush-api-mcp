/**
 * Video tools: generate, upscale
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
} from "../schemas/video.js";
import { submitAsync } from "../services/dispatch.js";
import { buildToolResult } from "../services/xbrush-client.js";

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
        "  model (string, required): Video model ID (e.g. kling-v3-pro, kling-o3, veo3.1, seedance-2.0, hailuo-02-pro, wan-2.7-video). Use xbrush_list_models(category='video') — entries include per-model duration constraints.",
        "  image_url (string, optional): Start image (first frame) for image-to-video. Not needed for text-to-video or reference-to-video.",
        "  image_urls (array, optional): Reference images for reference-to-video models (seedance-2.0/-fast). Each item is a URL string OR an object {url, role} where role is first_frame/last_frame/reference_image — so one call can combine a start frame, an end frame, and subject references. NUMBERING: in prompt/idea, @ImageN = the N-th item here by 1-based ARRAY POSITION, counting first_frame/last_frame too (NOT 'the N-th reference'). E.g. [last_frame, reference_image] → the reference is @Image2. image_url is not required when this is set.",
        "  prompt (string, optional): ENGLISH motion/action description, sent to the model as-is. Reference an image_urls item as @ImageN (N = its 1-based position in image_urls). Use 'idea' instead for non-English text. Provide prompt or idea for text-to-video.",
        "  idea (string, optional): NON-English description (e.g. Korean) — the server translates it before generation. Use this instead of prompt when not writing in English. Reference an image_urls item as @ImageN (N = its 1-based position in image_urls).",
        "  end_image_url (string, optional): End image (last frame), for models that support an end frame.",
        "  duration (int, optional): Seconds; valid range is model-specific (e.g. seedance-2.0 4–15, kling 5/10, veo3 4–8).",
        "  resolution (string, optional): Resolution tier for models that support it (seedance-2.0: 480p/720p/1080p/1440p/2160p/4k/512p/768p). Server-validated per model.",
        "  aspect_ratio (string, optional): Aspect ratio for models that support it (seedance-2.0: auto/adaptive/16:9/9:16/1:1/4:3/3:4/21:9).",
        "  generate_audio (bool, optional): Generate audio with the video (seedance-2.0/-fast).",
        "  consistency_mode (string, optional): Reference consistency for reference-to-video (seedance-2.0/-fast): overlay/advanced/auto.",
        "  prompt_relevance (float, optional): Prompt adherence (0.0-1.0).",
      ].join("\n"),
      inputSchema: VideoGenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      if (args.end_image_url !== undefined) body.endImageUrl = args.end_image_url;
      if (args.duration !== undefined) body.duration = args.duration;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
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
        "  model (string, optional): Model ID (e.g. realesrgan, seedvr).",
      ].join("\n"),
      inputSchema: VideoUpscaleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
        "  model (string, required): Extend model (e.g. ltx-2.3-extend, pixverse-v6-extend). See xbrush_list_models(category='video'), featureType 'extend'.",
        "  video_url (string, required): URL of the source video to extend.",
        "  duration (number, required): Seconds of new video to append (1-20).",
      ].join("\n"),
      inputSchema: VideoExtendSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      submitAsync({
        url: "/v1/video/extend",
        body: {
          model: args.model,
          videoUrl: args.video_url,
          duration: args.duration,
        },
        label: "Video extend",
      })
  );

  // ── xbrush_video_retake ────────────────────────────────────────────

  server.registerTool(
    "xbrush_video_retake",
    {
      title: "Retake Video",
      description: [
        "Regenerate (retake) a video up to a given timestamp, producing a new variation.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): Retake model (e.g. ltx-2.3-retake). See xbrush_list_models(category='video'), featureType 'retake'.",
        "  video_url (string, required): URL of the source video to retake.",
        "  end_time (number, required): Timestamp in seconds (>= 0) up to which to regenerate.",
      ].join("\n"),
      inputSchema: VideoRetakeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      submitAsync({
        url: "/v1/video/retake",
        body: {
          model: args.model,
          videoUrl: args.video_url,
          endTime: args.end_time,
        },
        label: "Video retake",
      })
  );
}
