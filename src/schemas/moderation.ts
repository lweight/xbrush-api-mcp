import { z } from "zod";

/**
 * Content moderation: NSFW detection with automatic masking.
 * Dispatches to /v1/image/moderate or /v1/video/moderate based on the URL given,
 * so exactly one of image_url / video_url must be provided.
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
  })
  .strict()
  .refine((v) => (v.image_url !== undefined) !== (v.video_url !== undefined), {
    message: "Provide exactly one of image_url or video_url",
  });
