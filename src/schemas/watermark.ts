import { z } from "zod";

/**
 * Watermark: applies a fixed XBrush watermark to a target image or video.
 * Server does not accept user-supplied text, logo, position, opacity, etc.
 */
export const WatermarkAddSchema = z
  .object({
    image_url: z
      .string()
      .url()
      .optional()
      .describe("Target image URL (use either image_url or video_url)."),
    video_url: z
      .string()
      .url()
      .optional()
      .describe("Target video URL (use either image_url or video_url)."),
  })
  .strict()
  .refine((v) => v.image_url !== undefined || v.video_url !== undefined, {
    message: "Either image_url or video_url must be provided",
  });
