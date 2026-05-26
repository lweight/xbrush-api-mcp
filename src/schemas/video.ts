import { z } from "zod";

export const VideoGenerateSchema = z
  .object({
    model: z.string().describe("Video model to use (e.g. kling-v2-1-pro, wan-v2-2-14b, veo3). Use xbrush_list_models with category='video' to see options."),
    image_url: z.string().url().describe("URL of the start image (first frame). Required — video generation needs a source image."),
    prompt: z.string().optional().describe("Motion/action description for the video."),
    end_image_url: z.string().url().optional().describe("URL of the end image (last frame). Creates a transition from start to end."),
    duration: z.union([z.literal(5), z.literal(10)]).optional().describe("Video duration in seconds: 5 or 10. Default depends on model."),
    prompt_relevance: z.number().min(0).max(1).optional().describe("How closely to follow the prompt (0.0-1.0)."),
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
      .describe("Upscale model ID (e.g. realesrgan, seedvr). Server default if omitted."),
  })
  .strict();

export const VideoExtendSchema = z
  .object({
    model: z
      .string()
      .describe("Video-extend model (e.g. ltx-2.3-extend, pixverse-v6-extend). Use xbrush_list_models(category='video') and pick a model whose featureType is 'extend'."),
    video_url: z.string().url().describe("URL of the source video to extend."),
    duration: z
      .number()
      .min(1)
      .max(20)
      .describe("Seconds of new video to append (1-20)."),
  })
  .strict();

export const VideoRetakeSchema = z
  .object({
    model: z
      .string()
      .describe("Video-retake model (e.g. ltx-2.3-retake). Use xbrush_list_models(category='video') and pick a model whose featureType is 'retake'."),
    video_url: z.string().url().describe("URL of the source video to retake."),
    end_time: z
      .number()
      .min(0)
      .describe("Timestamp in seconds (>= 0) up to which the video is regenerated into a new variation."),
  })
  .strict();
