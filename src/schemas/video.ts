import { z } from "zod";

export const VideoGenerateSchema = z
  .object({
    model: z.string().describe("Video model to use (e.g. kling-v3-pro, kling-o3, veo3.1, seedance-2.0, hailuo-02-pro, wan-2.7-video). Use xbrush_list_models with category='video' to see options and per-model duration constraints."),
    image_url: z.string().url().optional().describe("URL of the start image (first frame) for image-to-video. Optional — text-to-video (prompt only) and reference-to-video (image_urls) models don't need it. The selected model decides what is required."),
    prompt: z.string().optional().describe("Motion/action description in ENGLISH — sent to the model as-is. Use this when writing directly in English; for any non-English text use 'idea' instead (the server translates it). Reference an image_urls entry as @ImageN, where N is its 1-based position in the image_urls array (first_frame/last_frame count toward the position too). Provide prompt OR idea (required for text-to-video when no image is supplied)."),
    idea: z.string().optional().describe("Same purpose as prompt but for NON-English text (e.g. Korean): the server translates it before sending to the model. Use 'idea' for non-English, 'prompt' for English. Reference an image_urls entry as @ImageN, where N is its 1-based position in the image_urls array (first_frame/last_frame count toward the position too). Provide prompt OR idea."),
    image_urls: z
      .array(
        z.union([
          z.string().url(),
          z
            .object({
              url: z.string().url().describe("Reference image URL."),
              role: z
                .string()
                .optional()
                .describe(
                  "Role of this image for reference-to-video models (seedance-2.0/-fast): " +
                    "'first_frame' (start frame), 'last_frame' (end frame), or 'reference_image' (subject/style/character reference). " +
                    "Optional — omit to let the model decide. Server-validated per model (an unsupported role is rejected)."
                ),
            })
            .strict(),
        ])
      )
      .min(1)
      .max(15)
      .optional()
      .describe(
        "Reference images for reference-to-video models (e.g. seedance-2.0 / seedance-2.0-fast). " +
          "Each element is EITHER a plain URL string OR an object {url, role} where role is " +
          "'first_frame' | 'last_frame' | 'reference_image'. The {url, role} form lets a single call combine a start frame, " +
          "an end frame, and subject/style references in one list (passed through to the model as video_params.image_urls). " +
          "Standalone: image_url is not required when this is set. " +
          "NUMBERING (important): in prompt/idea, @Image1, @Image2, … refer to entries of THIS array by 1-based position " +
          "in array order, counting EVERY entry — first_frame and last_frame included, NOT only reference_image entries. " +
          "Example: image_urls=[{url, role:'last_frame'}, {url, role:'reference_image'}] → the reference is @Image2, " +
          "because last_frame occupies position 1. To make a reference @Image1, place it first in the array. " +
          "Ignored by models without a reference-image input."
      ),
    end_image_url: z.string().url().optional().describe("URL of the end image (last frame). Creates a transition from start to end. Supported by select models (e.g. kling); ignored by models without an end-frame input such as seedance-2.0."),
    duration: z.number().int().min(1).max(20).optional().describe("Video duration in seconds (integer). Valid range is model-specific — e.g. kling 5 or 10, veo3 4–8, seedance-2.0 4–15 (default 5), wan-2.7 2–15. Default depends on the model; out-of-range values are rejected by the server per model."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier for video models that support it (seedance-2.0/-fast: \"480p\", \"720p\", \"1080p\", \"1440p\", \"2160p\", \"4k\", \"512p\", \"768p\"). Server-validated per model; ignored by models that size differently. Higher tiers cost more."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio for video models that support it (seedance-2.0/-fast: \"auto\", \"adaptive\", \"16:9\", \"9:16\", \"1:1\", \"4:3\", \"3:4\", \"21:9\"). Server-validated per model."),
    generate_audio: z.boolean().optional().describe("Whether to generate audio together with the video (seedance-2.0/-fast). Default is model-specific."),
    consistency_mode: z.string().trim().min(1).optional().describe("Subject/reference consistency mode for reference-to-video models (seedance-2.0/-fast): \"overlay\", \"advanced\", or \"auto\". Controls how reference images stay consistent across frames. Server-validated; omit for the model default."),
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
