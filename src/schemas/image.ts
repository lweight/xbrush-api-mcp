import { z } from "zod";

export const ImageGenerateSchema = z
  .object({
    model: z.string().describe("Image model to use (e.g. z-image-turbo, flux-kontext). Use xbrush_list_models to see available models."),
    prompt: z.string().trim().min(1).describe("Text description of the image to generate."),
    n: z.number().int().min(1).max(8).optional().describe("Number of images to generate (1-8). Default: 1."),
    negative_prompt: z.string().optional().describe("Elements to exclude from the generated image."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096) for megapixel-based models (flux.*, z-image-turbo, etc.). Default: 1024. NOT supported by resolution-based models like gpt-image-2 / seedream-* / nano-banana-pro — use resolution/aspect_ratio for those."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096) for megapixel-based models. Default: 1024. NOT supported by resolution-based models (see width)."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier for resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2). Examples: \"1K\", \"2K\", \"4K\". Ignored by megapixel-based models — use width/height for those."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio for resolution-based models. Examples: \"1:1\", \"16:9\", \"9:16\", \"4:3\", \"3:4\"."),
    quality: z.enum(["low", "medium", "high"]).optional().describe("Output quality tier. Applies to byResolutionAndQuality models (gpt-image-2/-edit); higher = better and more expensive. Server default is high if omitted."),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
  })
  .strict();

export const ImageEditSchema = z
  .object({
    model: z.string().describe("Editing model. Inpaint: qwen-image-edit, nano-banana-edit. Outpaint: flux-outpaint, qwen-outpaint. Use xbrush_list_models(category='image')."),
    prompt: z.string().trim().min(1).describe("Text instruction describing the desired edits."),
    image_url: z.string().url().describe("URL of the source image to edit."),
    n: z.number().int().min(1).max(8).optional().describe("Number of edited images (1-8). Default: 1."),
    mask_url: z.string().url().optional().describe("Mask image URL. White areas = edit, black areas = preserve."),
    mode: z
      .enum(["inpaint", "outpaint"])
      .optional()
      .describe("Optional hint ('inpaint'/'outpaint'). The selected model ultimately determines the operation — pick an outpaint model to outpaint."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096) for megapixel-based models; for outpaint models, the target canvas width. NOT supported by resolution-based edit models like gpt-image-2-edit / seedream-*-edit / nano-banana-pro-edit — use resolution/aspect_ratio for those."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096) for megapixel-based models; for outpaint models, the target canvas height. NOT supported by resolution-based edit models (see width)."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier for resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit). Examples: \"1K\", \"2K\", \"4K\"."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio for resolution-based edit models. Examples: \"1:1\", \"16:9\", \"9:16\", \"4:3\", \"3:4\"."),
    quality: z.enum(["low", "medium", "high"]).optional().describe("Output quality tier. Applies to byResolutionAndQuality models (gpt-image-2-edit); higher = better and more expensive. Server default is high if omitted."),
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
