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
        "Generate a video from a start image and optional prompt.",
        "Submits async — poll the returned request_id with xbrush_get_request (typical wait 2-10 min).",
        "",
        "Args:",
        "  model (string, required): Video model ID (e.g. kling, wan, veo3). Use xbrush_list_models(category='video').",
        "  image_url (string, required): URL of the start image (first frame).",
        "  prompt (string, optional): Motion/action description.",
        "  end_image_url (string, optional): URL of the end image (last frame).",
        "  duration (int, optional): 5 or 10 seconds.",
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
        imageUrl: args.image_url,
      };
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
        "  model (string, optional): Model ID (e.g. RealESRGAN, seedvr).",
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
}
