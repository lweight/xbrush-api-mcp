/**
 * Lip-sync tool: xbrush_video_lip_sync
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VideoLipSyncSchema } from "../schemas/lip-sync.js";
import { submitSyncOrAsync } from "../services/dispatch.js";
import { SYNC_TIMEOUTS } from "../constants.js";
import type { XBrushSyncResponse } from "../types.js";

function formatLipSyncResult(r: XBrushSyncResponse, label: string): string {
  const lines: string[] = [];
  lines.push(`${label} completed.`);
  lines.push("");
  lines.push(`- **Request ID**: ${r.requestId}`);
  lines.push(`- **Credits charged**: ${r.creditCharged}`);
  if (r.output.videoUrl) lines.push(`- **Video**: ${r.output.videoUrl}`);
  return lines.join("\n");
}

export function registerLipSyncTools(server: McpServer): void {
  server.registerTool(
    "xbrush_video_lip_sync",
    {
      title: "Lip-sync Video",
      description: [
        "Sync a face video to speech audio (e.g. pixverse).",
        "Async by default — lip-sync generation can take 30s to several minutes.",
        "",
        "Args:",
        "  video_url (string, required): Face video URL.",
        "  audio_url (string, required): Audio URL to drive the mouth movement.",
        "  model (string, optional): Lip-sync model ID.",
        "  sync (bool, optional): Default: false (async).",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/video/lip-sync/sync",
        asyncUrl: "/v1/video/lip-sync",
        syncTimeout: SYNC_TIMEOUTS.video,
        body,
        label: "Lip-sync",
        formatSync: formatLipSyncResult,
      });
    }
  );
}
