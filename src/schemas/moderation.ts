import { z } from "zod";

/**
 * Content moderation: NSFW detection with automatic masking.
 * Dispatches to /v1/image/moderate or /v1/video/moderate based on the URL given,
 * so exactly one of image_url / video_url must be provided.
 * Recognized fields (2026-09-06): imageUrl + mode (mosaic) + threshold (0-1);
 * videoUrl + threshold (0-1); webhookUrl.
 */
export const ContentModerateSchema = z
  .object({
    image_url: z
      .string()
      .url()
      .optional()
      .describe("Target image URL (provide exactly one of image_url / video_url)."),
    video_url: z
      .string()
      .url()
      .optional()
      .describe("Target video URL (provide exactly one of image_url / video_url)."),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Detection threshold 0-1 (lower = stricter, masks more). Server default if omitted."),
    mode: z
      .enum(["mosaic"])
      .optional()
      .describe("Masking style for images — currently only 'mosaic' (server enum). Ignored for videos."),
  })
  .strict()
  .refine((v) => (v.image_url !== undefined) !== (v.video_url !== undefined), {
    message: "Provide exactly one of image_url or video_url",
  });
