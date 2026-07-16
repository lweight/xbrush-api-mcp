import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushChatCompletionResponse } from "../../src/types.js";
import { TIMEOUT_CHAT } from "../../src/constants.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest, XBrushApiError } from "../../src/services/xbrush-client.js";
import { registerChatTools } from "../../src/tools/chat.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockCompletion: XBrushChatCompletionResponse = {
  id: "req" + "c".repeat(21),
  object: "chat.completion",
  created: 1784091641,
  model: "z-ai/glm-5.2",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "Hello there!" },
    },
  ],
  usage: {
    prompt_tokens: 16,
    completion_tokens: 4,
    total_tokens: 20,
    credits_charged: 0.0001,
    completion_tokens_details: { reasoning_tokens: 0 },
    prompt_tokens_details: { cached_tokens: 0 },
  },
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerChatTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_chat", () => {
  it("성공 — 동기 응답에서 content/usage/requestId 추출", async () => {
    mockedApi.mockResolvedValueOnce(mockCompletion);
    const result = await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain("Hello there!");
    expect(text).toContain("z-ai/glm-5.2");
    expect(text).toContain("stop");
    expect(text).toContain("prompt 16");
    expect(text).toContain("total 20");
    expect(text).toContain("0.0001");
    expect(text).toContain(mockCompletion.id);
    // async 제출 문구가 아니어야 함 (동기 도구)
    expect(text).not.toContain("submitted (async)");
  });

  it("/v1/chat/completions POST + TIMEOUT_CHAT (동기 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockCompletion);
    await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/chat/completions");
    expect(args.method).toBe("POST");
    expect(args.timeout).toBe(TIMEOUT_CHAT);
  });

  it("옵션 필드가 스네이크케이스 그대로 전달", async () => {
    mockedApi.mockResolvedValueOnce(mockCompletion);
    await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: -0.5,
      stop: ["END", "\n\n"],
      reasoning_effort: "minimal",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data).toEqual({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: -0.5,
      stop: ["END", "\n\n"],
      reasoning_effort: "minimal",
    });
  });

  it("vision: content 파트 배열이 그대로 전달", async () => {
    mockedApi.mockResolvedValueOnce(mockCompletion);
    const visionMessages = [
      {
        role: "user",
        content: [
          { type: "text", text: "What color is this image?" },
          {
            type: "image_url",
            image_url: { url: "https://assets.xbrush.ai/x.png", detail: "low" },
          },
        ],
      },
    ];
    await handlers.get("xbrush_chat")!({
      model: "bytedance/seed-2.0-mini",
      messages: visionMessages,
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.messages).toEqual(visionMessages);
  });

  it("미지정 옵션 필드는 body에서 생략", async () => {
    mockedApi.mockResolvedValueOnce(mockCompletion);
    await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(Object.keys(args.data)).toEqual(["model", "messages"]);
  });

  it("content 없음 → placeholder 표기", async () => {
    mockedApi.mockResolvedValueOnce({
      ...mockCompletion,
      choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: null } }],
    });
    const result = await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("(no content returned)");
    expect(result.content[0].text).toContain("length");
  });

  it("choices 비어있어도 크래시 없음", async () => {
    mockedApi.mockResolvedValueOnce({ id: "reqx", model: "z-ai/glm-5.2", choices: [] });
    const result = await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("(no content returned)");
  });

  describe("function calling (2026-07-16)", () => {
    const TOOLS = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ];
    const toolCallCompletion: XBrushChatCompletionResponse = {
      ...mockCompletion,
      model: "bytedance/seed-2.0-mini",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_yfo7t9fm9zhg3sirnfo1ixqs",
                type: "function",
                function: { name: "get_weather", arguments: '{"city": "Seoul"}' },
              },
            ],
          },
        },
      ],
    };

    it("tools/tool_choice가 body에 그대로 전달", async () => {
      mockedApi.mockResolvedValueOnce(mockCompletion);
      await handlers.get("xbrush_chat")!({
        model: "bytedance/seed-2.0-mini",
        messages: [{ role: "user", content: "weather in Seoul?" }],
        tools: TOOLS,
        tool_choice: { type: "function", function: { name: "get_weather" } },
      });
      const args = mockedApi.mock.calls.at(-1)![0] as any;
      expect(args.data.tools).toEqual(TOOLS);
      expect(args.data.tool_choice).toEqual({
        type: "function",
        function: { name: "get_weather" },
      });
    });

    it("tools 미지정 시 body에서 생략", async () => {
      mockedApi.mockResolvedValueOnce(mockCompletion);
      await handlers.get("xbrush_chat")!({
        model: "z-ai/glm-5.2",
        messages: [{ role: "user", content: "hi" }],
      });
      const args = mockedApi.mock.calls.at(-1)![0] as any;
      expect(args.data).not.toHaveProperty("tools");
      expect(args.data).not.toHaveProperty("tool_choice");
    });

    it("tool_calls 응답 → JSON echo + 후속 지침 렌더링", async () => {
      mockedApi.mockResolvedValueOnce(toolCallCompletion);
      const result = await handlers.get("xbrush_chat")!({
        model: "bytedance/seed-2.0-mini",
        messages: [{ role: "user", content: "weather in Seoul?" }],
        tools: TOOLS,
      });
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text as string;
      expect(text).toContain("Tool calls requested");
      expect(text).toContain("call_yfo7t9fm9zhg3sirnfo1ixqs");
      expect(text).toContain("get_weather");
      // arguments는 JSON 문자열 그대로 (stringify되어 이스케이프된 형태로 노출)
      expect(text).toContain('{\\"city\\": \\"Seoul\\"}');
      expect(text).toContain("tool_call_id");
      expect(text).toContain("EVERY call");
      expect(text).toContain("Finish reason**: tool_calls");
      // 빈 content가 placeholder로 새지 않아야 함
      expect(text).not.toContain("(no content returned)");
    });

    it("tool 결과 회신 메시지(tool role + assistant echo)가 그대로 전달", async () => {
      mockedApi.mockResolvedValueOnce(mockCompletion);
      const messages = [
        { role: "user", content: "weather in Seoul?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_yfo7t9fm9zhg3sirnfo1ixqs",
              type: "function",
              function: { name: "get_weather", arguments: '{"city": "Seoul"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_yfo7t9fm9zhg3sirnfo1ixqs",
          content: '{"temp_c": 31, "condition": "sunny"}',
        },
      ];
      await handlers.get("xbrush_chat")!({
        model: "bytedance/seed-2.0-mini",
        messages,
        tools: TOOLS,
      });
      const args = mockedApi.mock.calls.at(-1)![0] as any;
      expect(args.data.messages).toEqual(messages);
    });

    it("PARAM_NOT_HONORED warnings 렌더링 (glm 강제 tool_choice 무시)", async () => {
      mockedApi.mockResolvedValueOnce({
        ...toolCallCompletion,
        model: "z-ai/glm-5.2",
        warnings: [
          {
            code: "PARAM_NOT_HONORED",
            param: "tool_choice",
            message:
              "z-ai/glm-5.2 does not honor a forced function choice; the model selects the tool itself.",
          },
        ],
      });
      const result = await handlers.get("xbrush_chat")!({
        model: "z-ai/glm-5.2",
        messages: [{ role: "user", content: "weather?" }],
        tools: TOOLS,
        tool_choice: { type: "function", function: { name: "get_time" } },
      });
      const text = result.content[0].text as string;
      expect(text).toContain("PARAM_NOT_HONORED");
      expect(text).toContain("tool_choice");
      expect(text).toContain("does not honor");
    });

    it("finish_reason tool_calls인데 tool_calls 비어있음 → 안내 문구 (required 비정상 케이스)", async () => {
      mockedApi.mockResolvedValueOnce({
        ...mockCompletion,
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: { role: "assistant", content: "", tool_calls: null },
          },
        ],
      });
      const result = await handlers.get("xbrush_chat")!({
        model: "bytedance/seed-2.0-mini",
        messages: [{ role: "user", content: "hello" }],
        tools: TOOLS,
        tool_choice: "required",
      });
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text as string;
      expect(text).toContain("no tool_calls were returned");
      expect(text).toContain("tool_choice 'auto'");
    });
  });

  it("게이트웨이 504 → 복구 힌트 (get_request 안내)", async () => {
    mockedApi.mockRejectedValueOnce(
      new XBrushApiError(
        504,
        "GATEWAY_TIMEOUT",
        "Gateway timeout: the API gateway dropped the connection (~30s limit) before the server finished.",
        "The request may still be processing (and billing) server-side — find it with xbrush_list_requests and fetch its outcome with xbrush_get_request (failed requests are auto-refunded). For xbrush_chat, retry with a lower max_tokens and reasoning_effort 'none' or 'minimal' so the response fits the ~30s gateway limit."
      )
    );
    const result = await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("chat backend unavailable"));
    const result = await handlers.get("xbrush_chat")!({
      model: "z-ai/glm-5.2",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("chat backend unavailable");
  });
});
