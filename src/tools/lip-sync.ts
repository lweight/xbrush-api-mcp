/**
 * Lip-sync tool: xbrush_video_lip_sync
 *
 * Submits async and returns a request_id. Caller polls with `xbrush_get_request`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VideoLipSyncSchema } from "../schemas/lip-sync.js";
import { submitAsync } from "../services/dispatch.js";
import { buildToolResult } from "../services/xbrush-client.js";

export function registerLipSyncTools(server: McpServer): void {
  server.registerTool(
    "xbrush_video_lip_sync",
    {
      title: "Lip-sync Video",
      description: [
        "Sync a face to speech: either a face VIDEO (pixverse-lipsync, infinite-talk) or a still",
        "portrait PHOTO animated as a talking head (fabric-1.0, fabric-1.0-fast).",
        "Speech comes from audio_url, or from built-in TTS via text + voice_id.",
        "Submits async — lip-sync generation can take 30s to several minutes. Poll with xbrush_get_request.",
        "",
        "Args:",
        "  video_url (string): Face video URL — video-driven models. Provide this OR image_url.",
        "  image_url (string): Still portrait URL — talking photo (fabric-1.0/-fast).",
        "  audio_url (string): Audio URL to drive the mouth movement. Or use text + voice_id.",
        "  text (string): Text to speak via built-in TTS (with voice_id from xbrush_list_voices).",
        "  voice_id (string): TTS voice for text.",
        "  duration (number, optional): Output seconds (1-60).",
        "  resolution (string, optional): \"480p\" or \"720p\" (720p costs more).",
        "  model (string, optional): Lip-sync model ID; which inputs are required is model-specific.",
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
      // Model-independent minimums (each server-verified for every current
      // model): some face input and some speech input must be present.
      if (args.video_url === undefined && args.image_url === undefined) {
        return buildToolResult(
          "Error: provide a face input — video_url (face video; pixverse-lipsync/infinite-talk) " +
            "or image_url (still portrait; fabric-1.0/-fast).",
          true
        );
      }
      if (args.audio_url === undefined && args.text === undefined) {
        return buildToolResult(
          "Error: provide a speech input — audio_url, or text (+ voice_id from xbrush_list_voices) " +
            "for built-in TTS.",
          true
        );
      }

      const body: Record<string, unknown> = {};
      if (args.model !== undefined) body.model = args.model;
      if (args.video_url !== undefined) body.videoUrl = args.video_url;
      if (args.image_url !== undefined) body.imageUrl = args.image_url;
      if (args.audio_url !== undefined) body.audioUrl = args.audio_url;
      if (args.text !== undefined) body.text = args.text;
      if (args.voice_id !== undefined) body.voiceId = args.voice_id;
      if (args.duration !== undefined) body.duration = args.duration;
      if (args.resolution !== undefined) body.resolution = args.resolution;

      return submitAsync({
        url: "/v1/video/lip-sync",
        body,
        label: "Lip-sync",
      });
    }
  );
}
