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

describe("xbrush_voice_clone (동기 — 202 completed + record 조회)", () => {
  const ARGS = {
    name: "My Voice",
    audio_urls: ["https://assets.xbrush.ai/sample.mp3"],
  };
  const SUBMIT = {
    requestId: "req" + "c".repeat(21),
    status: "completed",
    domain: "voice",
    action: "clone",
    creditCharged: 2,
    pollUrl: "/v1/requests/req" + "c".repeat(21),
  };
  const RECORD = {
    ...SUBMIT,
    credits: { charged: 2, refunded: 0, balance_after: 100 },
    output: {
      success: true,
      data: {
        name: "My Voice",
        provider: "minimax",
        voice_id: "moss_audio_abc",
        demo_audio_url: "https://cdn/demo.mp3",
      },
    },
  };

  it("/v1/voice/clone POST + TIMEOUT_VOICE_CLONE, 이어서 GET /v1/requests/{id}", async () => {
    mockedApi.mockResolvedValueOnce(SUBMIT).mockResolvedValueOnce(RECORD);
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    const calls = mockedApi.mock.calls.slice(-2).map((c) => c[0] as any);
    expect(calls[0].url).toBe("/v1/voice/clone");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].timeout).toBe(TIMEOUT_VOICE_CLONE);
    expect(calls[1].url).toBe(`/v1/requests/${SUBMIT.requestId}`);
    expect(calls[1].method).toBe("GET");
    expect(result.content[0].text).not.toContain("submitted (async)");
  });

  it("snake_case → camelCase 매핑 (audio_urls/remove_background_noise/voice_id)", async () => {
    mockedApi.mockResolvedValueOnce(SUBMIT).mockResolvedValueOnce(RECORD);
    await handlers.get("xbrush_voice_clone")!({
      ...ARGS,
      model: "seed-icl-2.0",
      voice_id: "xbseed_existing",
      description: "d",
      remove_background_noise: true,
    });
    const args = mockedApi.mock.calls.at(-2)![0] as any;
    expect(args.data).toEqual({
      name: "My Voice",
      audioUrls: ["https://assets.xbrush.ai/sample.mp3"],
      model: "seed-icl-2.0",
      voiceId: "xbseed_existing",
      description: "d",
      removeBackgroundNoise: true,
    });
  });

  it("record output.data.voice_id → tts 연계 안내 렌더 (모델 매핑 eleven→eleven-v3)", async () => {
    mockedApi.mockResolvedValueOnce(SUBMIT).mockResolvedValueOnce(RECORD);
    const result = await handlers.get("xbrush_voice_clone")!({ ...ARGS, model: "eleven" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain("moss_audio_abc");
    expect(text).toContain("xbrush_tts_generate");
    expect(text).toContain("eleven-v3");
    expect(text).toContain("My Voice");
    expect(text).toContain("https://cdn/demo.mp3");
    expect(text).toContain("Credits charged**: 2");
  });

  it("record 조회 실패 → 봉투만으로 안내 (request_id + get_request 힌트)", async () => {
    mockedApi.mockResolvedValueOnce({ ...SUBMIT, status: "pending" }).mockRejectedValueOnce(new Error("boom"));
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain(SUBMIT.requestId);
    expect(text).toContain("xbrush_get_request");
  });

  it("voice id 없는 미지 형태 record → 원본 JSON echo + list_voices 안내", async () => {
    mockedApi
      .mockResolvedValueOnce(SUBMIT)
      .mockResolvedValueOnce({ ...RECORD, output: { result: { something: "else" } } });
    const result = await handlers.get("xbrush_voice_clone")!(ARGS);
    const text = result.content[0].text as string;
    expect(text).toContain("xbrush_list_voices");
    expect(text).toContain('"something": "else"');
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
