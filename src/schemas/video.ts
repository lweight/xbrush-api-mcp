import { z } from "zod";

export const VideoGenerateSchema = z
  .object({
    model: z.string().describe("Video model to use (e.g. kling-v2-1-pro, wan-v2-2-14b, veo3). Use xbrush_list_models with category='video' to see options."),
    image_url: z.string().url().describe("URL of the start image (first frame). Required — video generation needs a source image."),
    prompt: z.string().optional().describe("Motion/action description for the video."),
    end_image_url: z.string().url().optional().describe("URL of the end image (last frame). Creates a transition from start to end."),
    duration: z.union([z.literal(5), z.literal(10)]).optional().describe("Video duration in seconds: 5 or 10. Default depends on model."),
    prompt_relevance: z.number().min(0).max(1).optional().describe("How closely to follow the prompt (0.0-1.0)."),
    sync: z.boolean().optional().describe("If true, wait for result (may take 2-10 min). Default: false (async, poll with xbrush_get_request)."),
  })
  .strict();

export const VideoUpscaleSchema = z
  .object({
    video_url: z.string().url().describe("URL of the video to upscale."),
    scale: z
      .number()
      .int()
      .min(2)
      .max(4)
      .describe("Upscale multiplier (e.g. 2 or 4). Required."),
    model: z
      .string()
      .optional()
      .describe("Upscale model ID (e.g. RealESRGAN, seedvr). Server default if omitted."),
    sync: z.boolean().optional().describe("If true, wait for result. Default: false (async, poll with xbrush_get_request)."),
  })
  .strict();
