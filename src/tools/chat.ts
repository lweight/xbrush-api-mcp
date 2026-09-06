/**
 * Chat tool: xbrush_chat
 *
 * SYNCHRONOUS — an exception to the async-only rule (as is voice_clone).
 * /v1/chat/completions has no async variant (POST /v1/chat/completions/async
 * → 404) and answers OpenAI-style in a single response. The platform edge
 * gateway cuts the connection at ~30s with an HTML 504; the request keeps
 * processing (and billing — failed requests are refunded) server-side, and
 * its outcome stays retrievable via xbrush_get_request (the response `id` IS
 * the request id, domain "text" / action "chat"). Function-calling turns are
 * recorded too: the request record echoes `tools` in input and keeps
 * `tool_calls` in output.choices, so the 504-recovery path works for tool
 * turns as well (verified live 2026-07-16). A streaming sibling exists
 * (POST /v1/stream/chat/completions, SSE) but has no place in a stdio tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ChatCompletionSchema } from "../schemas/chat.js";
import { TIMEOUT_CHAT } from "../constants.js";
import type { XBrushChatCompletionResponse } from "../types.js";
import {
  buildToolResult,
  handleToolError,
  makeApiRequest,
} from "../services/xbrush-client.js";

export function formatChatCompletion(r: XBrushChatCompletionResponse): string {
  const lines: string[] = [];
  const choice = r.choices?.[0];
  const content = choice?.message?.content;
  const toolCalls = choice?.message?.tool_calls ?? [];

  lines.push(`# Chat completion — ${r.model ?? "unknown model"}`);
  lines.push("");
  if (content) {
    lines.push(content);
    lines.push("");
  }

  if (toolCalls.length > 0) {
    lines.push("## Tool calls requested");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(toolCalls, null, 2));
    lines.push("```");
    lines.push("");
    lines.push(
      "To continue: parse each `function.arguments` (a JSON-encoded string), run the functions, then " +
        "call xbrush_chat again appending (1) this assistant message with its tool_calls echoed " +
        "verbatim and (2) one {role:'tool', tool_call_id, content} message per call — EVERY call " +
        "must be answered before the next user message."
    );
    lines.push("");
  } else if (!content) {
    lines.push(
      choice?.finish_reason === "tool_calls"
        ? "_(finish_reason is 'tool_calls' but no tool_calls were returned — this can happen with " +
            "tool_choice 'required' when no tool fits the request; retry with tool_choice 'auto')_"
        : "_(no content returned)_"
    );
    lines.push("");
  }

  lines.push("---");
  if (choice?.finish_reason) {
    lines.push(`- **Finish reason**: ${choice.finish_reason}`);
  }

  for (const w of r.warnings ?? []) {
    const param = w.param ? ` (${w.param})` : "";
    lines.push(`- **Warning**: ${w.code ?? "WARNING"}${param} — ${w.message ?? "no details"}`);
  }

  const u = r.usage;
  if (u) {
    const cached = u.prompt_tokens_details?.cached_tokens;
    const reasoning = u.completion_tokens_details?.reasoning_tokens;
    const prompt = `prompt ${u.prompt_tokens ?? "?"}${cached ? ` (cached ${cached})` : ""}`;
    const completion = `completion ${u.completion_tokens ?? "?"}${reasoning ? ` (reasoning ${reasoning})` : ""}`;
    lines.push(`- **Tokens**: ${prompt} · ${completion} · total ${u.total_tokens ?? "?"}`);
    if (u.credits_charged != null) {
      lines.push(`- **Credits charged**: ${u.credits_charged}`);
    }
  }

  if (r.id) {
    lines.push(`- **Request ID**: \`${r.id}\` (also retrievable later via xbrush_get_request)`);
  }

  return lines.join("\n");
}

export function registerChatTools(server: McpServer): void {
  server.registerTool(
    "xbrush_chat",
    {
      title: "Chat (LLM)",
      description: [
        "Chat with an XBrush-hosted LLM (OpenAI-compatible chat completions). 12 models: z-ai/glm-5.2, bytedance/seed-2.0-mini,",
        "bytedance/seed-2.1-turbo, google/gemini-3.1-flash-lite, google/gemini-3.5-flash-lite, anthropic/claude-sonnet-5,",
        "anthropic/claude-opus-5, deepseek/deepseek-v4-flash, openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5.4, xai/grok-4.3",
        "(per-token prices + capability flags in xbrush_list_models(category='text'); cheapest: seed-2.0-mini, deepseek-v4-flash, gpt-4o-mini).",
        "SYNCHRONOUS — returns the completion text directly; no request_id polling needed.",
        "The platform gateway cuts responses at ~30s, so keep outputs short: prefer the default",
        "reasoning_effort (none) or 'minimal'/'low' and a modest max_tokens. On a 504 gateway timeout the",
        "request usually STILL completes and bills server-side — recover the text with",
        "xbrush_list_requests + xbrush_get_request (failed requests are auto-refunded).",
        "",
        "VISION: on vision-capable models (constraints.vision — every model except glm-5.2 and deepseek-v4-flash),",
        "message content may be an array of parts mixing {type:'text', text} and {type:'image_url', image_url:{url, detail?}}.",
        "url takes an https URL (upload local files via xbrush_file_upload) or a data: URL; detail 'low' cuts image token",
        "cost drastically (honored for billing on OpenAI models; ~14x on seed-2.0-mini). Max images per request = constraints.maxImages (10).",
        "Non-vision models reject image parts (400, not billed). Only text and image_url parts exist (no audio/video/file parts).",
        "",
        "STRUCTURED OUTPUT: response_format {type:'json_object'} or {type:'json_schema', json_schema:{name, schema, strict}} —",
        "applied on models with constraints.structuredOutputHonored (openai/*, gemini-3.5-flash-lite); other models ignore it and the",
        "result shows a PARAM_DROPPED warning (ask for JSON in the prompt instead).",
        "",
        "FUNCTION CALLING: pass OpenAI-style `tools` (all models support it). When the model wants a call, the result shows finish_reason",
        "'tool_calls' plus the tool_calls array — function.arguments is a JSON-encoded STRING, parse it.",
        "Then call again appending the assistant message (tool_calls echoed verbatim; its content may",
        "be empty) and one {role:'tool', tool_call_id, content} message per call. EVERY tool_call must",
        "be answered before the next user message, or the API 400s. Models may emit several calls in",
        "one turn — handle the whole array (parallel_tool_calls is not supported / not exposed).",
        "tool_choice: 'auto' (default) / 'none' / 'required' / {type:'function', function:{name}}.",
        "Forced choice is honored on every model except glm-5.2 (constraints.forcedChoiceHonored; glm returns a PARAM_NOT_HONORED",
        "warning). 'required' may return an empty tool_calls response when no tool fits. Limits: ≤32 functions, ≤32KB serialized,",
        "names ^[a-zA-Z0-9_-]{1,64}$. Tools bill as input tokens EVERY request + fixed overhead (constraints.toolsFixedTokens: 50-500).",
        "gpt-5.4 cannot combine tools with reasoning (reasoning_effort is forced to none with a warning).",
        "",
        "Args:",
        "  model (string, required): e.g. bytedance/seed-2.0-mini. See xbrush_list_models(category='text').",
        "  messages (array, required): 1-1000 of {role: system|user|assistant|tool, content,",
        "    tool_calls?, tool_call_id?}. content is a string ≤1M chars, or an array of",
        "    text/image_url parts (vision); required except on assistant messages with tool_calls.",
        "  max_tokens (int, optional): 1-65536, includes reasoning tokens.",
        "  temperature (float, optional): 0-2. top_p (float, optional): 0-1. (Ignored with a warning on anthropic/*, gemini-3.5, gpt-5.4.)",
        "  frequency_penalty / presence_penalty (float, optional): -2 to 2 (ignored on gemini/anthropic/grok).",
        "  stop (string | string[], optional): 1-4 stop sequences (ignored on grok-4.3).",
        "  reasoning_effort (string, optional): none/minimal/low/medium/high/max. Default: none (fastest).",
        "  response_format (object, optional): json_object or json_schema (see above).",
        "  tools (array, optional): ≤32 of {type:'function', function:{name, description?, parameters?}}.",
        "  tool_choice (string | object, optional): 'auto'/'none'/'required' or a forced function.",
        "",
        "Billed per token (input/output/cached rates via xbrush_list_models). OpenAI params not",
        "listed above (n, seed, logprobs, logit_bias, stream, parallel_tool_calls) are not supported.",
        "Models ignore or adjust unsupported params instead of erroring and the result then carries",
        "PARAM_DROPPED / PARAM_ADJUSTED / PARAM_NOT_HONORED warnings (see constraints in xbrush_list_models).",
      ].join("\n"),
      inputSchema: ChatCompletionSchema,
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
          messages: args.messages,
        };
        if (args.max_tokens !== undefined) body.max_tokens = args.max_tokens;
        if (args.temperature !== undefined) body.temperature = args.temperature;
        if (args.top_p !== undefined) body.top_p = args.top_p;
        if (args.frequency_penalty !== undefined) body.frequency_penalty = args.frequency_penalty;
        if (args.presence_penalty !== undefined) body.presence_penalty = args.presence_penalty;
        if (args.stop !== undefined) body.stop = args.stop;
        if (args.reasoning_effort !== undefined) body.reasoning_effort = args.reasoning_effort;
        if (args.response_format !== undefined) body.response_format = args.response_format;
        if (args.tools !== undefined) body.tools = args.tools;
        if (args.tool_choice !== undefined) body.tool_choice = args.tool_choice;

        const response = await makeApiRequest<XBrushChatCompletionResponse>({
          method: "POST",
          url: "/v1/chat/completions",
          data: body,
          timeout: TIMEOUT_CHAT,
        });
        return buildToolResult(formatChatCompletion(response));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
