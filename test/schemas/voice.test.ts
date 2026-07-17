import { describe, it, expect } from "vitest";
import { ListVoicesSchema, VoiceCloneSchema } from "../../src/schemas/voice.js";

describe("ListVoicesSchema", () => {
  it("빈 객체 유효 (model 옵션)", () => {
    expect(ListVoicesSchema.parse({}).model).toBeUndefined();
  });

  it("model 지정 유효", () => {
    expect(ListVoicesSchema.parse({ model: "speech-2.8-hd" }).model).toBe(
      "speech-2.8-hd"
    );
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() => ListVoicesSchema.parse({ provider: "elevenlabs" })).toThrow();
  });
});

describe("VoiceCloneSchema (2026-07-17)", () => {
  const BASE = {
    name: "My Voice",
    audio_urls: ["https://assets.xbrush.ai/sample.mp3"],
  };

  it("name + audio_urls만으로 유효", () => {
    const r = VoiceCloneSchema.parse(BASE);
    expect(r.name).toBe("My Voice");
    expect(r.audio_urls).toHaveLength(1);
  });

  it("전체 옵션 필드 유효 (model은 free-form — 서버 enum 위임)", () => {
    const r = VoiceCloneSchema.parse({
      ...BASE,
      model: "speech-2.8-hd",
      description: "for narration",
      remove_background_noise: true,
    });
    expect(r.model).toBe("speech-2.8-hd");
    expect(r.remove_background_noise).toBe(true);
  });

  it("name 누락/공백 거부", () => {
    expect(() => VoiceCloneSchema.parse({ audio_urls: BASE.audio_urls })).toThrow();
    expect(() => VoiceCloneSchema.parse({ ...BASE, name: "   " })).toThrow();
  });

  it("audio_urls 빈 배열/비URL 거부 (서버: ≥1 URL)", () => {
    expect(() => VoiceCloneSchema.parse({ ...BASE, audio_urls: [] })).toThrow();
    expect(() => VoiceCloneSchema.parse({ ...BASE, audio_urls: ["not a url"] })).toThrow();
  });

  it("sync/미정의 필드 거부 (strict)", () => {
    expect(() => VoiceCloneSchema.parse({ ...BASE, sync: true })).toThrow();
    expect(() => VoiceCloneSchema.parse({ ...BASE, language: "ko" })).toThrow();
  });
});
