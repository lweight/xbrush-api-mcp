/**
 * Watermark tool: xbrush_watermark_add
 *
 * Submits async and returns a request_id. Caller polls with `xbrush_get_request`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WatermarkAddSchema } from "../schemas/watermark.js";
import { submitAsync } from "../services/dispatch.js";

export function registerWatermarkTools(server: McpServer): void {
  server.registerTool(
    "xbrush_watermark_add",
    {
      title: "Add Watermark",
      description: [
        "Apply the XBrush watermark to a target image or video.",
        "The watermark content is fixed by the server — only its visibility (strength) can be chosen.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, optional): Target image URL.",
        "  video_url (string, optional): Target video URL (one of image_url/video_url required).",
        "  strength (string, optional): low | medium | high.",
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
      if (args.strength !== undefined) body.strength = args.strength;

      return submitAsync({
        url: "/v1/watermark/add",
        body,
        label: "Watermark",
      });
    }
  );
}
