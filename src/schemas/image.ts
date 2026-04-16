import { z } from "zod";

export const ImageGenerateSchema = z
  .object({
    model: z.string().describe("Image model to use (e.g. z-image-turbo, flux-kontext). Use xbrush_list_models to see available models."),
    prompt: z.string().trim().min(1).describe("Text description of the image to generate."),
    n: z.number().int().min(1).max(8).optional().describe("Number of images to generate (1-8). Default: 1."),
    negative_prompt: z.string().optional().describe("Elements to exclude from the generated image."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096). Default: 1024."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096). Default: 1024."),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
  })
  .strict();

export const ImageEditSchema = z
  .object({
    model: z.string().describe("Image editing model (e.g. qwen-image-edit-re, gemini-2.5-flash-edit)."),
    prompt: z.string().trim().min(1).describe("Text instruction describing the desired edits."),
    image_url: z.string().url().describe("URL of the source image to edit."),
    n: z.number().int().min(1).max(8).optional().describe("Number of edited images (1-8). Default: 1."),
    mask_url: z.string().url().optional().describe("Mask image URL. White areas = edit, black areas = preserve."),
    mode: z
      .enum(["inpaint", "outpaint"])
      .optional()
      .describe("'inpaint' (default) edits the image in place; 'outpaint' extends the canvas using width/height."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096). For outpaint, the target canvas width."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096). For outpaint, the target canvas height."),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
  })
  .strict();

export const ImageUpscaleSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to upscale."),
    upscale_factor: z.number().int().min(2).max(4).optional().describe("Upscale multiplier: 2 or 4. Default: 2."),
  })
  .strict();

export const ImageRemoveBgSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to remove background from."),
  })
  .strict();
