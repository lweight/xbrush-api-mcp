import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushAsyncResponse } from "../../src/types.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerAudioTools } from "../../src/tools/audio.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "u".repeat(21),
  status: "pending",
  domain: "audio",
  action: "generate",
  creditCharged: 2,
  estimatedTimeout: 30,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerAudioTools(mock.server);
  handlers = mock.handlers;
});

// ── xbrush_tts_generate ────────────────────────────────────────────────

describe("xbrush_tts_generate", () => {
  it("성공 — async 제출 + requestId 반환", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_tts_generate")!({
      model: "minimax",
      text: "안녕하세요",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
  });

  it("/v1/tts/generate (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_tts_generate")!({ model: "m", text: "t" });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/tts/generate");
  });

  it("voice_id → voiceId 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_tts_generate")!({
      model: "m",
      text: "t",
      voice_id: "ko-1",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.voiceId).toBe("ko-1");
    expect(args.data.voice_id).toBeUndefined();
  });

  it("optional 미지정 시 body 미포함", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_tts_generate")!({ model: "m", text: "t" });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect("voiceId" in args.data).toBe(false);
    expect("language" in args.data).toBe(false);
    expect("speed" in args.data).toBe(false);
  });

  it("API 에러 → isError + Suggestion", async () => {
    mockedApi.mockRejectedValueOnce(new Error("tts service down"));
    const result = await handlers.get("xbrush_tts_generate")!({
      model: "m",
      text: "t",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("tts service down");
    expect(result.content[0].text).toContain("Suggestion");
  });
});

// ── xbrush_music_generate ──────────────────────────────────────────────

describe("xbrush_music_generate", () => {
  it("성공 — async 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_music_generate")!({
      model: "lyria2",
      prompt: "upbeat synth",
    });
    expect(result.content[0].text).toContain("submitted (async)");
  });

  it("/v1/music/generate (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_music_generate")!({
      model: "lyria2",
      prompt: "x",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/music/generate");
  });

  it("negative_prompt → negativePrompt 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_music_generate")!({
      model: "lyria2",
      prompt: "x",
      negative_prompt: "vocals",
      duration: 30,
      seed: 7,
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.negativePrompt).toBe("vocals");
    expect(args.data.duration).toBe(30);
    expect(args.data.seed).toBe(7);
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("music model busy"));
    const result = await handlers.get("xbrush_music_generate")!({
      model: "m",
      prompt: "x",
    });
    expect(result.isError).toBe(true);
  });
});

// ── xbrush_sound_effect_generate ──────────────────────────────────────

describe("xbrush_sound_effect_generate", () => {
  const V = "https://cdn.xbrush.run/in.mp4";

  it("성공 — async 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_sound_effect_generate")!({
      video_url: V,
    });
    expect(result.content[0].text).toContain("submitted (async)");
  });

  it("/v1/sound-effect/generate (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_sound_effect_generate")!({ video_url: V });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/sound-effect/generate");
  });

  it("video_url → videoUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_sound_effect_generate")!({ video_url: V });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.videoUrl).toBe(V);
  });

  it("prompt 포함 시 body에 전달", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_sound_effect_generate")!({
      video_url: V,
      prompt: "gentle rain",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.prompt).toBe("gentle rain");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("sfx err"));
    const result = await handlers.get("xbrush_sound_effect_generate")!({
      video_url: V,
    });
    expect(result.isError).toBe(true);
  });
});
