/**
 * Image tools: generate, edit, upscale, remove_bg
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageRemoveBgSchema,
} from "../schemas/image.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_SYNC, TIMEOUT_ASYNC_POST } from "../constants.js";
import type { XBrushSyncResponse, XBrushAsyncResponse } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function formatSyncResult(r: XBrushSyncResponse, label: string): string {
  const lines: string[] = [];
  lines.push(`${label} completed.`);
  lines.push("");
  lines.push(`- **Request ID**: ${r.requestId}`);
  lines.push(`- **Credits charged**: ${r.creditCharged}`);

  if (r.output.imageUrls?.length) {
    lines.push(`- **Images** (${r.output.imageUrls.length}):`);
    r.output.imageUrls.forEach((url, i) => {
      lines.push(`  ${i + 1}. ${url}`);
    });
  }

  return lines.join("\n");
}

function formatAsyncResult(r: XBrushAsyncResponse, label: string): string {
  const lines: string[] = [];
  lines.push(`${label} submitted (async).`);
  lines.push("");
  lines.push(`- **Request ID**: \`${r.requestId}\``);
  lines.push(`- **Status**: ${r.status}`);
  lines.push(`- **Credits charged**: ${r.creditCharged}`);
  lines.push(`- **Estimated time**: ~${r.estimatedTimeout}s`);
  lines.push("");
  lines.push(`Use \`xbrush_get_request\` with request_id \`${r.requestId}\` to check the result.`);

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerImageTools(server: McpServer): void {
  // ── xbrush_image_generate (sync) ────────────────────────────────────

  server.registerTool(
    "xbrush_image_generate",
    {
      title: "Generate Image",
      description: [
        "Generate images from a text prompt using XBrush AI models.",
        "By default sync (returns URLs directly). Set sync=false for async.",
        "",
        "Args:",
        "  model (string, required): Model ID (e.g. z-image-turbo). Use xbrush_list_models to see options.",
        "  prompt (string, required): Text description of the image.",
        "  n (int, optional): Number of images (1-8). Default: 1.",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  width (int, optional): Width in pixels (256-4096). Default: 1024.",
        "  height (int, optional): Height in pixels (256-4096). Default: 1024.",
        "  seed (int, optional): Random seed for reproducibility.",
        "  sync (bool, optional): Default: true. Set false for async.",
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
      try {
        const body: Record<string, unknown> = {
          model: args.model,
          prompt: args.prompt,
        };
        if (args.n !== undefined) body.n = args.n;
        if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
        if (args.width !== undefined) body.width = args.width;
        if (args.height !== undefined) body.height = args.height;
        if (args.seed !== undefined) body.seed = args.seed;

        const useSync = args.sync !== false;

        if (useSync) {
          const response = await makeApiRequest<XBrushSyncResponse>({
            method: "POST",
            url: "/v1/image/generate/sync",
            data: body,
            timeout: TIMEOUT_SYNC,
          });
          return buildToolResult(formatSyncResult(response, "Image generation"));
        } else {
          const response = await makeApiRequest<XBrushAsyncResponse>({
            method: "POST",
            url: "/v1/image/generate",
            data: body,
            timeout: TIMEOUT_ASYNC_POST,
          });
          return buildToolResult(formatAsyncResult(response, "Image generation"));
        }
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_image_edit (default async) ──────────────────────────────

  server.registerTool(
    "xbrush_image_edit",
    {
      title: "Edit Image",
      description: [
        "Edit an image with text instructions (inpaint/outpaint).",
        "By default async. Set sync=true to wait for result directly.",
        "",
        "Args:",
        "  model (string, required): Edit model (e.g. qwen-image-edit-re, gemini-2.5-flash-edit).",
        "  prompt (string, required): Text instruction for the edit.",
        "  image_url (string, required): URL of the source image.",
        "  n (int, optional): Number of results (1-8). Default: 1.",
        "  mask_url (string, optional): Mask image URL (white=edit, black=preserve).",
        "  width (int, optional): Output width (256-4096).",
        "  height (int, optional): Output height (256-4096).",
        "  seed (int, optional): Random seed.",
        "  sync (bool, optional): Default: false. Set true for sync.",
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
      try {
        const body: Record<string, unknown> = {
          model: args.model,
          prompt: args.prompt,
          imageUrl: args.image_url,
        };
        if (args.n !== undefined) body.n = args.n;
        if (args.mask_url !== undefined) body.maskUrl = args.mask_url;
        if (args.width !== undefined) body.width = args.width;
        if (args.height !== undefined) body.height = args.height;
        if (args.seed !== undefined) body.seed = args.seed;

        const useSync = args.sync === true;

        if (useSync) {
          const response = await makeApiRequest<XBrushSyncResponse>({
            method: "POST",
            url: "/v1/image/edit/sync",
            data: body,
            timeout: TIMEOUT_SYNC,
          });
          return buildToolResult(formatSyncResult(response, "Image edit"));
        } else {
          const response = await makeApiRequest<XBrushAsyncResponse>({
            method: "POST",
            url: "/v1/image/edit",
            data: body,
            timeout: TIMEOUT_ASYNC_POST,
          });
          return buildToolResult(formatAsyncResult(response, "Image edit"));
        }
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_image_upscale (default async) ───────────────────────────

  server.registerTool(
    "xbrush_image_upscale",
    {
      title: "Upscale Image",
      description: [
        "Upscale an image to higher resolution.",
        "By default async. Set sync=true to wait for result directly.",
        "",
        "Args:",
        "  image_url (string, required): URL of the image to upscale.",
        "  upscale_factor (int, optional): 2x or 4x. Default: 2.",
        "  sync (bool, optional): Default: false. Set true for sync.",
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
      try {
        const body: Record<string, unknown> = {
          imageUrl: args.image_url,
        };
        if (args.upscale_factor !== undefined) body.upscaleFactor = args.upscale_factor;

        const useSync = args.sync === true;

        if (useSync) {
          const response = await makeApiRequest<XBrushSyncResponse>({
            method: "POST",
            url: "/v1/image/upscale/sync",
            data: body,
            timeout: TIMEOUT_SYNC,
          });
          return buildToolResult(formatSyncResult(response, "Image upscale"));
        } else {
          const response = await makeApiRequest<XBrushAsyncResponse>({
            method: "POST",
            url: "/v1/image/upscale",
            data: body,
            timeout: TIMEOUT_ASYNC_POST,
          });
          return buildToolResult(formatAsyncResult(response, "Image upscale"));
        }
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_image_remove_bg (sync) ───────────────────────────────────

  server.registerTool(
    "xbrush_image_remove_bg",
    {
      title: "Remove Background",
      description: [
        "Remove the background from an image.",
        "Returns the result image URL directly (sync).",
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
    async (args) => {
      try {
        const response = await makeApiRequest<XBrushSyncResponse>({
          method: "POST",
          url: "/v1/image/remove-background/sync",
          data: { imageUrl: args.image_url },
          timeout: TIMEOUT_SYNC,
        });

        return buildToolResult(formatSyncResult(response, "Background removal"));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
