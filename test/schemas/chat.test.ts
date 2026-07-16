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
      ChatCompletionSchema.parse({ model: "m", messages: [{ role: "function", content: "x" }] })
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

  it("n/seed/response_format/parallel_tool_calls 등 미지원 OpenAI 필드 거부 (strict)", () => {
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
    // 서버가 false에 400을 반환하는 미지원 파라미터 — 노출하지 않음
    expect(() =>
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], parallel_tool_calls: false })
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
  });

  describe("function calling (2026-07-16 tools/tool_choice)", () => {
    const TOOL = {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    };
    const TOOL_CALL = {
      id: "call_abc123",
      type: "function" as const,
      function: { name: "get_weather", arguments: '{"city": "Seoul"}' },
    };

    it("tools 유효 (description/parameters 생략 가능)", () => {
      const r = ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools: [TOOL] });
      expect(r.tools).toHaveLength(1);
      ChatCompletionSchema.parse({
        model: "m",
        messages: [MSG],
        tools: [{ type: "function", function: { name: "no_args" } }],
      });
    });

    it("tools 빈 배열 허용 (서버 실측: no-op으로 수용)", () => {
      const r = ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools: [] });
      expect(r.tools).toEqual([]);
    });

    it("함수명 규칙 ^[a-zA-Z0-9_-]{1,64}$ (서버 계약 미러링)", () => {
      ChatCompletionSchema.parse({
        model: "m",
        messages: [MSG],
        tools: [{ type: "function", function: { name: "a".repeat(64) } }],
      });
      for (const bad of ["bad name!", "", "a".repeat(65), "한글이름"]) {
        expect(() =>
          ChatCompletionSchema.parse({
            model: "m",
            messages: [MSG],
            tools: [{ type: "function", function: { name: bad } }],
          })
        ).toThrow();
      }
    });

    it("tools 32개 초과 거부 (서버 상한)", () => {
      const tools = Array.from({ length: 33 }, (_, i) => ({
        type: "function" as const,
        function: { name: `fn_${i}` },
      }));
      expect(() => ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools })).toThrow();
      ChatCompletionSchema.parse({ model: "m", messages: [MSG], tools: tools.slice(0, 32) });
    });

    it("tools 미정의 필드/잘못된 type 거부 (strict)", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG],
          tools: [{ type: "function", function: { name: "f", strict: true } }],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG],
          tools: [{ type: "retrieval", function: { name: "f" } }],
        })
      ).toThrow();
    });

    it("tool_choice 문자열 auto/none/required 유효 (free-form — 서버 검증 위임)", () => {
      for (const v of ["auto", "none", "required"]) {
        const r = ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG],
          tools: [TOOL],
          tool_choice: v,
        });
        expect(r.tool_choice).toBe(v);
      }
    });

    it("tool_choice 강제 함수 객체 유효 / 형식 위반 거부", () => {
      const r = ChatCompletionSchema.parse({
        model: "m",
        messages: [MSG],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "get_weather" } },
      });
      expect(r.tool_choice).toEqual({ type: "function", function: { name: "get_weather" } });
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG],
          tool_choice: { type: "function", function: {} },
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG],
          tool_choice: { type: "function", function: { name: "f" }, extra: 1 },
        })
      ).toThrow();
    });

    it("assistant tool_calls echo 유효 — content ''/null/생략 모두 허용 (실측)", () => {
      for (const content of ["", null, undefined]) {
        const msg: Record<string, unknown> = { role: "assistant", tool_calls: [TOOL_CALL] };
        if (content !== undefined) msg.content = content;
        const r = ChatCompletionSchema.parse({
          model: "m",
          messages: [MSG, msg, { role: "tool", tool_call_id: "call_abc123", content: "{}" }],
        });
        expect(r.messages).toHaveLength(3);
      }
    });

    it("tool 메시지 유효 — content는 string 또는 text 파트 배열 (실측)", () => {
      ChatCompletionSchema.parse({
        model: "m",
        messages: [
          MSG,
          { role: "assistant", content: "", tool_calls: [TOOL_CALL] },
          {
            role: "tool",
            tool_call_id: "call_abc123",
            content: [{ type: "text", text: '{"temp_c": 31}' }],
          },
        ],
      });
    });

    it("tool 메시지에 tool_call_id 누락 거부", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "tool", content: "{}" }],
        })
      ).toThrow();
    });

    it("assistant 외 role의 tool_calls 거부 / tool 외 role의 tool_call_id 거부", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: "hi", tool_calls: [TOOL_CALL] }],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "user", content: "hi", tool_call_id: "call_abc123" }],
        })
      ).toThrow();
    });

    it("tool_calls 없는 메시지의 content ''/null/생략 거부 (서버: content must not be empty)", () => {
      for (const role of ["user", "assistant"]) {
        expect(() =>
          ChatCompletionSchema.parse({ model: "m", messages: [{ role, content: "" }] })
        ).toThrow();
        expect(() =>
          ChatCompletionSchema.parse({ model: "m", messages: [{ role, content: null }] })
        ).toThrow();
        expect(() =>
          ChatCompletionSchema.parse({ model: "m", messages: [{ role }] })
        ).toThrow();
      }
    });

    it("tool_calls 원소 형식 위반 거부 — arguments는 JSON 문자열이어야 함", () => {
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [
            {
              role: "assistant",
              tool_calls: [
                { id: "c1", type: "function", function: { name: "f", arguments: { city: "Seoul" } } },
              ],
            },
          ],
        })
      ).toThrow();
      expect(() =>
        ChatCompletionSchema.parse({
          model: "m",
          messages: [{ role: "assistant", tool_calls: [] }],
        })
      ).toThrow();
    });
  });

  describe("content 파트 배열 (2026-07 vision) — 계속", () => {
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
              content: [
                { type: "image_url", image_url: { url: "https://assets.xbrush.ai/x.png" }, extra: 1 },
              ],
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
