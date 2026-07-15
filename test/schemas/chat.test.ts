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

  it("tools/n/seed/response_format 등 미지원 OpenAI 필드 거부 (strict)", () => {
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools: [] })
    ).toThrow();
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], n: 2 })
    ).toThrow();
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], seed: 42 })
    ).toThrow();
    expect(() =>
      ChatCompletionSchema.parse({
        model: "m",
        messages: [MSG],
        response_format: { type: "json_object" },
      })
    ).toThrow();
  });

  describe("stop (2026-07 신규 인식 필드)", () => {
    it("문자열 1개 유효", () => {
      const r = ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: "END" });
      expect(r.stop).toBe("END");
    });

    it("배열 1~4개 유효", () => {
      const r = ChatCompletionSchema.parse({
        model: "m",
        messages: [MSG],
        stop: ["a", "b", "c", "d"],
      });
      expect(r.stop).toEqual(["a", "b", "c", "d"]);
    });

    it("빈 문자열/빈 배열/5개 초과/빈 원소 거부", () => {
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: "" })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: [] })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: ["a", "b", "c", "d", "e"] })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [MSG], stop: ["a", ""] })
      ).toThrow();
    });
  });

  describe("content 파트 배열 (2026-07 vision)", () => {
    const IMG = {
      type: "image_url" as const,
      image_url: { url: "https://assets.xbrush.ai/x.png" },
    };

    it("text 파트만으로 유효", () => {
      const r = ChatCompletionSchema.parse({
        model: "m",
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });
      expect(Array.isArray(r.messages[0].content)).toBe(true);
    });

    it("text + image_url 혼합 유효 (detail 포함/생략)", () => {
      const r = ChatCompletionSchema.parse({
        model: "bytedance/seed-2.0-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What color?" },
              IMG,
              { type: "image_url", image_url: { url: "data:image/png;base64,AAAA", detail: "low" } },
            ],
          },
        ],
      });
      const parts = r.messages[0].content as unknown[];
      expect(parts).toHaveLength(3);
    });

    it("system/assistant 메시지도 파트 배열 허용", () => {
      const r = ChatCompletionSchema.parse({
        model: "m",
        messages: [
          { role: "system", content: [{ type: "text", text: "be brief" }] },
          { role: "user", content: "hi" },
          { role: "assistant", content: [{ type: "text", text: "ok" }] },
          { role: "user", content: "bye" },
        ],
      });
      expect(r.messages).toHaveLength(4);
    });

    it("빈 파트 배열 거부 (서버: content array must not be empty)", () => {
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [{ role: "user", content: [] }] })
      ).toThrow();
    });

    it("빈 문자열 content 거부 (서버: content must not be empty)", () => {
      expect(() =>
        ChatCompletionSchema.parse({ model: "m", messages: [{ role: "user", content: "" }] })
      ).toThrow();
    });

    it("미인식 파트 타입 거부 (서버 인식: text/image_url 뿐)", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: [{ type: "input_image", url: "x" }] }],
        })
      ).toThrow();
    });

    it("text 파트 빈 문자열/누락 거부", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: [{ type: "text", text: "" }] }],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: [{ type: "text" }] }],
        })
      ).toThrow();
    });

    it("image_url 파트 url 누락/파트 미정의 필드 거부 (strict)", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: [{ type: "image_url", image_url: {} }] }],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [
            {
              role: "user",
              content: [{ ...IMG, extra: 1 }],
            },
          ],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: "https://a/x.png", size: "big" } },
              ],
            },
          ],
        })
      ).toThrow();
    });
  });
});
