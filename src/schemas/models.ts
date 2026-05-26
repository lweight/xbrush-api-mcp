import { z } from "zod";

/**
 * Top-level categories returned by `GET /v1/models` (as of 2026-05): four total.
 *
 * Note: outpaint, lipsync, extend, retake, moderate, music, and sound-effect are
 * *feature types* within these categories — not top-level categories. Filter by
 * category here; inspect each model's featureType in the output.
 */
export const MODEL_CATEGORIES = ["image", "video", "audio", "utility"] as const;

export const ListModelsSchema = z
  .object({
    category: z
      .enum(MODEL_CATEGORIES)
      .optional()
      .describe("Filter by top-level category: image, video, audio, or utility. Omit to list all."),
  })
  .strict();
