import { z } from "zod";

/**
 * Video lip-sync: overlays speech from `audio_url` onto a face video.
 * Reference model: pixverse.
 */
export const VideoLipSyncSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe("Lip-sync model ID (e.g. pixverse). Defaults to the server's default model."),
    video_url: z
      .string()
      .url()
      .describe("URL of the source video (face must be visible)."),
    audio_url: z
      .string()
      .url()
      .describe("URL of the audio to lip-sync onto the video."),
  })
  .strict();
