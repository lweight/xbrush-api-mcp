import { z } from "zod";

/**
 * Top-level categories returned by `GET /v1/models` as of 2026-04.
 * Music, sound-effect, lip-sync, and watermark are *feature types* (not top-level
 * categories); their models fall under one of these three.
 */
export const MODEL_CATEGORIES = ["image", "video", "audio"] as const;

export const ListModelsSchema = z
  .object({
    category: z
      .enum(MODEL_CATEGORIES)
      .optional()
      .describe("Filter by top-level category (image, video, audio). Omit to list all."),
  })
  .strict();
