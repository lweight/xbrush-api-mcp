/**
 * LoRA tools: lora_train
 *
 * POST /v1/lora/train — async (202 + request_id, domain "lora", action
 * "train"). Training runs minutes-long (estimatedTimeout ~2400s); poll with
 * xbrush_get_request. The completed output carries the trained LoRA weights
 * URL, used in xbrush_image_generate / xbrush_image_edit via `loras`.
 * Failures (bad model, unreadable images) are charged then auto-refunded
 * (verified live 2026-07-17).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LoraTrainSchema } from "../schemas/lora.js";
import { submitAsync } from "../services/dispatch.js";

export function registerLoraTools(server: McpServer): void {
  server.registerTool(
    "xbrush_lora_train",
    {
      title: "Train LoRA",
      description: [
        "Train a LoRA (custom style/subject adapter) on 1-80 images for a LoRA-capable base model.",
        "Submits async — training takes minutes (estimated timeout ~40 min); poll the returned",
        "request_id with xbrush_get_request. The completed output contains the trained LoRA weights",
        "URL — pass it to xbrush_image_generate / xbrush_image_edit as loras: [{url, weight}] and",
        "include the trigger word in the prompt.",
        "COST: 2 credits per 1000 steps (server default 1000 steps = 2 credits). Failed trainings",
        "auto-refund. Note: `model` is only validated during processing, not at submit.",
        "",
        "Args:",
        "  name (string, required): Name for the trained LoRA.",
        "  image_urls (array, required): 1-80 HTTPS training image URLs (xbrush_file_upload for local files).",
        "  model (string, optional): Base model — xbrush_list_models entries with featureType 'lora_train'",
        "    (flux.1-dev, qwen-image, z-image-turbo, netayume-v4, anima-base). The worker also accepts sdxl,",
        "    animagine-xl-4.0, x-image-alpha (its error lists the supported set); unknown models fail after submit (refunded).",
        "  trigger_word (string, optional): Activation token (default \"TOK\").",
        "  steps (int, optional): 500-8000 (default 1000).",
      ].join("\n"),
      inputSchema: LoraTrainSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        name: args.name,
        imageUrls: args.image_urls,
      };
      if (args.model !== undefined) body.model = args.model;
      if (args.trigger_word !== undefined) body.triggerWord = args.trigger_word;
      if (args.steps !== undefined) body.steps = args.steps;

      return submitAsync({
        url: "/v1/lora/train",
        body,
        label: `LoRA training (${args.name})`,
      });
    }
  );
}
