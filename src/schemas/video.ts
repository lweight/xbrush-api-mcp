import { z } from "zod";

/**
 * Video-domain schemas.
 *
 * /v1/video/generate field inventory (re-verified 2026-09-06 — the validation
 * layer is now one superset for every model, i.e. no longer model-aware):
 *   model, prompt, idea, imageUrl, imageUrls (string | {url, role}), duration (1-30),
 *   resolution (512p/768p/480p/720p/1080p/1440p/2160p/2k/4k),
 *   aspectRatio (auto/adaptive/16:9/9:16/1:1/4:3/3:4/21:9/custom), generateAudio,
 *   consistencyMode (overlay/advanced/auto), negativePrompt, seed, audioUrl,
 *   width/height (custom aspect), fps (24/25/48/50), steps, acceleration (none/regular/high),
 *   webhookUrl.
 * `endImageUrl` / `promptRelevance` are NOT recognized any more (silently ignored) —
 * end frames go through image_urls with role "last_frame".
 * Per-model duration ranges live in xbrush_list_models `constraints` and are
 * validated server-side (no client whitelist — false rejections are worse).
 */
export const VideoGenerateSchema = z
  .object({
    model: z.string().describe("Video model to use (e.g. seedance-2.5, seedance-2.0, kling-v3-pro, kling-v3-omni, kling-o3, veo3.1, wan-3.0-video, minimax-h3, ltx-2.3, gemini-omni-1.1-flash, hailuo-02-pro). Use xbrush_list_models with category='video' to see options, per-second pricing by resolution and per-model duration constraints."),
    image_url: z.string().url().optional().describe("URL of the start image (first frame) for image-to-video. Optional — text-to-video (prompt only) and reference-to-video (image_urls) don't need it. The selected model decides what is required."),
    prompt: z.string().optional().describe("Motion/action description in ENGLISH — sent to the model as-is. Use this when writing directly in English; for any non-English text use 'idea' instead (the server translates it). Reference an image_urls entry as @ImageN, where N is its 1-based position in the image_urls array (first_frame/last_frame count toward the position too). Provide prompt OR idea (required for text-to-video when no image is supplied)."),
    idea: z.string().optional().describe("Same purpose as prompt but for NON-English text (e.g. Korean): the server translates it before sending to the model. Use 'idea' for non-English, 'prompt' for English. Reference an image_urls entry as @ImageN, where N is its 1-based position in the image_urls array (first_frame/last_frame count toward the position too). Provide prompt OR idea."),
    negative_prompt: z.string().optional().describe("Elements/motions to avoid (models that support a negative prompt)."),
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
                  "Role of this image for reference-to-video models (seedance-2.x, kling-o3-ref, minimax-h3-ref, wan-3.0-video-ref): " +
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
        "Reference images for reference-to-video models (seedance-2.0/-fast/2.5, kling-o3-ref, minimax-h3-ref, wan-3.0-video-ref/-prime-ref). " +
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
    end_image_url: z.string().url().optional().describe("DEPRECATED — the endpoint no longer recognizes endImageUrl (silently ignored since 2026-08). To set an end frame, put it in image_urls as {url, role:'last_frame'} on a reference-capable model."),
    audio_url: z.string().url().optional().describe("Reference/driving audio URL for models that accept audio input (e.g. audio-conditioned motion or lip movement on omni models). Ignored by models without an audio input."),
    duration: z.number().int().min(1).max(30).optional().describe("Video duration in seconds (integer, 1-30 endpoint-wide). Valid range is model-specific — e.g. kling-v2 5 or 10, veo3.x 4–8, seedance-2.0 4–15, seedance-2.5 / wan-3.0 4–30 (default 5), ltx-2.3 1–20. Default depends on the model; out-of-range values are rejected by the server per model."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier: \"480p\", \"720p\", \"1080p\", \"1440p\", \"2160p\", \"2k\", \"4k\", \"512p\", \"768p\" — endpoint enum; each model supports a subset (see per-resolution prices in xbrush_list_models). Server-validated per model; ignored by models that size differently."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio: \"auto\", \"adaptive\", \"16:9\", \"9:16\", \"1:1\", \"4:3\", \"3:4\", \"21:9\", or \"custom\" (with width/height). Server-validated per model."),
    width: z.number().int().min(64).max(4096).optional().describe("Custom output width in pixels — used with aspect_ratio:\"custom\" on models that support explicit sizes."),
    height: z.number().int().min(64).max(4096).optional().describe("Custom output height in pixels — used with aspect_ratio:\"custom\"."),
    fps: z.number().int().optional().describe("Output frame rate for models that expose it: 24, 25, 48, or 50 (endpoint enum; other values are rejected)."),
    steps: z.number().int().min(1).optional().describe("Sampling steps for diffusion video models that expose it (e.g. ltx-2.3). Model default if omitted."),
    acceleration: z.enum(["none", "regular", "high"]).optional().describe("Speed/quality trade-off for models that expose it (e.g. ltx-2.3): none (best quality), regular, high (fastest)."),
    seed: z.number().int().optional().describe("Random seed for reproducibility (models that support it)."),
    generate_audio: z.boolean().optional().describe("Whether to generate audio together with the video (seedance-2.x, veo3.x, kling-v3, wan-3.0 — audio tiers cost more, see xbrush_list_models). Default is model-specific."),
    consistency_mode: z.string().trim().min(1).optional().describe("Subject/reference consistency mode for reference-to-video models (seedance-2.x): \"overlay\", \"advanced\", or \"auto\". Controls how reference images stay consistent across frames. Server-validated; omit for the model default."),
    prompt_relevance: z.number().min(0).max(1).optional().describe("DEPRECATED — not recognized by the endpoint any more (silently ignored)."),
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
      .describe("Upscale model ID: 'realesrgan' (Tencent ARC, 0.0024 credits/megapixel-frame) or 'seedvr' (ByteDance, 0.0013). Server default if omitted; other values are rejected."),
  })
  .strict();

export const VideoExtendSchema = z
  .object({
    model: z
      .string()
      .describe("Video-extend model: ltx-2.3-extend (2-20s), pixverse-v6-extend (1-15s, resolution/style options), gemini-omni-1.1-flash (3-10s). Use xbrush_list_models(category='video') and pick a model whose featureType is 'extend'."),
    video_url: z.string().url().describe("URL of the source video to extend."),
    duration: z
      .number()
      .min(1)
      .max(20)
      .describe("Seconds of new video to append (1-20; per-model range in xbrush_list_models constraints)."),
    prompt: z.string().optional().describe("English description of what should happen in the extension (models that take guidance). Use idea for non-English."),
    idea: z.string().optional().describe("Non-English extension description (server-translated)."),
    negative_prompt: z.string().optional().describe("Elements to avoid in the extension."),
    start_time: z.number().min(0).optional().describe("Timestamp (seconds, ≥0) in the source from which to continue; frames after it are discarded. Omit to extend from the end."),
    resolution: z.enum(["360p", "540p", "720p", "1080p"]).optional().describe("Output resolution for pixverse-v6-extend (360p/540p/720p/1080p; price rises with tier)."),
    generate_audio: z.boolean().optional().describe("Generate audio for the extension (pixverse-v6-extend audio tiers cost more)."),
    style: z.enum(["anime", "3d_animation", "clay", "comic", "cyberpunk"]).optional().describe("Style preset for pixverse-v6-extend."),
    seed: z.number().int().optional().describe("Random seed."),
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
      .max(40)
      .describe("Timestamp in seconds (0-40) up to which the video is regenerated into a new variation."),
    start_time: z.number().min(0).max(20).optional().describe("Timestamp in seconds (0-20) from which the retake starts; frames before it are kept. Default 0."),
    prompt: z.string().optional().describe("English guidance for the regenerated segment. Use idea for non-English."),
    idea: z.string().optional().describe("Non-English guidance (server-translated)."),
  })
  .strict();

/**
 * /v1/video/edit (2026-09, gemini-omni-1.1-flash): prompt-driven whole-video
 * transformation (restyle, color grade, remove/replace elements). Fields:
 * model, videoUrl(≤2048), prompt|idea (1-4000), audio (source/model/none).
 */
export const VideoEditSchema = z
  .object({
    model: z.string().describe("Video-edit model — currently 'gemini-omni-1.1-flash' (featureType 'video_edit' in xbrush_list_models; 0.143 credits/sec, min 1 credit-second billing)."),
    video_url: z.string().url().max(2048).describe("URL of the source video (≤2048 chars)."),
    prompt: z.string().trim().min(1).max(4000).optional().describe("English edit instruction (1-4000 chars), e.g. 'convert to black-and-white film look', 'replace the sky with a sunset'. Provide prompt or idea."),
    idea: z.string().trim().min(1).max(4000).optional().describe("Non-English edit instruction (server-translated). Provide prompt or idea."),
    audio: z.enum(["source", "model", "none"]).optional().describe("Audio track of the result: 'source' (keep the original audio), 'model' (let the model generate audio), or 'none' (silent)."),
  })
  .strict()
  .refine((v) => v.prompt !== undefined || v.idea !== undefined, {
    message: "Provide prompt (English) or idea (other languages)",
  });

/**
 * /v1/video/vision (2026-09): video understanding — whisper transcript with
 * segments + per-frame OCR. Fields: videoUrl, language (2 letters).
 */
export const VideoVisionSchema = z
  .object({
    video_url: z.string().url().describe("URL of the video to analyze."),
    language: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "two-letter language code")
      .optional()
      .describe("Two-letter language hint for the speech transcript (e.g. 'en', 'ko'). Omit for auto-detect."),
  })
  .strict();
