/**
 * Image tools: generate, edit, upscale, remove_bg
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only").
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageRemoveBgSchema,
} from "../schemas/image.js";
import { submitAsync } from "../services/dispatch.js";
import { buildToolResult } from "../services/xbrush-client.js";

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
const RESOLUTION_BASED_MODELS = new Set<string>([
  // byResolutionAndQuality (also accept `quality`)
  "gpt-image-2",
  "gpt-image-2-edit",
  // byResolution
  "seedream-4.0",
  "seedream-4.0-edit",
  "seedream-4.5",
  "seedream-4.5-edit",
  "nano-banana-pro",
  "nano-banana-pro-edit",
  "nano-banana-2",
  "nano-banana-2-edit",
]);

/**
 * Returns an error result if width/height were passed to a resolution-based
 * model (which would ignore them), otherwise null to continue.
 */
function rejectWidthHeightForResolutionModel(
  model: string,
  width: number | undefined,
  height: number | undefined
): CallToolResult | null {
  if (!RESOLUTION_BASED_MODELS.has(model)) return null;
  if (width === undefined && height === undefined) return null;
  return buildToolResult(
    `Error: model '${model}' sizes output by resolution tier and ignores width/height ` +
      `(they are dropped before reaching the model).\n\n` +
      `Suggestion: remove width/height and use 'resolution' (e.g. "1K", "2K", "4K") ` +
      `and/or 'aspect_ratio' (e.g. "1:1", "16:9"). gpt-image-2/-edit also accept 'quality' (low/medium/high).`,
    true
  );
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
        "  model (string, required): Model ID (e.g. z-image-turbo). Use xbrush_list_models to see options.",
        "  prompt (string, required): Text description of the image.",
        "  n (int, optional): Number of images (1-8). Default: 1.",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  width (int, optional): Width in pixels (256-4096), megapixel-based models only (flux.*, z-image-turbo, ...). Default: 1024.",
        "  height (int, optional): Height in pixels (256-4096), megapixel-based models only. Default: 1024.",
        "  resolution (string, optional): Resolution tier for resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2), e.g. \"1K\"/\"2K\"/\"4K\".",
        "  aspect_ratio (string, optional): Aspect ratio for resolution-based models, e.g. \"1:1\"/\"16:9\".",
        "  quality (string, optional): low/medium/high — gpt-image-2/-edit only.",
        "  seed (int, optional): Random seed for reproducibility.",
        "",
        "Note: resolution-based models (gpt-image-2, seedream-*, nano-banana-pro/2) ignore width/height — passing them returns an error; use resolution/aspect_ratio instead.",
      ].join("\n"),
      inputSchema: ImageGenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const rejection = rejectWidthHeightForResolutionModel(args.model, args.width, args.height);
      if (rejection) return rejection;

      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
      };
      if (args.n !== undefined) body.n = args.n;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
      if (args.quality !== undefined) body.quality = args.quality;
      if (args.seed !== undefined) body.seed = args.seed;

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
        "Edit an image with text instructions. For inpainting use an edit model; for outpainting",
        "(extending the canvas) use an outpaint model — there is no separate outpaint tool.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): Inpaint: qwen-image-edit, nano-banana-edit, seedream-4.5-edit. Outpaint: flux-outpaint, qwen-outpaint. See xbrush_list_models(category='image').",
        "  prompt (string, required): Text instruction for the edit.",
        "  image_url (string, required): URL of the source image.",
        "  n (int, optional): Number of results (1-8). Default: 1.",
        "  mask_url (string, optional): Mask image URL (white=edit, black=preserve).",
        "  mode (string, optional): Hint 'inpaint'/'outpaint'; the chosen model determines the actual operation.",
        "  width (int, optional): Output width (256-4096), megapixel/outpaint models only. For outpaint, target canvas width.",
        "  height (int, optional): Output height (256-4096), megapixel/outpaint models only. For outpaint, target canvas height.",
        "  resolution (string, optional): Resolution tier for resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit), e.g. \"1K\"/\"2K\"/\"4K\".",
        "  aspect_ratio (string, optional): Aspect ratio for resolution-based edit models, e.g. \"1:1\"/\"16:9\".",
        "  quality (string, optional): low/medium/high — gpt-image-2-edit only.",
        "  seed (int, optional): Random seed.",
        "",
        "Note: resolution-based edit models (gpt-image-2-edit, seedream-*-edit, nano-banana-pro/2-edit) ignore width/height — passing them returns an error; use resolution/aspect_ratio instead.",
      ].join("\n"),
      inputSchema: ImageEditSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const rejection = rejectWidthHeightForResolutionModel(args.model, args.width, args.height);
      if (rejection) return rejection;

      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
        imageUrl: args.image_url,
      };
      if (args.n !== undefined) body.n = args.n;
      if (args.mask_url !== undefined) body.maskUrl = args.mask_url;
      if (args.mode !== undefined) body.mode = args.mode;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
      if (args.resolution !== undefined) body.resolution = args.resolution;
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio;
      if (args.quality !== undefined) body.quality = args.quality;
      if (args.seed !== undefined) body.seed = args.seed;

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
        "Upscale an image to higher resolution.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, required): URL of the image to upscale.",
        "  upscale_factor (int, optional): 2x or 4x. Default: 2.",
      ].join("\n"),
      inputSchema: ImageUpscaleSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        imageUrl: args.image_url,
      };
      if (args.upscale_factor !== undefined) body.upscaleFactor = args.upscale_factor;

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
        "Remove the background from an image.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  image_url (string, required): URL of the image.",
      ].join("\n"),
      inputSchema: ImageRemoveBgSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      submitAsync({
        url: "/v1/image/remove-background",
        body: { imageUrl: args.image_url },
        label: "Background removal",
      })
  );
}
