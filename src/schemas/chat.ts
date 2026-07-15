import { z } from "zod";

/**
 * Chat completions (LLM) schema — POST /v1/chat/completions.
 *
 * OpenAI-compatible request. Field names are passed to the API as-is (the
 * endpoint itself uses snake_case), so no camelCase mapping happens here.
 * Constraints below were reverse-engineered live from the endpoint's
 * validation errors (2026-07-15); the server normalizes `max_tokens` into
 * `max_completion_tokens` internally.
 *
 * Not exposed on purpose:
 * - `stream`: MCP stdio tools return a single result; streaming has no wire.
 * - `stop` / `tools` / `n` / `seed` / `response_format`: unrecognized by the
 *   endpoint (it silently ignores unknown fields — it is NOT strict).
 * - `max_completion_tokens`: redundant with `max_tokens`.
 */

export const ChatMessageSchema = z
  .object({
    role: z
      .enum(["system", "user", "assistant"])
      .describe("Message author: system (instructions), user, or assistant (prior model turns)."),
    content: z
      .string()
      .max(1_000_000)
      .describe("Message text (up to 1,000,000 characters)."),
  })
  .strict();

export const ChatCompletionSchema = z
  .object({
    model: z
      .string()
      .describe(
        "LLM model ID (e.g. z-ai/glm-5.2). Use xbrush_list_models with category='text' to see options and per-token pricing."
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
    reasoning_effort: z
      .enum(["none", "minimal", "high", "max"])
      .optional()
      .describe(
        "Reasoning budget for reasoning-capable models. Server default: none (fastest). " +
          "Higher efforts can exceed the ~30s gateway limit — prefer none/minimal here."
      ),
  })
  .strict();
