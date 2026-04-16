import { describe, it, expect } from "vitest";
import { VideoLipSyncSchema } from "../../src/schemas/lip-sync.js";

const V = "https://cdn.xbrush.ai/v.mp4";
const A = "https://cdn.xbrush.ai/a.mp3";

describe("VideoLipSyncSchema", () => {
  it("video_url + audio_url만으로 유효", () => {
    const r = VideoLipSyncSchema.parse({ video_url: V, audio_url: A });
    expect(r.video_url).toBe(V);
    expect(r.audio_url).toBe(A);
  });

  it("model optional 유효", () => {
    const r = VideoLipSyncSchema.parse({
      video_url: V,
      audio_url: A,
      model: "pixverse",
    });
    expect(r.model).toBe("pixverse");
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, sync: true })
    ).toThrow();
  });

  it("video_url 누락 거부", () => {
    expect(() => VideoLipSyncSchema.parse({ audio_url: A })).toThrow();
  });

  it("audio_url 누락 거부", () => {
    expect(() => VideoLipSyncSchema.parse({ video_url: V })).toThrow();
  });

  it("잘못된 URL 거부", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: "not-url", audio_url: A })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, intensity: 0.8 })
    ).toThrow();
  });

});
