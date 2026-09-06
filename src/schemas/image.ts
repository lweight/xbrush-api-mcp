import { z } from "zod";

/**
 * Image-domain schemas.
 *
 * Field inventory re-verified live on api.xbrush.run 2026-09-06 (wrong-type
 * probe: every recognized field reports a validation error, unknown fields
 * are silently ignored — the server is not strict):
 *
 *   /v1/image/generate  model, prompt, idea, n(1-8), negativePrompt, width/height(≥256),
 *                       seed, cfg(0-20), guidanceScale(0-50), scheduler(enum: simple), sampler,
 *                       triggerWord, resolution, aspectRatio, quality(low/medium/high),
 *                       background(auto/opaque/transparent), loras[{url,weight 0-2}], webhookUrl
 *   /v1/image/edit      + imageUrl(required), imageUrls(≤9), maskUrl  (no `mode` field)
 *   /v1/image/upscale   imageUrl, upscaleFactor(1.5-4, number), targetHeight(256-8192)
 *   /v1/image/remove-background  imageUrl
 *   /v1/image/outpaint  imageUrl, canvasWidth/canvasHeight(64-4096, required), scale(0.05-4),
 *                       prompt, resolution(1K/2K/4K)           ← new dedicated endpoint
 *   /v1/image/inpaint   imageUrl, mask(required; URL / data: URL / raw base64 PNG — all three
 *                       verified), resolution(1K/2K/4K), numInferenceSteps(1-100), seed, expand(0-128)
 *   /v1/image/enhance   imageUrl, mode(string), n(1-4), seed
 *   /v1/image/layer-split imageUrl, model(enum qwen-image-layered | seedream-5.0-pro-layerize),
 *                       prompt(≤1000), size(1K/2K)
 *   /v1/image/segment-detect imageUrl, prompt(1-120)                        ← synchronous
 *   /v1/image/vision    imageUrl(https or data:image), mode(text/document)   ← synchronous OCR
 *   /v1/image/product-lookup imageUrl, language(en/ko/ja/zh), mode(grounded/fast) ← synchronous
 *
 * Trained-LoRA application (2026-07-17): /v1/image/generate and /v1/image/edit
 * accept `loras` — an array of {url, weight} objects (weight 0-2, both fields
 * required). LoRA-trainable bases (featureType lora_train): flux.1-dev,
 * qwen-image, z-image-turbo, netayume-v4, anima-base.
 */
export const LoraSpecSchema = z
  .object({
    url: z
      .string()
      .url()
      .describe("Trained LoRA weights URL (from a completed xbrush_lora_train request)."),
    weight: z
      .number()
      .min(0)
      .max(2)
      .describe("LoRA strength 0-2 (1 = trained strength)."),
  })
  .strict();

const BackgroundSchema = z
  .enum(["auto", "opaque", "transparent"])
  .describe("Background handling for models that support it (e.g. gpt-image-2 transparent PNGs): auto (default), opaque, transparent.");

export const ImageGenerateSchema = z
  .object({
    model: z.string().describe("Image model to use (e.g. z-image-turbo, flux.2-pro, seedream-5.0-pro, nano-banana-2, gpt-image-2, hunyuan-image-3.0-instruct). Use xbrush_list_models(category='image') to see available models."),
    prompt: z.string().trim().min(1).describe("Text description of the image to generate (English recommended — for other languages use idea)."),
    idea: z.string().trim().min(1).optional().describe("Non-English description (e.g. Korean); the server translates it before generation. Use prompt for English text."),
    n: z.number().int().min(1).max(8).optional().describe("Number of images to generate (1-8). Default: 1."),
    negative_prompt: z.string().optional().describe("Elements to exclude from the generated image."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096) for megapixel-based models (flux.*, z-image-turbo, etc.). Default: 1024. Resolution-based models (gpt-image-2, seedream-*, nano-banana-*) normally ignore it — but with aspect_ratio:\"custom\", gpt-image-2/-edit output exactly width×height (both required)."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096) for megapixel-based models. Default: 1024. Resolution-based models ignore it unless aspect_ratio:\"custom\" (see width)."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier for resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2). Examples: \"1K\", \"2K\", \"4K\" (nano-banana-2 also \"0.5K\"). Ignored by megapixel-based models — use width/height for those."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio for resolution-based models (e.g. \"16:9\"). gpt-image-2/-edit support 1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1 at 1K/2K — at 4K only 16:9, 9:16, 21:9, 1.91:1. Special value \"custom\" makes gpt-image-2/-edit use width×height as the exact output size (both required, each a multiple of 16, longest edge ≤3840, total pixels 655,360–8,294,400; missing dimensions or out-of-range values return 400). seedream-* / nano-banana-* accept their own sets; an unsupported value is rejected with the list of allowed ratios."),
    quality: z.enum(["low", "medium", "high"]).optional().describe("Output quality tier. Applies to byResolutionAndQuality models (gpt-image-2/-edit); higher = better and more expensive. Server default is high if omitted."),
    background: BackgroundSchema.optional(),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
    cfg: z.number().min(0).max(20).optional().describe("Classifier-free guidance scale (0-20) for diffusion models that expose it (flux.*, z-image-turbo, qwen-image, sdxl-family). Model default if omitted."),
    guidance_scale: z.number().min(0).max(50).optional().describe("Guidance scale (0-50) — alias recognized by the endpoint for models that name the parameter guidance_scale. Prefer cfg unless the model documents guidance_scale."),
    scheduler: z.string().trim().min(1).optional().describe("Diffusion scheduler name for models that expose it. Server currently accepts \"simple\" only (rejects others with the allowed list)."),
    sampler: z.string().trim().min(1).optional().describe("Sampler name for diffusion models that expose it (free-form, passed through; model-validated)."),
    trigger_word: z.string().trim().min(1).optional().describe("LoRA trigger word to prepend/inject when generating with a trained LoRA (alternative to writing it in the prompt yourself)."),
    loras: z
      .array(LoraSpecSchema)
      .min(1)
      .optional()
      .describe(
        "Apply trained LoRA(s): [{url, weight}] with the weights URL from xbrush_lora_train output " +
          "and weight 0-2. Use with a LoRA-capable base model (e.g. flux.1-dev, qwen-image, " +
          "z-image-turbo, netayume-v4, anima-base) and include the LoRA's trigger word in the prompt."
      ),
  })
  .strict();

export const ImageEditSchema = z
  .object({
    model: z.string().describe("Editing model: qwen-image-edit, nano-banana-edit, nano-banana-2-edit, nano-banana-pro-edit, seedream-4.5-edit, seedream-5.0-pro-edit, flux.2-pro-edit, hunyuan-image-3.0-instruct-edit, gpt-image-2-edit. Use xbrush_list_models(category='image'), featureType 'edit'. For outpainting use xbrush_image_outpaint (dedicated endpoint) or an outpaint model here (flux-outpaint, qwen-outpaint, flux.2-pro-outpaint)."),
    prompt: z.string().trim().min(1).describe("Text instruction describing the desired edits (English; use idea for other languages)."),
    idea: z.string().trim().min(1).optional().describe("Non-English edit instruction (server-translated). Use prompt for English."),
    image_url: z.string().url().describe("URL of the primary source image to edit (also the first reference)."),
    image_urls: z
      .array(z.string().url())
      .min(1)
      .max(9)
      .optional()
      .describe(
        "Additional reference image URLs (max 9) for models that compose from multiple references " +
          "(e.g. gpt-image-2-edit, nano-banana-edit, seedream-5.0-pro-edit). Appended after image_url, so the model receives " +
          "[image_url, ...image_urls]. Omit for single-reference edits."
      ),
    n: z.number().int().min(1).max(8).optional().describe("Number of edited images (1-8). Default: 1."),
    negative_prompt: z.string().optional().describe("Elements to exclude from the edited image."),
    mask_url: z.string().url().optional().describe("Mask image URL. White areas = edit, black areas = preserve. (For object removal / plain hole-filling without a prompt, see xbrush_image_inpaint.)"),
    mode: z
      .enum(["inpaint", "outpaint"])
      .optional()
      .describe("Deprecated hint — the endpoint no longer recognizes it (ignored server-side). The selected model determines the operation; for outpainting prefer xbrush_image_outpaint."),
    width: z.number().int().min(256).max(4096).optional().describe("Output width in pixels (256-4096) for megapixel-based models; for outpaint models, the target canvas width. Resolution-based edit models normally ignore it — but with aspect_ratio:\"custom\", gpt-image-2-edit outputs exactly width×height (both required)."),
    height: z.number().int().min(256).max(4096).optional().describe("Output height in pixels (256-4096) for megapixel-based models; for outpaint models, the target canvas height. Resolution-based edit models ignore it unless aspect_ratio:\"custom\" (see width)."),
    resolution: z.string().trim().min(1).optional().describe("Output resolution tier for resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit). Examples: \"1K\", \"2K\", \"4K\"."),
    aspect_ratio: z.string().trim().min(1).optional().describe("Aspect ratio for resolution-based edit models (e.g. \"16:9\"). gpt-image-2-edit supports 1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1 at 1K/2K — at 4K only 16:9, 9:16, 21:9, 1.91:1. Special value \"custom\" makes gpt-image-2-edit use width×height as the exact output size (both required, each a multiple of 16, longest edge ≤3840, total pixels 655,360–8,294,400). seedream-*-edit / nano-banana-*-edit accept their own sets; an unsupported value is rejected with the list of allowed ratios."),
    quality: z.enum(["low", "medium", "high"]).optional().describe("Output quality tier. Applies to byResolutionAndQuality models (gpt-image-2-edit); higher = better and more expensive. Server default is high if omitted."),
    background: BackgroundSchema.optional(),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
    guidance_scale: z.number().min(0).max(50).optional().describe("Guidance scale (0-50) for diffusion edit models that expose it."),
    sampler: z.string().trim().min(1).optional().describe("Sampler name for diffusion edit models that expose it (free-form, model-validated)."),
    loras: z
      .array(LoraSpecSchema)
      .min(1)
      .optional()
      .describe(
        "Apply trained LoRA(s): [{url, weight}] with the weights URL from xbrush_lora_train output " +
          "and weight 0-2. Use with a LoRA-capable base model and include the trigger word in the prompt."
      ),
  })
  .strict();

export const ImageUpscaleSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to upscale."),
    upscale_factor: z.number().min(1.5).max(4).optional().describe("Upscale multiplier, 1.5-4 (e.g. 2 or 4). Default: 2. Alternative: target_height."),
    target_height: z.number().int().min(256).max(8192).optional().describe("Target output height in pixels (256-8192); the server derives the factor (verified: 1408px source + target_height 2048 → 2048×2048). Use instead of upscale_factor."),
  })
  .strict();

export const ImageRemoveBgSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to remove background from."),
  })
  .strict();

const ImageResolutionTier = z
  .enum(["1K", "2K", "4K"])
  .describe("Output resolution tier: 1K, 2K, or 4K.");

export const ImageOutpaintSchema = z
  .object({
    image_url: z.string().url().describe("URL of the source image to extend."),
    canvas_width: z.number().int().min(64).max(4096).describe("Target canvas width in pixels (64-4096). The source is placed on this canvas and the new area is painted in."),
    canvas_height: z.number().int().min(64).max(4096).describe("Target canvas height in pixels (64-4096)."),
    scale: z.number().min(0.05).max(4).optional().describe("Scale applied to the source image before placing it on the canvas (0.05-4; 1 = original size). Use <1 to shrink the original and paint more surroundings."),
    prompt: z.string().trim().min(1).optional().describe("Optional description of what the extended area should contain (e.g. 'wooden table, restaurant interior')."),
    resolution: ImageResolutionTier.optional(),
  })
  .strict();

export const ImageInpaintSchema = z
  .object({
    image_url: z.string().url().describe("URL of the source image."),
    mask: z
      .string()
      .min(8)
      .describe(
        "Mask image selecting the region to inpaint (white = fill/remove, black = keep), same size as the source. Accepts a URL (https), a data:image/png;base64,… URL, or a raw base64-encoded PNG — all three verified live. Upload local masks via xbrush_file_upload and pass the URL."
      ),
    resolution: ImageResolutionTier.optional(),
    num_inference_steps: z.number().int().min(1).max(100).optional().describe("Diffusion steps (1-100). Model default if omitted."),
    seed: z.number().int().optional().describe("Random seed for reproducible results."),
    expand: z.number().int().min(0).max(128).optional().describe("Pixels to dilate the mask by (0-128) so the fill blends past hard mask edges."),
  })
  .strict();

export const ImageEnhanceSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to enhance."),
    mode: z.string().trim().min(1).optional().describe("Enhancement mode (free-form, server-validated during processing). Omit for the server default."),
    n: z.number().int().min(1).max(4).optional().describe("Number of variations (1-4). Default: 1."),
    seed: z.number().int().optional().describe("Random seed."),
  })
  .strict();

export const ImageLayerSplitSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to decompose into layers (works best on composed images: posters, product shots with text/background/subject)."),
    model: z.string().trim().min(1).optional().describe("Layer-split model: 'seedream-5.0-pro-layerize' (ByteDance, listed in xbrush_list_models, 0.55 credits at 1K / 1.1 at 2K) or 'qwen-image-layered'. Server default if omitted; other values are rejected with the allowed list."),
    prompt: z.string().trim().min(1).max(1000).optional().describe("Optional guidance on how to split (≤1000 chars), e.g. 'split into background, text, and product layers'."),
    size: z.enum(["1K", "2K"]).optional().describe("Output size tier: 1K (default) or 2K (double price)."),
  })
  .strict();

export const ImageSegmentDetectSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image to search."),
    prompt: z.string().trim().min(1).max(120).describe("What to detect, in a few words (1-120 chars), e.g. 'lettuce', 'red car', 'person wearing a hat'. Open-vocabulary."),
  })
  .strict();

export const ImageVisionSchema = z
  .object({
    image_url: z
      .string()
      .min(8)
      .describe("Image as an https URL or a data:image/...;base64 URI."),
    mode: z
      .enum(["text", "document"])
      .optional()
      .describe("OCR mode: 'text' (default — scene text) or 'document' (dense document layout). Both returned identical results on a poster in testing; pick by content type."),
  })
  .strict();

export const ImageProductLookupSchema = z
  .object({
    image_url: z.string().url().describe("URL of the image containing the product / brand to identify."),
    language: z.enum(["en", "ko", "ja", "zh"]).optional().describe("Language of the returned product names/specs: en (default), ko, ja, zh."),
    mode: z
      .enum(["fast", "grounded"])
      .optional()
      .describe("'fast' (vision model only, ~4s) or 'grounded' (adds brand/domain grounding evidence and search fields, ~7s). Both cost the same flat 0.05 credits."),
  })
  .strict();
