import { z } from "zod";

export const ListModelsSchema = z
  .object({
    category: z
      .enum(["image", "video", "audio"])
      .optional()
      .describe("Filter by category. Omit to list all models."),
  })
  .strict();
