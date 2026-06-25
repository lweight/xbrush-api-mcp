import { z } from "zod";

export const VideoGenerateSchema = z
  .object({
    model: z.string().describe("Video model to use (e.g. kling-v2-1-pro, wan-v2-2-14b, veo3, seedance-2.0). Use xbrush_list_models with category='video' to see options."),
    image_url: z.string().url().optional().describe("URL of the start image (first frame) for image-to-video. Optional — text-to-video (prompt only) and reference-to-video (image_urls) models don't need it. The selected model decides what is required."),
    prompt: z.string().optional().describe("Motion/action description for the video. For reference-to-video (image_urls), cite the references in the prompt as @Image1, @Image2, … to direct how each one is used. Required for text-to-video when no image is supplied."),
    image_urls: z
      .array(z.string().url())
      .min(1)
      .max(15)
      .optional()
      .describe(
        "Reference image URLs for reference-to-video models (e.g. seedance-2.0 / seedance-2.0-fast). " +
          "The model composes the video from these references — pair with a prompt that cites them as @Image1, @Image2, …. " +
          "Standalone: image_url is not required when image_urls is provided. Ignored by models without a reference-image input."
      ),
    end_image_url: z.string().url().optional().describe("URL of the end image (last frame). Creates a transition from start to end. Supported by select models (e.g. kling); ignored by models without an end-frame input such as seedance-2.0."),
    duration: z.number().int().min(1).max(20).optional().describe("Video duration in seconds (integer). Valid range is model-specific — e.g. kling 5 or 10, veo3 4–8, seedance-2.0 4–15 (default 5), wan-2.7 2–15. Default depends on the model; out-of-range values are rejected by the server per model."),
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
