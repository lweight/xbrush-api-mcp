import { z } from "zod";

/**
 * Watermark: applies the fixed XBrush watermark to a target image or video.
 * Recognized fields (2026-09-06): imageUrl | videoUrl, strength
 * (low/medium/high), webhookUrl. No custom text/logo/position.
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
    strength: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Watermark visibility: low, medium, or high. Server default if omitted."),
  })
  .strict()
  .refine((v) => v.image_url !== undefined || v.video_url !== undefined, {
    message: "Either image_url or video_url must be provided",
  });
