/**
 * Image tools: generate, edit, upscale, remove_bg
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only").
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageRemoveBgSchema,
} from "../schemas/image.js";
import { submitAsync } from "../services/dispatch.js";

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
        "  width (int, optional): Width in pixels (256-4096). Default: 1024.",
        "  height (int, optional): Height in pixels (256-4096). Default: 1024.",
        "  seed (int, optional): Random seed for reproducibility.",
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
      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
      };
      if (args.n !== undefined) body.n = args.n;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.width !== undefined) body.width = args.width;
      if (args.height !== undefined) body.height = args.height;
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
        "Edit an image with text instructions (inpaint/outpaint).",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  model (string, required): Edit model (e.g. qwen-image-edit-re, gemini-2.5-flash-edit).",
        "  prompt (string, required): Text instruction for the edit.",
        "  image_url (string, required): URL of the source image.",
        "  n (int, optional): Number of results (1-8). Default: 1.",
        "  mask_url (string, optional): Mask image URL (white=edit, black=preserve).",
        "  mode (string, optional): 'inpaint' (default) edits in place; 'outpaint' extends the canvas.",
        "  width (int, optional): Output width (256-4096). For outpaint, target canvas width.",
        "  height (int, optional): Output height (256-4096). For outpaint, target canvas height.",
        "  seed (int, optional): Random seed.",
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
