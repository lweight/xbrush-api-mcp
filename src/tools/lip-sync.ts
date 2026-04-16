/**
 * Lip-sync tool: xbrush_video_lip_sync
 *
 * Submits async and returns a request_id. Caller polls with `xbrush_get_request`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VideoLipSyncSchema } from "../schemas/lip-sync.js";
import { submitAsync } from "../services/dispatch.js";

export function registerLipSyncTools(server: McpServer): void {
  server.registerTool(
    "xbrush_video_lip_sync",
    {
      title: "Lip-sync Video",
      description: [
        "Sync a face video to speech audio (e.g. pixverse).",
        "Submits async — lip-sync generation can take 30s to several minutes. Poll with xbrush_get_request.",
        "",
        "Args:",
        "  video_url (string, required): Face video URL.",
        "  audio_url (string, required): Audio URL to drive the mouth movement.",
        "  model (string, optional): Lip-sync model ID.",
      ].join("\n"),
      inputSchema: VideoLipSyncSchema,
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
        audioUrl: args.audio_url,
      };
      if (args.model !== undefined) body.model = args.model;

      return submitAsync({
        url: "/v1/video/lip-sync",
        body,
        label: "Lip-sync",
      });
    }
  );
}
