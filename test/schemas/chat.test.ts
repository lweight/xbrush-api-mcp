import { describe, it, expect } from "vitest";
import { ChatCompletionSchema } from "../../src/schemas/chat.js";

const MSG = { role: "user" as const, content: "hello" };

describe("ChatCompletionSchema", () => {
  it("model + messages만으로 유효", () => {
    const r = ChatCompletionSchema.parse({ model: "z-ai/glm-5.2", messages: [MSG] });
    expect(r.model).toBe("z-ai/glm-5.2");
    expect(r.messages).toHaveLength(1);
  });

  it("전체 옵션 필드 유효", () => {
    const r = ChatCompletionSchema.parse({
      model: "z-ai/glm-5.2",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "bye" },
      ],
      max_tokens: 65536,
      temperature: 2,
      top_p: 1,
      frequency_penalty: -2,
      presence_penalty: 2,
      reasoning_effort: "minimal",
    });
    expect(r.max_tokens).toBe(65536);
    expect(r.reasoning_effort).toBe("minimal");
  });

  it("model 누락 거부", () => {
    expect(() => ChatCompletionSchema.parse({ messages: [MSG] })).toThrow();
  });

  it("messages 빈 배열 거부", () => {
    expect(() => ChatCompletionSchema.parse({ model: "m", messages: [] })).toThrow();
  });

  it("messages 1000개 초과 거부", () => {
    const many = Array.from({ length: 1001 }, () => MSG);
    expect(() => ChatCompletionSchema.parse({ model: "m", messages: many })).toThrow();
  });

  it("허용되지 않는 role 거부", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [{ role: "tool", content: "x" }] })
    ).toThrow();
  });

  it("message 미정의 필드 거부 (strict)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [{ ...MSG, name: "bob" }] })
    ).toThrow();
  });

  it("max_tokens 범위 밖 거부 (0, 65537)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], max_tokens: 0 })
    ).toThrow();
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], max_tokens: 65537 })
    ).toThrow();
  });

  it("temperature 범위 밖 거부 (2.1)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], temperature: 2.1 })
    ).toThrow();
  });

  it("reasoning_effort enum 외 값 거부", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], reasoning_effort: "medium" })
    ).toThrow();
  });

  it("stream 필드 거부 (미노출)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], stream: true })
    ).toThrow();
  });

  it("sync 필드 거부 (strict)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], sync: true })
    ).toThrow();
  });

  it("tools/stop 등 미지원 OpenAI 필드 거부 (strict)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools: [] })
    ).toThrow();
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: ["\n"] })
    ).toThrow();
  });
});
