/**
 * Image tools: generate, edit, upscale, remove_bg, outpaint, inpaint, enhance,
 * layer_split (async) + segment_detect, vision (OCR), product_lookup (sync).
 *
 * Async tools submit and return a request_id. Callers must poll the result
 * with `xbrush_get_request`. /sync variants are intentionally not used (see
 * CLAUDE.md "Async only"). The three utility endpoints only exist
 * synchronously and answer in ~1-7s, so they return their result directly.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageRemoveBgSchema,
  ImageOutpaintSchema,
  ImageInpaintSchema,
  ImageEnhanceSchema,
  ImageLayerSplitSchema,
  ImageSegmentDetectSchema,
  ImageVisionSchema,
  ImageProductLookupSchema,
} from "../schemas/image.js";
import { callSync, submitAsync } from "../services/dispatch.js";
import { buildToolResult } from "../services/xbrush-client.js";
import { TIMEOUT_SYNC_UTILITY } from "../constants.js";
import type {
  XBrushImageVisionResponse,
  XBrushProductInfo,
  XBrushProductLookupResponse,
  XBrushSegmentDetectResponse,
} from "../types.js";

// ── Resolution-based models ───────────────────────────────────────────
// Models whose calType is `byResolution` or `byResolutionAndQuality` size
// their output by a resolution tier + aspect ratio, NOT by width/height.
// width/height are silently dropped before reaching these models (verified
// live against gpt-image-2: a 1280x768 request returned 1024x1024 and the
// model-facing payload contained no width/height). We reject width/height
// for them up front so the caller gets a clear hint instead of a silent no-op.
//
// Keep in sync with `xbrush_list_models`: add any model whose calType is
// byResolution / byResolutionAndQuality. If one is missed the only downside
// is that this pre-flight hint is skipped — the server still drops width/height.
// (Re-checked against the 2026-09-06 catalog: unchanged set.)
const RESOLUTION_BASED_MODELS = new Set<string>([
  // byResolutionAndQuality (also accept `quality`)
  "gpt-image-2",
  "gpt-image-2-edit",
  // byResolution
  "seedream-4.0",
  "seedream-4.0-edit",
  "seedream-4.5",
  "seedream-4.5-edit",
  "seedream-5.0-pro",
  "seedream-5.0-pro-edit",
  "nano-banana-pro",
  "nano-banana-pro-edit",
  "nano-banana-2",
  "nano-banana-2-edit",
]);

/**
 * Returns an error result if width/height were passed to a resolution-based
 * model (which would ignore them), otherwise null to continue.
 *
 * Exception — aspect_ratio "custom": this tells the server to honor width/height
 * as the exact requested output size instead of the resolution/aspect_ratio
 * tiers. Verified live on gpt-image-2: {width:1024,height:1152,aspect_ratio:
 * "custom"} returned exactly 1024x1152, and {1536,864} returned 1536x864.
 * (Other resolution models behave differently in custom mode — seedream-4.5
 * keeps only the ratio and rescales to ~2K, nano-banana-pro ignores it entirely
 * — so custom width/height is reliable only on gpt-image-2/-edit. We still let
 * the request through for any model and leave the per-model behavior to the
 * server; see schema/description notes.) custom requires width/height — sending
 * aspect_ratio:"custom" alone is rejected by the server with HTTP 400.
 */
function rejectWidthHeightForResolutionModel(
  model: string,
  width: number | undefined,
  height: number | undefined,
  aspectRatio: string | undefined
): CallToolResult | null {
  if (!RESOLUTION_BASED_MODELS.has(model)) return null;
  if (width === undefined && height === undefined) return null;
  if (aspectRatio === "custom") return null;
  return buildToolResult(
    `Error: model '${model}' sizes output by resolution tier and ignores width/height ` +
      `(they are dropped before reaching the model).\n\n` +
      `Suggestion: either (a) drop width/height and use 'resolution' ("1K"/"2K"/"4K") ` +
      `and/or 'aspect_ratio' ("1:1","16:9", ...), or (b) set aspect_ratio:"custom" together ` +
      `with width/height to request an exact pixel size (works precisely on gpt-image-2/-edit). ` +
      `gpt-image-2/-edit also accept 'quality' (low/medium/high).`,
    true
  );
}

const ASYNC_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

// ── Sync formatters ───────────────────────────────────────────────────

export function formatImageVision(r: XBrushImageVisionResponse): string {
  const lines: string[] = [];
  const items = r.items ?? [];
  lines.push(`# Image OCR — ${items.length} text item${items.length === 1 ? "" : "s"}`);
  if (r.imageWidth && r.imageHeight) lines.push(`Image: ${r.imageWidth}×${r.imageHeight}${r.locale ? ` · locale ${r.locale}` : ""}`);
  lines.push("");
  if (r.fullText && r.fullText.trim()) {
    lines.push("## Full text");
    lines.push("");
    lines.push(r.fullText);
    lines.push("");
  } else {
    lines.push("_No text detected._");
    lines.push("");
  }
  if (items.length > 0) {
    lines.push("## Items (bbox = [x0, y0, x1, y1] normalized 0-1)");
    for (const it of items.slice(0, 200)) {
      const bbox = Array.isArray(it.bbox) ? `[${it.bbox.map((n) => (typeof n === "number" ? n.toFixed(3) : String(n))).join(", ")}]` : "";
      const conf = typeof it.confidence === "number" ? ` (${it.confidence.toFixed(2)})` : "";
      lines.push(`- ${JSON.stringify(it.text ?? "")} ${bbox}${conf}`);
    }
    if (items.length > 200) lines.push(`- … ${items.length - 200} more`);
    lines.push("");
  }
  lines.push("---");
  if (r.creditsCharged != null) lines.push(`- **Credits charged**: ${r.creditsCharged}`);
  if (r.requestId) lines.push(`- **Request ID**: \`${r.requestId}\``);
  return lines.join("\n");
}

export function formatSegmentDetect(r: XBrushSegmentDetectResponse, prompt: string): string {
  const lines: string[] = [];
  const boxes = r.boxes ?? [];
  lines.push(`# Detect "${prompt}" — ${r.detected ? `${r.count ?? boxes.length} match${(r.count ?? boxes.length) === 1 ? "" : "es"}` : "not found"}`);
  if (r.imageWidth && r.imageHeight) lines.push(`Image: ${r.imageWidth}×${r.imageHeight} (boxes in pixels: x, y = top-left)`);
  lines.push("");
  boxes.forEach((b, i) => {
    const score = typeof b.score === "number" ? ` score ${b.score.toFixed(3)}` : "";
    lines.push(`- Box ${i + 1}: x=${b.x} y=${b.y} w=${b.width} h=${b.height}${score}`);
  });
  if (boxes.length === 0) lines.push("_No boxes returned._");
  lines.push("");
  lines.push("---");
  if (r.requestId) lines.push(`- **Request ID**: \`${r.requestId}\` (0.01 credits)`);
  return lines.join("\n");
}

function describeProduct(p: XBrushProductInfo): string {
  const parts: string[] = [];
  const brand = p.brandNameEn && p.brand && p.brandNameEn !== p.brand ? `${p.brand} (${p.brandNameEn})` : p.brand || p.brandNameEn;
  if (brand) parts.push(`brand ${brand}`);
  if (p.brandDomain) parts.push(p.brandDomain);
  if (p.categoryLabel) parts.push(p.categoryLabel);
  if (p.modelCode) parts.push(`model ${p.modelCode}`);
  if (p.releaseYear) parts.push(p.releaseYear);
  if (p.priceEstimate) parts.push(`~${p.priceEstimate}`);
  if (typeof p.confidence === "number") parts.push(`confidence ${p.confidence}`);
  let line = `**${p.productName || "(unnamed product)"}**${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
  if (p.keySpecs?.length) line += `\n  - specs: ${p.keySpecs.join("; ")}`;
  if (p.unconfirmed?.length) line += `\n  - unconfirmed: ${p.unconfirmed.join(", ")}`;
  return line;
}

export function formatProductLookup(r: XBrushProductLookupResponse): string {
  const lines: string[] = [];
  lines.push(`# Product lookup${r.mode ? ` (${r.mode})` : ""}`);
  lines.push("");
  lines.push(`- **Product present**: ${r.productPresent ? "yes" : "no"}${r.noProductReason ? ` (${r.noProductReason})` : ""}`);
  lines.push(
    `- **Brand present**: ${r.brandPresent ? "yes" : "no"}` +
      (r.brandStatus ? ` · status ${r.brandStatus}${r.brandStatusReason ? ` (${r.brandStatusReason})` : ""}` : "")
  );
  if (r.brand?.brandNameEn || r.brand?.brandId) {
    lines.push(`- **Brand**: ${r.brand.brandNameEn || r.brand.brandId}${r.brand.brandDomain ? ` — ${r.brand.brandDomain}` : ""}`);
  }
  const products = r.products?.length ? r.products : r.product ? [r.product] : [];
  if (products.length) {
    lines.push("");
    lines.push(`## Products (${products.length})`);
    lines.push("");
    products.forEach((p, i) => lines.push(`${i + 1}. ${describeProduct(p)}`));
  }
  const entities = r.visionEvidence?.entities ?? [];
  if (entities.length) {
    lines.push("");
    lines.push(`- **Vision entities**: ${entities.slice(0, 8).map((e) => `${e.name}${typeof e.score === "number" ? ` (${e.score.toFixed(2)})` : ""}`).join(", ")}`);
  }
  if (r.grounded) lines.push(`- **Grounded**: yes${r.sources?.length ? ` (${r.sources.length} sources)` : ""}`);
  lines.push("");
  lines.push("---");
  if (r.creditsCharged != null) lines.push(`- **Credits charged**: ${r.creditsCharged}`);
  if (r.requestId) lines.push(`- **Request ID**: \`${r.requestId}\``);
  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerImageTools(server: McpServer): void {
  // ── xbrush_image_generate ──────────────────────────────────────────

  server.registerTool(
    "xbrush_image_generate",
    {
      title: "Generate Image",
      description: [
        "Generate images from a text prompt using XBrush AI models.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): Model ID (e.g. z-image-turbo, flux.2-pro, seedream-5.0-pro, nano-banana-2, gpt-image-2). Use xbrush_list_models(category='image') to see options.",
        "  prompt (string, required): Text description of the image (English). Use idea for other languages.",
        "  idea (string, optional): Non-English description — server-translated before generation.",
        "  n (int, optional): Number of images (1-8). Default: 1.",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  width (int, optional): Width in pixels (256-4096). Megapixel-based models (flux.*, z-image-turbo, ...) use it directly (default 1024). Resolution-based models ignore it UNLESS aspect_ratio:\"custom\" (see aspect_ratio).",
        "  height (int, optional): Height in pixels (256-4096). Same rules as width.",
        "  resolution (string, optional): Resolution tier for resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2), e.g. \"1K\"/\"2K\"/\"4K\".",
        "  aspect_ratio (string, optional): Aspect ratio for resolution-based models. gpt-image-2/-edit: 1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1 (1K/2K); only 16:9/9:16/21:9/1.91:1 at 4K. Special value \"custom\": gpt-image-2/-edit output the exact width×height you pass (both required; each a multiple of 16, longest edge ≤3840, total pixels 655,360–8,294,400) — e.g. width:1024,height:1152,aspect_ratio:\"custom\" returns 1024×1152.",
        "  quality (string, optional): low/medium/high — gpt-image-2/-edit only (default high = most expensive).",
        "  background (string, optional): auto/opaque/transparent — models that support transparent output.",
        "  seed (int, optional): Random seed for reproducibility.",
        "  cfg (float, optional): CFG scale 0-20 (diffusion models). guidance_scale (0-50), scheduler (\"simple\"), sampler: advanced knobs for models that expose them.",
        "  trigger_word (string, optional): LoRA trigger word.",
        "  loras (array, optional): Trained LoRAs to apply — [{url, weight 0-2}] from xbrush_lora_train output; include the trigger word in the prompt (LoRA-capable bases: flux.1-dev, qwen-image, z-image-turbo, netayume-v4, anima-base).",
        "",
        "Note: resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2) ignore width/height — passing them returns an error. Exception: aspect_ratio:\"custom\" with width+height yields an EXACT pixel size on gpt-image-2/-edit (other resolution models may only keep the ratio or ignore it).",
        "Result output: imageUrls[] + imageDimensions[] (actual width/height per image).",
      ].join("\n"),
      inputSchema: ImageGenerateSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const rejection = rejectWidthHeightForResolutionModel(args.model, args.width, args.height, args.aspect_ratio);
      if (rejection) return rejection;

      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
      };
      if (args.idea !== undefined) body.idea = args.idea;
      if (args.n !== undefined) body.n = args.n;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
      if (args.quality !== undefined) body.quality = args.quality;
      if (args.background !== undefined) body.background = args.background;
      if (args.seed !== undefined) body.seed = args.seed;
      if (args.cfg !== undefined) body.cfg = args.cfg;
      if (args.guidance_scale !== undefined) body.guidanceScale = args.guidance_scale;
      if (args.scheduler !== undefined) body.scheduler = args.scheduler;
      if (args.sampler !== undefined) body.sampler = args.sampler;
      if (args.trigger_word !== undefined) body.triggerWord = args.trigger_word;
      if (args.loras !== undefined) body.loras = args.loras;

      return submitAsync({
        url: "/v1/image/generate",
        body,
        label: "Image generation",
      });
    }
  );

  // ── xbrush_image_edit ──────────────────────────────────────────────

  server.registerTool(
    "xbrush_image_edit",
    {
      title: "Edit Image",
      description: [
        "Edit an image with text instructions (instruct-edit / masked inpaint with a prompt, multi-reference composition).",
        "For canvas extension use xbrush_image_outpaint; for prompt-less object removal / hole filling use xbrush_image_inpaint.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): qwen-image-edit, nano-banana-edit, nano-banana-2-edit, seedream-4.5-edit, seedream-5.0-pro-edit, flux.2-pro-edit, hunyuan-image-3.0-instruct-edit, gpt-image-2-edit (outpaint models flux-outpaint / qwen-outpaint / flux.2-pro-outpaint also work here). See xbrush_list_models(category='image').",
        "  prompt (string, required): Text instruction for the edit (English). idea (string, optional): non-English instruction, server-translated.",
        "  image_url (string, required): URL of the primary source image (also the first reference).",
        "  image_urls (string[], optional): Up to 9 additional reference image URLs for multi-reference models (gpt-image-2-edit, nano-banana-edit, seedream-5.0-pro-edit). Model receives [image_url, ...image_urls].",
        "  n (int, optional): Number of results (1-8). Default: 1.",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  mask_url (string, optional): Mask image URL (white=edit, black=preserve).",
        "  width (int, optional): Output width (256-4096). Megapixel/outpaint models use it directly (outpaint: target canvas width). Resolution-based edit models ignore it UNLESS aspect_ratio:\"custom\" (see aspect_ratio).",
        "  height (int, optional): Output height (256-4096). Same rules as width (outpaint: target canvas height).",
        "  resolution (string, optional): Resolution tier for resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit), e.g. \"1K\"/\"2K\"/\"4K\".",
        "  aspect_ratio (string, optional): Aspect ratio for resolution-based edit models. gpt-image-2-edit: 1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1 (1K/2K); only 16:9/9:16/21:9/1.91:1 at 4K. Special value \"custom\": gpt-image-2-edit outputs the exact width×height you pass (both required; each a multiple of 16, longest edge ≤3840, total pixels 655,360–8,294,400).",
        "  quality (string, optional): low/medium/high — gpt-image-2-edit only.",
        "  background (string, optional): auto/opaque/transparent.",
        "  seed (int, optional): Random seed. guidance_scale / sampler: advanced diffusion knobs.",
        "  loras (array, optional): Trained LoRAs to apply — [{url, weight 0-2}] from xbrush_lora_train output; include the trigger word in the prompt.",
        "  mode (string, optional): deprecated, ignored by the server.",
        "",
        "Note: resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit) ignore width/height — passing them returns an error. Exception: aspect_ratio:\"custom\" with width+height yields an EXACT pixel size on gpt-image-2-edit.",
        "Note: to give multiple reference images (e.g. compose two subjects with gpt-image-2-edit), put the primary in image_url and the rest in image_urls.",
      ].join("\n"),
      inputSchema: ImageEditSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const rejection = rejectWidthHeightForResolutionModel(args.model, args.width, args.height, args.aspect_ratio);
      if (rejection) return rejection;

      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
        imageUrl: args.image_url,
      };
      if (args.idea !== undefined) body.idea = args.idea;
      if (args.image_urls !== undefined) body.imageUrls = args.image_urls;
      if (args.n !== undefined) body.n = args.n;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.mask_url !== undefined) body.maskUrl = args.mask_url;
      if (args.mode !== undefined) body.mode = args.mode;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
      if (args.quality !== undefined) body.quality = args.quality;
      if (args.background !== undefined) body.background = args.background;
      if (args.seed !== undefined) body.seed = args.seed;
      if (args.guidance_scale !== undefined) body.guidanceScale = args.guidance_scale;
      if (args.sampler !== undefined) body.sampler = args.sampler;
      if (args.loras !== undefined) body.loras = args.loras;

      return submitAsync({
        url: "/v1/image/edit",
        body,
        label: "Image edit",
      });
    }
  );

  // ── xbrush_image_upscale ───────────────────────────────────────────

  server.registerTool(
    "xbrush_image_upscale",
    {
      title: "Upscale Image",
      description: [
        "Upscale an image to higher resolution (model 'upscaler', 0.0021 credits/megapixel of output).",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, required): URL of the image to upscale.",
        "  upscale_factor (number, optional): 1.5-4 (e.g. 2 or 4). Default: 2.",
        "  target_height (int, optional): Target height in pixels (256-8192) instead of a factor — the server derives the scale.",
      ].join("\n"),
      inputSchema: ImageUpscaleSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        imageUrl: args.image_url,
      };
      if (args.upscale_factor !== undefined) body.upscaleFactor = args.upscale_factor;
      if (args.target_height !== undefined) body.targetHeight = args.target_height;

      return submitAsync({
        url: "/v1/image/upscale",
        body,
        label: "Image upscale",
      });
    }
  );

  // ── xbrush_image_remove_bg ─────────────────────────────────────────

  server.registerTool(
    "xbrush_image_remove_bg",
    {
      title: "Remove Background",
      description: [
        "Remove the background from an image (model 'remover', 0.0069 credits/megapixel; output is a transparent PNG).",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, required): URL of the image.",
      ].join("\n"),
      inputSchema: ImageRemoveBgSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) =>
      submitAsync({
        url: "/v1/image/remove-background",
        body: { imageUrl: args.image_url },
        label: "Background removal",
      })
  );

  // ── xbrush_image_outpaint ──────────────────────────────────────────

  server.registerTool(
    "xbrush_image_outpaint",
    {
      title: "Outpaint Image",
      description: [
        "Extend an image beyond its borders onto a larger canvas (dedicated /v1/image/outpaint endpoint; the",
        "source is placed on a canvas_width×canvas_height canvas and the empty area is painted in).",
        "Submits async — poll the returned request_id with xbrush_get_request (~40s measured). Output: imageUrls[] at exactly the canvas size.",
        "",
        "Args:",
        "  image_url (string, required): Source image URL.",
        "  canvas_width (int, required): Target canvas width (64-4096).",
        "  canvas_height (int, required): Target canvas height (64-4096).",
        "  scale (float, optional): Source scale before placement (0.05-4; <1 shrinks the original to paint more surroundings).",
        "  prompt (string, optional): What the new area should show.",
        "  resolution (string, optional): 1K / 2K / 4K.",
      ].join("\n"),
      inputSchema: ImageOutpaintSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        imageUrl: args.image_url,
        canvasWidth: args.canvas_width,
        canvasHeight: args.canvas_height,
      };
      if (args.scale !== undefined) body.scale = args.scale;
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      return submitAsync({ url: "/v1/image/outpaint", body, label: "Image outpaint" });
    }
  );

  // ── xbrush_image_inpaint ───────────────────────────────────────────

  server.registerTool(
    "xbrush_image_inpaint",
    {
      title: "Inpaint Image (mask fill / object removal)",
      description: [
        "Fill or remove the masked region of an image without a text prompt (dedicated /v1/image/inpaint",
        "endpoint — content-aware fill). For prompt-guided edits inside a mask use xbrush_image_edit with mask_url.",
        "Submits async — poll the returned request_id with xbrush_get_request. Output: imageUrls[] at the source size.",
        "",
        "Args:",
        "  image_url (string, required): Source image URL.",
        "  mask (string, required): Mask image (white = fill/remove, black = keep, same size as the source) as an https URL,",
        "    a data:image/png;base64,… URL, or a raw base64 PNG string — all three accepted.",
        "  resolution (string, optional): 1K / 2K / 4K.",
        "  num_inference_steps (int, optional): 1-100.",
        "  seed (int, optional): Random seed.",
        "  expand (int, optional): Dilate the mask by 0-128 px for softer blending.",
      ].join("\n"),
      inputSchema: ImageInpaintSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        imageUrl: args.image_url,
        mask: args.mask,
      };
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.num_inference_steps !== undefined) body.numInferenceSteps = args.num_inference_steps;
      if (args.seed !== undefined) body.seed = args.seed;
      if (args.expand !== undefined) body.expand = args.expand;
      return submitAsync({ url: "/v1/image/inpaint", body, label: "Image inpaint" });
    }
  );

  // ── xbrush_image_enhance ───────────────────────────────────────────

  server.registerTool(
    "xbrush_image_enhance",
    {
      title: "Enhance Image",
      description: [
        "AI enhancement pass over an image (/v1/image/enhance — detail/quality restoration; up to 4 variations).",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "CAVEAT (2026-09-06): both test jobs on this endpoint failed with GENERATION_TIMEOUT after 600s and were not",
        "charged — treat it as experimental; if a job fails, fall back to xbrush_image_upscale or xbrush_media_image_process",
        "(sharpen / detail_enhance / denoise).",
        "",
        "Args:",
        "  image_url (string, required): Source image URL.",
        "  mode (string, optional): Enhancement mode (server-validated; omit for default).",
        "  n (int, optional): Variations (1-4).",
        "  seed (int, optional): Random seed.",
      ].join("\n"),
      inputSchema: ImageEnhanceSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = { imageUrl: args.image_url };
      if (args.mode !== undefined) body.mode = args.mode;
      if (args.n !== undefined) body.n = args.n;
      if (args.seed !== undefined) body.seed = args.seed;
      return submitAsync({ url: "/v1/image/enhance", body, label: "Image enhance" });
    }
  );

  // ── xbrush_image_layer_split ───────────────────────────────────────

  server.registerTool(
    "xbrush_image_layer_split",
    {
      title: "Split Image into Layers",
      description: [
        "Decompose a composed image (poster, product shot, banner) into editable layers — e.g. background /",
        "product / text — each returned as a separate PNG with its bounding box and a description",
        "(model seedream-5.0-pro-layerize: 0.55 credits at 1K, 1.1 at 2K).",
        "Submits async — poll the returned request_id with xbrush_get_request (~1 min). Output: layers[] {name, zIndex,",
        "boundingBox.absolute [x0,y0,x1,y1], description} aligned with imageUrls[] (index 0 = full composite/base).",
        "Simple photos without separable elements may be rejected by the vendor (refunded).",
        "",
        "Args:",
        "  image_url (string, required): Source image URL.",
        "  model (string, optional): seedream-5.0-pro-layerize (default) or qwen-image-layered.",
        "  prompt (string, optional): How to split, e.g. 'background, text, and product layers' (≤1000 chars).",
        "  size (string, optional): 1K (default) or 2K.",
      ].join("\n"),
      inputSchema: ImageLayerSplitSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = { imageUrl: args.image_url };
      if (args.model !== undefined) body.model = args.model;
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.size !== undefined) body.size = args.size;
      return submitAsync({ url: "/v1/image/layer-split", body, label: "Image layer split" });
    }
  );

  // ── xbrush_image_segment_detect (sync) ─────────────────────────────

  server.registerTool(
    "xbrush_image_segment_detect",
    {
      title: "Detect Objects in Image",
      description: [
        "Open-vocabulary object detection: find where a described thing is in an image and return pixel",
        "bounding boxes with scores (0.01 credits). SYNCHRONOUS — returns the boxes directly (~3s), no polling.",
        "Use the boxes to build masks for xbrush_image_inpaint or crops for xbrush_media_image_process.",
        "",
        "Args:",
        "  image_url (string, required): Image URL.",
        "  prompt (string, required): What to find (1-120 chars), e.g. 'lettuce', 'red car', 'face'.",
      ].join("\n"),
      inputSchema: ImageSegmentDetectSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      callSync<XBrushSegmentDetectResponse>({
        method: "POST",
        url: "/v1/image/segment-detect",
        body: { imageUrl: args.image_url, prompt: args.prompt },
        timeout: TIMEOUT_SYNC_UTILITY,
        format: (r) => formatSegmentDetect(r, args.prompt),
      })
  );

  // ── xbrush_image_vision (sync OCR) ─────────────────────────────────

  server.registerTool(
    "xbrush_image_vision",
    {
      title: "Image OCR (Vision)",
      description: [
        "Extract text from an image (OCR) with per-item normalized bounding boxes, the full text and the",
        "detected locale (0.003 credits). SYNCHRONOUS — returns the text directly (~1-2s), no polling.",
        "For describing image content or answering questions about it, use xbrush_chat with a vision model instead.",
        "",
        "Args:",
        "  image_url (string, required): https URL or data:image/...;base64 URI.",
        "  mode (string, optional): 'text' (default) or 'document'.",
      ].join("\n"),
      inputSchema: ImageVisionSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = { imageUrl: args.image_url };
      if (args.mode !== undefined) body.mode = args.mode;
      return callSync<XBrushImageVisionResponse>({
        method: "POST",
        url: "/v1/image/vision",
        body,
        timeout: TIMEOUT_SYNC_UTILITY,
        format: formatImageVision,
      });
    }
  );

  // ── xbrush_image_product_lookup (sync) ─────────────────────────────

  server.registerTool(
    "xbrush_image_product_lookup",
    {
      title: "Identify Product / Brand in Image",
      description: [
        "Identify the product(s) and brand shown in an image — product name, category, model code, key specs,",
        "brand domain and confidence (flat 0.05 credits). SYNCHRONOUS — returns the result directly (~4-7s).",
        "",
        "Args:",
        "  image_url (string, required): Image URL.",
        "  language (string, optional): en (default) / ko / ja / zh for the returned names.",
        "  mode (string, optional): 'fast' (vision only) or 'grounded' (adds brand grounding evidence).",
      ].join("\n"),
      inputSchema: ImageProductLookupSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = { imageUrl: args.image_url };
      if (args.language !== undefined) body.language = args.language;
      if (args.mode !== undefined) body.mode = args.mode;
      return callSync<XBrushProductLookupResponse>({
        method: "POST",
        url: "/v1/image/product-lookup",
        body,
        timeout: TIMEOUT_SYNC_UTILITY,
        format: formatProductLookup,
      });
    }
  );
}
