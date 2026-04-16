/**
 * Video tools: generate, upscale
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  VideoGenerateSchema,
  VideoUpscaleSchema,
} from "../schemas/video.js";
import { submitSyncOrAsync } from "../services/dispatch.js";
import { SYNC_TIMEOUTS } from "../constants.js";
import type { XBrushSyncResponse } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Video sync formatter: lists `videoUrl` first, then thumbnails (`imageUrls`).
 * Kept distinct from the generic formatter because thumbnail rendering is
 * domain-specific.
 */
function formatVideoSyncResult(r: XBrushSyncResponse, label: string): string {
  const lines: string[] = [];
  lines.push(`${label} completed.`);
  lines.push("");
  lines.push(`- **Request ID**: ${r.requestId}`);
  lines.push(`- **Credits charged**: ${r.creditCharged}`);

  if (r.output.videoUrl) {
    lines.push(`- **Video**: ${r.output.videoUrl}`);
  }
  if (r.output.imageUrls?.length) {
    lines.push(`- **Thumbnails** (${r.output.imageUrls.length}):`);
    r.output.imageUrls.forEach((url, i) => {
      lines.push(`  ${i + 1}. ${url}`);
    });
  }

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerVideoTools(server: McpServer): void {
  // ── xbrush_video_generate ──────────────────────────────────────────

  server.registerTool(
    "xbrush_video_generate",
    {
      title: "Generate Video",
      description: [
        "Generate a video from a start image and optional prompt.",
        "By default async — use xbrush_get_request to poll. Set sync=true to wait (2-10 min).",
        "",
        "Args:",
        "  model (string, required): Video model ID (e.g. kling, wan, veo3). Use xbrush_list_models(category='video').",
        "  image_url (string, required): URL of the start image (first frame).",
        "  prompt (string, optional): Motion/action description.",
        "  end_image_url (string, optional): URL of the end image (last frame).",
        "  duration (int, optional): 5 or 10 seconds.",
        "  prompt_relevance (float, optional): Prompt adherence (0.0-1.0).",
        "  sync (bool, optional): Wait for result. Default: false.",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/video/generate/sync",
        asyncUrl: "/v1/video/generate",
        syncTimeout: SYNC_TIMEOUTS.video,
        body,
        label: "Video generation",
        formatSync: formatVideoSyncResult,
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
        "By default async — use xbrush_get_request to poll. Set sync=true to wait.",
        "",
        "Args:",
        "  video_url (string, required): URL of the video to upscale.",
        "  scale (int, required): Upscale multiplier (2 or 4).",
        "  model (string, optional): Model ID (e.g. RealESRGAN, seedvr).",
        "  sync (bool, optional): Wait for result. Default: false.",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/video/upscale/sync",
        asyncUrl: "/v1/video/upscale",
        syncTimeout: SYNC_TIMEOUTS.video,
        body,
        label: "Video upscale",
        formatSync: formatVideoSyncResult,
      });
    }
  );
}
