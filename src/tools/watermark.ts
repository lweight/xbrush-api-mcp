/**
 * Watermark tool: xbrush_watermark_add
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WatermarkAddSchema } from "../schemas/watermark.js";
import { submitSyncOrAsync } from "../services/dispatch.js";
import { SYNC_TIMEOUTS } from "../constants.js";

export function registerWatermarkTools(server: McpServer): void {
  server.registerTool(
    "xbrush_watermark_add",
    {
      title: "Add Watermark",
      description: [
        "Apply the XBrush watermark to a target image or video.",
        "The watermark content is fixed by the server — no customization is accepted.",
        "Sync by default (watermarking is typically fast).",
        "",
        "Args:",
        "  image_url (string, optional): Target image URL.",
        "  video_url (string, optional): Target video URL (one of image_url/video_url required).",
        "  sync (bool, optional): Default: true (sync).",
      ].join("\n"),
      inputSchema: WatermarkAddSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {};
      if (args.image_url !== undefined) body.imageUrl = args.image_url;
      if (args.video_url !== undefined) body.videoUrl = args.video_url;

      return submitSyncOrAsync({
        useSync: args.sync !== false,
        syncUrl: "/v1/watermark/add/sync",
        asyncUrl: "/v1/watermark/add",
        syncTimeout: SYNC_TIMEOUTS.audio_short,
        body,
        label: "Watermark",
      });
    }
  );
}
