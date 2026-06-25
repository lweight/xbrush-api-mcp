/**
 * Video tools: generate, upscale
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only").
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  VideoGenerateSchema,
  VideoUpscaleSchema,
  VideoExtendSchema,
  VideoRetakeSchema,
} from "../schemas/video.js";
import { submitAsync } from "../services/dispatch.js";

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
        "  model (string, required): Video model ID (e.g. kling, wan, veo3, seedance-2.0). Use xbrush_list_models(category='video').",
        "  image_url (string, optional): Start image (first frame) for image-to-video. Not needed for text-to-video or reference-to-video.",
        "  image_urls (string[], optional): Reference images for reference-to-video models (e.g. seedance-2.0). Cite them in the prompt as @Image1, @Image2, …. image_url is not required when this is set.",
        "  prompt (string, optional): Motion/action description (use @ImageN to reference image_urls). Required for text-to-video.",
        "  end_image_url (string, optional): End image (last frame), for models that support an end frame.",
        "  duration (int, optional): Seconds; valid range is model-specific (e.g. seedance-2.0 4–15, kling 5/10, veo3 4–8).",
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
      const body: Record<string, unknown> = {
        model: args.model,
      };
      if (args.image_url !== undefined) body.imageUrl = args.image_url;
      if (args.image_urls !== undefined) body.imageUrls = args.image_urls;
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.end_image_url !== undefined) body.endImageUrl = args.end_image_url;
      if (args.duration !== undefined) body.duration = args.duration;
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
