/**
 * Content moderation tool: xbrush_content_moderate
 *
 * Routes to /v1/image/moderate or /v1/video/moderate. Submits async and returns
 * a request_id; poll the result (flagged verdict + masked copy) with
 * xbrush_get_request.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ContentModerateSchema } from "../schemas/moderation.js";
import { submitAsync } from "../services/dispatch.js";

export function registerModerationTools(server: McpServer): void {
  server.registerTool(
    "xbrush_content_moderate",
    {
      title: "Moderate Content",
      description: [
        "Run NSFW moderation on an image or video.",
        "The result (poll with xbrush_get_request) includes a `flagged` verdict, an overall",
        "score, and a processed copy with unsafe regions masked.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, optional): Target image URL.",
        "  video_url (string, optional): Target video URL (provide exactly one of image_url/video_url).",
      ].join("\n"),
      inputSchema: ContentModerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      if (args.image_url !== undefined) {
        return submitAsync({
          url: "/v1/image/moderate",
          body: { imageUrl: args.image_url },
          label: "Image moderation",
        });
      }
      return submitAsync({
        url: "/v1/video/moderate",
        body: { videoUrl: args.video_url },
        label: "Video moderation",
      });
    }
  );
}
