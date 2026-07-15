import { z } from "zod";

/**
 * Chat completions (LLM) schema — POST /v1/chat/completions.
 *
 * OpenAI-compatible request. Field names are passed to the API as-is (the
 * endpoint itself uses snake_case), so no camelCase mapping happens here.
 * Constraints below were reverse-engineered live from the endpoint's
 * validation errors (2026-07-15, re-surveyed same day for the vision update);
 * the server normalizes `max_tokens` into `max_completion_tokens` internally.
 *
 * Vision (2026-07 update): `content` accepts either a plain string or an
 * array of parts. Recognized part types are exactly `text` and `image_url`
 * ("unknown content part type" otherwise). Image inputs work only on models
 * whose constraints report vision:true (see xbrush_list_models category
 * 'text'); non-vision models reject image parts at submit time (400, no
 * billing). Both https URLs and data: URLs are accepted (no host allowlist
 * on this endpoint, unlike the media endpoints). Upstream vendor limits:
 * min image dimension 14px, at most `constraints.maxImages` images per
 * request — both validated server-side with clear errors, so no client
 * whitelist here. `image_url.detail` is passed through to the vendor
 * (low/high/auto, OpenAI-style) and strongly affects billing: measured
 * prompt_tokens ~98 with low vs ~1,390-1,396 with high/auto/omitted on
 * seed-2.0-mini. Kept as free-form string — the vendor validates values.
 *
 * Not exposed on purpose:
 * - `stream`: MCP stdio tools return a single result; streaming has no wire.
 * - `tools` / `n` / `seed` / `response_format` / `logprobs` / `logit_bias` /
 *   `tool_choice` / `stream_options`: unrecognized by the endpoint (it
 *   silently ignores unknown fields — it is NOT strict). Re-checked
 *   2026-07-15: still ignored. `stop` graduated to a recognized, validated
 *   field and is exposed below.
 * - `max_completion_tokens`: redundant with `max_tokens`.
 */

export const ChatTextPartSchema = z
  .object({
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(1_000_000)
      .describe("Text content (non-empty, up to 1,000,000 characters)."),
  })
  .strict();

export const ChatImageUrlPartSchema = z
  .object({
    type: z.literal("image_url"),
    image_url: z
      .object({
        url: z
          .string()
          .min(1)
          .describe(
            "Image as an https URL or a data: URL (base64). Minimum dimension 14px. " +
              "Upload local files first with xbrush_file_upload and pass the CDN URL."
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "Vision fidelity vs. cost, passed through to the model vendor: 'low', 'high', or 'auto'. " +
              "'low' is drastically cheaper (~98 prompt tokens vs ~1,400 per image on seed-2.0-mini); " +
              "omitted = vendor default (high-tier cost)."
          ),
      })
      .strict(),
  })
  .strict();

export const ChatContentPartSchema = z.discriminatedUnion("type", [
  ChatTextPartSchema,
  ChatImageUrlPartSchema,
]);

export const ChatMessageSchema = z
  .object({
    role: z
      .enum(["system", "user", "assistant"])
      .describe("Message author: system (instructions), user, or assistant (prior model turns)."),
    content: z
      .union([
        z
          .string()
          .min(1)
          .max(1_000_000)
          .describe("Plain message text (non-empty, up to 1,000,000 characters)."),
        z
          .array(ChatContentPartSchema)
          .min(1)
          .describe(
            "Multimodal parts: {type:'text', text} and/or {type:'image_url', image_url:{url, detail?}}. " +
              "Image parts require a vision-capable model (constraints.vision in xbrush_list_models, " +
              "e.g. bytedance/seed-2.0-mini, max images per request in constraints.maxImages)."
          ),
      ])
      .describe("Message content: a plain string, or an array of text/image_url parts (vision)."),
  })
  .strict();

export const ChatCompletionSchema = z
  .object({
    model: z
      .string()
      .describe(
        "LLM model ID (e.g. z-ai/glm-5.2, bytedance/seed-2.0-mini). Use xbrush_list_models with " +
          "category='text' to see options, per-token pricing, and vision support."
      ),
    messages: z
      .array(ChatMessageSchema)
      .min(1)
      .max(1000)
      .describe("Conversation so far, oldest first (1-1000 messages). The completion answers the last user message."),
    max_tokens: z
      .number()
      .int()
      .min(1)
      .max(65536)
      .optional()
      .describe(
        "Upper bound on generated tokens (1-65536), reasoning included. Keep modest — the response must finish within the ~30s gateway limit."
      ),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe("Sampling temperature (0-2). Higher = more random."),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Nucleus sampling probability mass (0-1)."),
    frequency_penalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Penalize frequent tokens (-2 to 2)."),
    presence_penalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Penalize tokens already present (-2 to 2)."),
    stop: z
      .union([
        z.string().min(1).describe("A single stop sequence (non-empty)."),
        z
          .array(z.string().min(1))
          .min(1)
          .max(4)
          .describe("1-4 stop sequences (non-empty strings)."),
      ])
      .optional()
      .describe(
        "Stop sequence(s): generation halts before emitting any of these. A non-empty string or an array of 1-4."
      ),
    reasoning_effort: z
      .enum(["none", "minimal", "high", "max"])
      .optional()
      .describe(
        "Reasoning budget for reasoning-capable models. Server default: none (fastest). " +
          "Higher efforts can exceed the ~30s gateway limit — prefer none/minimal here."
      ),
  })
  .strict();
