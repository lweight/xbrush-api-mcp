import { describe, it, expect } from "vitest";
import {
  TtsGenerateSchema,
  MusicGenerateSchema,
  SoundEffectGenerateSchema,
} from "../../src/schemas/audio.js";

// ── TtsGenerateSchema ─────────────────────────────────────────────────

describe("TtsGenerateSchema", () => {
  const base = { text: "hello" };

  it("필수 필드만으로 유효", () => {
    expect(TtsGenerateSchema.parse(base).text).toBe("hello");
  });

  it("전체 필드 유효", () => {
    const result = TtsGenerateSchema.parse({
      ...base,
      voice_id: "ko-female-1",
      language: "ko",
      speed: 1.25,
    });
    expect(result.voice_id).toBe("ko-female-1");
    expect(result.speed).toBe(1.25);
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => TtsGenerateSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("text 누락 거부", () => {
    expect(() => TtsGenerateSchema.parse({})).toThrow();
  });

  it("model은 optional", () => {
    expect(TtsGenerateSchema.parse({ text: "hi" }).model).toBeUndefined();
  });

  it("text 빈 문자열 거부", () => {
    expect(() => TtsGenerateSchema.parse({ ...base, text: "" })).toThrow();
  });

  it("text 공백만 문자열 거부", () => {
    expect(() => TtsGenerateSchema.parse({ ...base, text: "   " })).toThrow();
  });

  it("text trim 적용", () => {
    const r = TtsGenerateSchema.parse({ ...base, text: "  hi  " });
    expect(r.text).toBe("hi");
  });

  it("speed 범위 초과 거부 (>2.0)", () => {
    expect(() => TtsGenerateSchema.parse({ ...base, speed: 3 })).toThrow();
  });

  it("speed 범위 미달 거부 (<0.5)", () => {
    expect(() => TtsGenerateSchema.parse({ ...base, speed: 0.1 })).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      TtsGenerateSchema.parse({ ...base, genre: "jazz" })
    ).toThrow();
  });
});

// ── MusicGenerateSchema ───────────────────────────────────────────────

describe("MusicGenerateSchema", () => {
  const base = { prompt: "calm piano" };

  it("필수 필드(prompt)만으로 유효", () => {
    expect(MusicGenerateSchema.parse(base).prompt).toBe("calm piano");
  });

  it("model은 optional", () => {
    expect(MusicGenerateSchema.parse(base).model).toBeUndefined();
  });

  it("duration, seed 유효", () => {
    const r = MusicGenerateSchema.parse({ ...base, duration: 60, seed: 42 });
    expect(r.duration).toBe(60);
    expect(r.seed).toBe(42);
  });

  it("prompt 누락 거부", () => {
    expect(() => MusicGenerateSchema.parse({})).toThrow();
  });

  it("duration 0 거부", () => {
    expect(() => MusicGenerateSchema.parse({ ...base, duration: 0 })).toThrow();
  });

  it("duration 범위(5-300) 밖 거부", () => {
    expect(() => MusicGenerateSchema.parse({ ...base, duration: 4 })).toThrow();
    expect(() => MusicGenerateSchema.parse({ ...base, duration: 301 })).toThrow();
  });

  it("prompt 공백만 거부", () => {
    expect(() => MusicGenerateSchema.parse({ ...base, prompt: "  " })).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      MusicGenerateSchema.parse({ ...base, genre: "jazz" })
    ).toThrow();
  });
});

// ── SoundEffectGenerateSchema ─────────────────────────────────────────

describe("SoundEffectGenerateSchema", () => {
  const V = "https://cdn.xbrush.run/in.mp4";

  it("video_url 만으로 유효", () => {
    expect(SoundEffectGenerateSchema.parse({ video_url: V }).video_url).toBe(V);
  });

  it("video_url + prompt 유효", () => {
    const r = SoundEffectGenerateSchema.parse({ video_url: V, prompt: "rain" });
    expect(r.prompt).toBe("rain");
  });

  it("video_url 누락 거부", () => {
    expect(() => SoundEffectGenerateSchema.parse({})).toThrow();
  });

  it("video_url 이 URL 아니면 거부", () => {
    expect(() =>
      SoundEffectGenerateSchema.parse({ video_url: "not-a-url" })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      SoundEffectGenerateSchema.parse({ video_url: V, loop: true })
    ).toThrow();
  });
});
