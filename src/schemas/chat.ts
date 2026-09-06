import { z } from "zod";

/**
 * Chat completions (LLM) schema — POST /v1/chat/completions.
 *
 * OpenAI-compatible request. Field names are passed to the API as-is (the
 * endpoint itself uses snake_case), so no camelCase mapping happens here.
 * Constraints were reverse-engineered live from the endpoint's validation
 * errors (2026-07-15, re-surveyed 2026-09-06); the server normalizes
 * `max_tokens` into `max_completion_tokens` internally.
 *
 * Recognized fields (2026-09-06): model, messages, max_tokens /
 * max_completion_tokens (1-65536), temperature (0-2), top_p (0-1),
 * frequency_penalty / presence_penalty (-2..2), stop, reasoning_effort
 * (none/minimal/low/medium/high/max — low & medium are new), tools,
 * tool_choice, parallel_tool_calls (false → 400), stream (true → 400 pointing
 * at POST /v1/stream/chat/completions), response_format (json_object |
 * json_schema — NEW). Still unrecognized/ignored: n, seed, logprobs,
 * top_logprobs, logit_bias, user, metadata, stream_options.
 *
 * Model lineup (12, GET /v1/models/text): z-ai/glm-5.2, bytedance/seed-2.0-mini,
 * bytedance/seed-2.1-turbo, google/gemini-3.1-flash-lite, google/gemini-3.5-flash-lite,
 * anthropic/claude-sonnet-5, anthropic/claude-opus-5, deepseek/deepseek-v4-flash,
 * openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5.4, xai/grok-4.3. Per-model
 * parameter quirks are published as `constraints` flags and, when a parameter
 * is dropped/adjusted, reported in the response's top-level `warnings[]`
 * (PARAM_DROPPED / PARAM_ADJUSTED / PARAM_NOT_HONORED) instead of erroring.
 *
 * Vision: `content` accepts a plain string or an array of parts. Recognized
 * part types are exactly `text` and `image_url` (input_audio / video_url /
 * file → "unknown content part type"). Image inputs work only on models whose
 * constraints report vision:true; both https and data: URLs are accepted.
 * `image_url.detail` (low/high/auto) is passed through; it changes billing on
 * models with imageDetailHonored (OpenAI) and measurably on seed-2.0-mini too
 * (~98 vs ~1,390 prompt tokens).
 *
 * Function calling (2026-07-16): `tools` / `tool_choice` OpenAI format; the
 * model answers with finish_reason "tool_calls" and message.tool_calls whose
 * `function.arguments` is a JSON-encoded STRING. Echo the assistant message
 * back verbatim followed by one {role:"tool", tool_call_id, content} per call.
 * Limits: ≤32 functions, name ^[a-zA-Z0-9_-]{1,64}$, ≤32KB serialized.
 *
 * Not exposed on purpose:
 * - `stream`: MCP stdio tools return a single result (the sync path 400s
 *   stream:true and points at /v1/stream/chat/completions — an SSE endpoint
 *   that has no place in a stdio tool).
 * - `parallel_tool_calls`: server 400s on `false` ("not supported yet").
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
              "'low' is drastically cheaper (~98 prompt tokens vs ~1,400 per image on seed-2.0-mini; " +
              "honored for billing on OpenAI models — constraints.imageDetailHonored); omitted = vendor default (high-tier cost)."
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
        "Message author: system (instructions), user, assistant (prior model turns), or tool (a function result answering an assistant tool_call). ('developer' is not accepted.)"
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
              "Image parts require a vision-capable model (constraints.vision in xbrush_list_models — all current models except glm-5.2 and deepseek-v4-flash; max images per request in constraints.maxImages)."
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
        "(every current model except z-ai/glm-5.2, which picks its own tool and the response carries a " +
        "PARAM_NOT_HONORED warning)."
    ),
]);

/**
 * response_format (new 2026-09): {type:"json_object"} or
 * {type:"json_schema", json_schema:{name, schema, strict?, description?}}.
 * The gateway validates the shape (400 "response_format.type must be
 * json_object or json_schema" / "requires a json_schema object"); the vendor
 * validates the schema itself (e.g. OpenAI requires json_schema.name → 400
 * INVALID_INPUT with the upstream message). Applied only on models whose
 * constraints report structuredOutputHonored (OpenAI gpt-4o/-mini/gpt-5.4,
 * gemini-3.5-flash-lite); others ignore it with a PARAM_DROPPED warning
 * (verified: seed-2.0-mini, glm-5.2 still answered JSON-ish text).
 */
export const ChatResponseFormatSchema = z.union([
  z
    .object({ type: z.literal("json_object") })
    .strict()
    .describe("Ask for a syntactically valid JSON object (also mention JSON in the prompt)."),
  z
    .object({
      type: z.literal("json_schema"),
      json_schema: z
        .object({
          name: z.string().min(1).describe("Schema name (required by OpenAI-compatible vendors)."),
          schema: z.record(z.unknown()).optional().describe("JSON Schema the output must conform to."),
          strict: z.boolean().optional().describe("Strict schema adherence (OpenAI structured outputs)."),
          description: z.string().optional(),
        })
        .strict(),
    })
    .strict()
    .describe("Constrain the output to a JSON Schema (structured outputs)."),
]);

export const ChatCompletionSchema = z
  .object({
    model: z
      .string()
      .describe(
        "LLM model ID: z-ai/glm-5.2, bytedance/seed-2.0-mini, bytedance/seed-2.1-turbo, google/gemini-3.1-flash-lite, " +
          "google/gemini-3.5-flash-lite, anthropic/claude-sonnet-5, anthropic/claude-opus-5, deepseek/deepseek-v4-flash, " +
          "openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5.4, xai/grok-4.3. Use xbrush_list_models with category='text' " +
          "to see per-token pricing, vision / function-calling / structured-output support, and per-model param quirks."
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
      .describe("Sampling temperature (0-2). Higher = more random. Ignored (PARAM_DROPPED warning) on models with constraints.samplingHonored:false — anthropic/*, gemini-3.5-flash-lite, gpt-5.4."),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Nucleus sampling probability mass (0-1). Same samplingHonored caveat as temperature."),
    frequency_penalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Penalize frequent tokens (-2 to 2). Ignored on models with constraints.penaltiesHonored:false (gemini, anthropic, grok)."),
    presence_penalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Penalize tokens already present (-2 to 2). Same penaltiesHonored caveat."),
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
        "Stop sequence(s): generation halts before emitting any of these. A non-empty string or an array of 1-4. Ignored on xai/grok-4.3 (constraints.stopHonored:false)."
      ),
    reasoning_effort: z
      .enum(["none", "minimal", "low", "medium", "high", "max"])
      .optional()
      .describe(
        "Reasoning budget for reasoning-capable models: none (server default, fastest) / minimal / low / medium / high / max. " +
          "Per-model adjustments are reported as PARAM_ADJUSTED warnings (gemini: max→high, none→minimal; gpt-5.4: minimal→low, " +
          "and tools force none; glm-5.2: low/medium→high; gpt-4o family has no reasoning). Higher efforts can exceed the ~30s gateway limit."
      ),
    response_format: ChatResponseFormatSchema.optional().describe(
      "Structured output: {type:'json_object'} or {type:'json_schema', json_schema:{name, schema, strict?}}. " +
        "Honored on models with constraints.structuredOutputHonored (openai/*, gemini-3.5-flash-lite); other models ignore it with a PARAM_DROPPED warning."
    ),
    tools: z
      .array(ChatToolSchema)
      .max(32)
      .optional()
      .describe(
        "Function definitions the model may call (OpenAI format; ≤32 functions, ≤32KB serialized). " +
          "All current models support function calling (constraints.functionCalling). Tool schemas are " +
          "billed as input tokens on EVERY request plus a fixed per-model overhead " +
          "(constraints.toolsFixedTokens: 50-500) — omit on requests that don't need them."
      ),
    tool_choice: ChatToolChoiceSchema.optional().describe(
      "How the model may use `tools`: 'auto' (default), 'none', 'required', or " +
        "{type:'function', function:{name}} to force one function (models with " +
        "constraints.forcedChoiceHonored only — glm-5.2 ignores it with a PARAM_NOT_HONORED warning)."
    ),
  })
  .strict();
