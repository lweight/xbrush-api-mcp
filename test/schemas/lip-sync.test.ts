import { describe, it, expect } from "vitest";
import { VideoLipSyncSchema } from "../../src/schemas/lip-sync.js";

const V = "https://cdn.xbrush.ai/v.mp4";
const I = "https://cdn.xbrush.ai/face.png";
const A = "https://cdn.xbrush.ai/a.mp3";

describe("VideoLipSyncSchema", () => {
  it("video_url + audio_url 유효 (영상 기반)", () => {
    const r = VideoLipSyncSchema.parse({ video_url: V, audio_url: A });
    expect(r.video_url).toBe(V);
    expect(r.audio_url).toBe(A);
  });

  it("image_url + audio_url 유효 (fabric talking photo)", () => {
    const r = VideoLipSyncSchema.parse({
      model: "fabric-1.0",
      image_url: I,
      audio_url: A,
    });
    expect(r.image_url).toBe(I);
    expect(r.model).toBe("fabric-1.0");
  });

  it("image_url + text + voice_id 유효 (내장 TTS)", () => {
    const r = VideoLipSyncSchema.parse({
      model: "fabric-1.0-fast",
      image_url: I,
      text: "안녕하세요",
      voice_id: "voice_abc",
      duration: 10,
      resolution: "480p",
    });
    expect(r.text).toBe("안녕하세요");
    expect(r.voice_id).toBe("voice_abc");
    expect(r.duration).toBe(10);
    expect(r.resolution).toBe("480p");
  });

  it("model optional 유효", () => {
    const r = VideoLipSyncSchema.parse({
      video_url: V,
      audio_url: A,
      model: "pixverse-lipsync",
    });
    expect(r.model).toBe("pixverse-lipsync");
  });

  it("duration 범위 밖 거부 (0, 61)", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, duration: 0 })
    ).toThrow();
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, duration: 61 })
    ).toThrow();
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, sync: true })
    ).toThrow();
  });

  it("잘못된 URL 거부", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: "not-url", audio_url: A })
    ).toThrow();
    expect(() =>
      VideoLipSyncSchema.parse({ image_url: "not-url", audio_url: A })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      VideoLipSyncSchema.parse({ video_url: V, audio_url: A, intensity: 0.8 })
    ).toThrow();
  });
});
