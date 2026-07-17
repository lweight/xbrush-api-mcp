import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushVoiceListResponse } from "../../src/types.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerVoiceTools } from "../../src/tools/voice.js";
import { TIMEOUT_VOICE_CLONE } from "../../src/constants.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerVoiceTools(mock.server);
  handlers = mock.handlers;
});

const resp: XBrushVoiceListResponse = {
  success: true,
  provider: "elevenlabs",
  model: "eleven_v3",
  data: {
    provider: "elevenlabs",
    voices: [
      { voice_id: "v1", name: "JP", category: "cloned", preview_url: "https://x/p.mp3" },
      { voice_id: "v2", name: "Aria", category: "premade" },
    ],
    pagination: { has_more: false, returned_count: 2 },
  },
};

describe("xbrush_list_voices", () => {
  it("voices 요약 렌더 (provider/voice_id/name/category)", async () => {
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_voices")!({});
    const text = result.content[0].text;
    expect(text).toContain("provider: elevenlabs");
    expect(text).toContain("v1");
    expect(text).toContain("JP");
    expect(text).toContain("Aria");
    expect(text).toContain("preview");
  });

  it("model 파라미터 → params.model 전달", async () => {
    mockedApi.mockResolvedValueOnce(resp);
    await handlers.get("xbrush_list_voices")!({ model: "speech-2.8-hd" });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/voice/list");
    expect(args.params.model).toBe("speech-2.8-hd");
  });

  it("voices 비어있으면 안내 문구", async () => {
    mockedApi.mockResolvedValueOnce({
      success: true,
      provider: "minimax",
      model: "x",
      data: { voices: [] },
    });
    const result = await handlers.get("xbrush_list_voices")!({ model: "x" });
    expect(result.content[0].text).toContain("No voices");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("voice service down"));
    const result = await handlers.get("xbrush_list_voices")!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("voice service down");
  });
});

describe("xbrush_voice_clone (2026-07-17, 동기)", () => {
  const ARGS = {
    name: "My Voice",
    audio_urls: ["https://assets.xbrush.ai/sample.mp3"],
  };

  it("/v1/voice/clone POST + TIMEOUT_VOICE_CLONE (동기 — async 제출 아님)", async () => {
    mockedApi.mockResolvedValueOnce({ voice_id: "voc_123" });
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/voice/clone");
    expect(args.method).toBe("POST");
    expect(args.timeout).toBe(TIMEOUT_VOICE_CLONE);
    expect(result.content[0].text).not.toContain("submitted (async)");
  });

  it("snake_case → camelCase 매핑 (audio_urls/remove_background_noise)", async () => {
    mockedApi.mockResolvedValueOnce({ voice_id: "voc_123" });
    await handlers.get("xbrush_voice_clone")!({
      ...ARGS,
      model: "eleven",
      description: "d",
      remove_background_noise: true,
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data).toEqual({
      name: "My Voice",
      audioUrls: ["https://assets.xbrush.ai/sample.mp3"],
      model: "eleven",
      description: "d",
      removeBackgroundNoise: true,
    });
  });

  it("voice_id 응답 → tts 연계 안내 렌더", async () => {
    mockedApi.mockResolvedValueOnce({ voice_id: "voc_123", provider: "minimax" });
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain("voc_123");
    expect(text).toContain("xbrush_tts_generate");
    expect(text).toContain("My Voice");
  });

  it("voice_id 없는 미지 형태 응답 → 원본 JSON echo + list_voices 안내", async () => {
    mockedApi.mockResolvedValueOnce({ result: { something: "else" } });
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain("xbrush_list_voices");
    expect(text).toContain('"something": "else"');
  });

  it("data.voiceId 중첩 형태에서도 id 탐지", async () => {
    mockedApi.mockResolvedValueOnce({ data: { voiceId: "voc_nested" } });
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    expect(result.content[0].text).toContain("voc_nested");
  });

  it("업스트림 에러(슬롯 만석 등) → isError", async () => {
    mockedApi.mockRejectedValueOnce(
      new Error("Failed after 3 attempts: You have reached your maximum amount of custom voices (30 / 30).")
    );
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("maximum amount of custom voices");
  });
});
