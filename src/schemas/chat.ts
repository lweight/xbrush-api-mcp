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
 * Function calling (2026-07-16, server-announced + re-verified live on prod):
 * `tools` / `tool_choice` are now recognized (OpenAI format). The model
 * answers with finish_reason "tool_calls" and message.tool_calls whose
 * `function.arguments` is a JSON-encoded STRING. To continue, the assistant
 * message is echoed back verbatim (tool_calls included; its content may be
 * "" or null) followed by one {role:"tool", tool_call_id, content} message
 * per call — the server 400s if any tool_call is left unanswered before the
 * next user message. Server-enforced limits (clear 400s, so mirrored here
 * only where documented as contract): ≤32 functions, function name
 * ^[a-zA-Z0-9_-]{1,64}$, ≤32KB serialized tools (not client-checked).
 * Models: constraints.functionCalling in xbrush_list_models; forced
 * tool_choice is honored per constraints.forcedChoiceHonored (seed-2.0-mini
 * yes, glm-5.2 no — glm picks its own tool and the response carries a
 * top-level warnings[] entry {code:"PARAM_NOT_HONORED", param:"tool_choice"}).
 *
 * Not exposed on purpose:
 * - `stream`: MCP stdio tools return a single result; streaming has no wire.
 *   (The server also 400s stream:true outright — "stream is not supported
 *   yet" — with or without tools; re-verified 2026-07-18.)
 * - `parallel_tool_calls`: server 400s on `false` ("not supported yet") —
 *   models may emit several tool_calls per turn regardless; answer them all.
 * - `n` / `seed` / `response_format` / `logprobs` / `logit_bias` /
 *   `stream_options`: unrecognized by the endpoint (it silently ignores
 *   unknown fields — it is NOT strict). Re-checked 2026-07-15.
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

export const ChatToolCallSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe("Tool call id exactly as the model returned it (e.g. call_abc123)."),
    type: z.literal("function"),
    function: z
      .object({
        name: z.string().min(1).describe("Function name as returned by the model."),
        arguments: z
          .string()
          .describe("JSON-encoded arguments STRING (not an object), echoed back verbatim."),
      })
      .strict(),
  })
  .strict();

export const ChatMessageSchema = z
  .object({
    role: z
      .enum(["system", "user", "assistant", "tool"])
      .describe(
        "Message author: system (instructions), user, assistant (prior model turns), or tool (a function result answering an assistant tool_call)."
      ),
    content: z
      .union([
        z
          .string()
          .max(1_000_000)
          .describe(
            "Plain message text (up to 1,000,000 characters). Must be non-empty except on assistant messages that carry tool_calls."
          ),
        z
          .array(ChatContentPartSchema)
          .min(1)
          .describe(
            "Multimodal parts: {type:'text', text} and/or {type:'image_url', image_url:{url, detail?}}. " +
              "Image parts require a vision-capable model (constraints.vision in xbrush_list_models, " +
              "e.g. bytedance/seed-2.0-mini, max images per request in constraints.maxImages)."
          ),
      ])
      .nullable()
      .optional()
      .describe(
        "Message content: a plain string, or an array of text/image_url parts (vision). " +
          "Required (non-empty) on every message except an assistant message with tool_calls, " +
          "where it may be empty, null, or omitted. For role:'tool' put the function's result here " +
          "(commonly a JSON string)."
      ),
    tool_calls: z
      .array(ChatToolCallSchema)
      .min(1)
      .optional()
      .describe(
        "Assistant messages only: the tool_calls array from a prior response, echoed back VERBATIM " +
          "when returning function results."
      ),
    tool_call_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Tool messages only (required there): the id of the assistant tool_calls entry this message answers."
      ),
  })
  .strict()
  .superRefine((msg, ctx) => {
    if (msg.tool_calls && msg.role !== "assistant") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tool_calls"],
        message: "tool_calls is only valid on assistant messages.",
      });
    }
    if (msg.role === "tool" && !msg.tool_call_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tool_call_id"],
        message:
          "tool messages require tool_call_id — the id of the assistant tool_calls entry being answered.",
      });
    }
    if (msg.tool_call_id && msg.role !== "tool") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tool_call_id"],
        message: "tool_call_id is only valid on tool messages.",
      });
    }
    const isToolCallTurn = msg.role === "assistant" && (msg.tool_calls?.length ?? 0) > 0;
    if (!isToolCallTurn && (msg.content == null || msg.content === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message:
          "content is required and must be non-empty (it may be empty/null only on an assistant message that carries tool_calls).",
      });
    }
  });

export const ChatToolSchema = z
  .object({
    type: z.literal("function"),
    function: z
      .object({
        name: z
          .string()
          .regex(
            /^[a-zA-Z0-9_-]{1,64}$/,
            "function name must match ^[a-zA-Z0-9_-]{1,64}$ (server-enforced)"
          )
          .describe("Function name: 1-64 chars of letters, digits, _ or - (server-enforced)."),
        description: z
          .string()
          .optional()
          .describe("What the function does — helps the model decide when to call it."),
        parameters: z
          .record(z.unknown())
          .optional()
          .describe(
            "JSON Schema object describing the function's arguments (OpenAI format). Omit for a no-argument function."
          ),
      })
      .strict(),
  })
  .strict();

export const ChatToolChoiceSchema = z.union([
  z
    .string()
    .min(1)
    .describe(
      "'auto' (default — model decides), 'none' (suppress calls this turn), or 'required' " +
        "(must call something; may yield an empty tool_calls response if no tool fits — prefer 'auto')."
    ),
  z
    .object({
      type: z.literal("function"),
      function: z.object({ name: z.string().min(1) }).strict(),
    })
    .strict()
    .describe(
      "Force one specific function. Only models with constraints.forcedChoiceHonored obey this " +
        "(bytedance/seed-2.0-mini yes; z-ai/glm-5.2 picks its own tool and the response carries a " +
        "PARAM_NOT_HONORED warning)."
    ),
]);

export const ChatCompletionSchema = z
  .object({
    model: z
      .string()
      .describe(
        "LLM model ID (e.g. z-ai/glm-5.2, bytedance/seed-2.0-mini, google/gemini-3.1-flash-lite). " +
          "Use xbrush_list_models with category='text' to see options, per-token pricing, vision and " +
          "function-calling support, and per-model param quirks."
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
    tools: z
      .array(ChatToolSchema)
      .max(32)
      .optional()
      .describe(
        "Function definitions the model may call (OpenAI format; ≤32 functions, ≤32KB serialized). " +
          "Works on models with constraints.functionCalling in xbrush_list_models. Tool schemas are " +
          "billed as input tokens on EVERY request plus a fixed per-model overhead " +
          "(constraints.toolsFixedTokens) — omit on requests that don't need them."
      ),
    tool_choice: ChatToolChoiceSchema.optional().describe(
      "How the model may use `tools`: 'auto' (default), 'none', 'required', or " +
        "{type:'function', function:{name}} to force one function (models with " +
        "constraints.forcedChoiceHonored only — glm-5.2 ignores it with a PARAM_NOT_HONORED warning)."
    ),
  })
  .strict();
