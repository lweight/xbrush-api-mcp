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
      reasoning_effort: "minimal",
    });
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
