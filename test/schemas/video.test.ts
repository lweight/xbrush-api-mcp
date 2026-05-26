import { describe, it, expect } from "vitest";
import {
  VideoGenerateSchema,
  VideoUpscaleSchema,
  VideoExtendSchema,
  VideoRetakeSchema,
} from "../../src/schemas/video.js";

const VALID_URL = "https://assets.xbrush.ai/test.png";
const VALID_VIDEO_URL = "https://assets.xbrush.ai/test.mp4";

describe("VideoGenerateSchema", () => {
  const base = { model: "kling", image_url: VALID_URL };

  it("필수 필드만으로 유효", () => {
    const result = VideoGenerateSchema.parse(base);
    expect(result.model).toBe("kling");
    expect(result.image_url).toBe(VALID_URL);
    expect(result.prompt).toBeUndefined();
  });

  it("전체 필드 유효", () => {
    const result = VideoGenerateSchema.parse({
      ...base,
      prompt: "camera zoom in",
      end_image_url: VALID_URL,
      duration: 5,
      prompt_relevance: 0.7,
    });
    expect(result.prompt).toBe("camera zoom in");
    expect(result.end_image_url).toBe(VALID_URL);
    expect(result.duration).toBe(5);
    expect(result.prompt_relevance).toBe(0.7);
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => VideoGenerateSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("model 누락 시 에러", () => {
    expect(() => VideoGenerateSchema.parse({ image_url: VALID_URL })).toThrow();
  });

  it("image_url 누락 시 에러", () => {
    expect(() => VideoGenerateSchema.parse({ model: "kling" })).toThrow();
  });

  it("image_url이 URL 아닌 경우 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, image_url: "not-url" })
    ).toThrow();
  });

  it("end_image_url이 URL 아닌 경우 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, end_image_url: "bad" })
    ).toThrow();
  });

  it("duration=5 유효", () => {
    const result = VideoGenerateSchema.parse({ ...base, duration: 5 });
    expect(result.duration).toBe(5);
  });

  it("duration=10 유효", () => {
    const result = VideoGenerateSchema.parse({ ...base, duration: 10 });
    expect(result.duration).toBe(10);
  });

  it("duration=7 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, duration: 7 })
    ).toThrow();
  });

  it("prompt_relevance=0 유효", () => {
    const result = VideoGenerateSchema.parse({ ...base, prompt_relevance: 0 });
    expect(result.prompt_relevance).toBe(0);
  });

  it("prompt_relevance=1 유효", () => {
    const result = VideoGenerateSchema.parse({ ...base, prompt_relevance: 1 });
    expect(result.prompt_relevance).toBe(1);
  });

  it("prompt_relevance 범위 초과 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, prompt_relevance: 1.5 })
    ).toThrow();
  });

  it("prompt_relevance 음수 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, prompt_relevance: -0.1 })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      VideoGenerateSchema.parse({ ...base, unknown_field: true })
    ).toThrow();
  });
});

describe("VideoUpscaleSchema", () => {
  const base = { video_url: VALID_VIDEO_URL, scale: 2 };

  it("필수 필드(video_url + scale)만 유효", () => {
    const result = VideoUpscaleSchema.parse(base);
    expect(result.video_url).toBe(VALID_VIDEO_URL);
    expect(result.scale).toBe(2);
  });

  it("scale=4 유효, model 포함", () => {
    const r = VideoUpscaleSchema.parse({ ...base, scale: 4, model: "RealESRGAN" });
    expect(r.scale).toBe(4);
    expect(r.model).toBe("RealESRGAN");
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => VideoUpscaleSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("video_url 누락 시 에러", () => {
    expect(() => VideoUpscaleSchema.parse({ scale: 2 })).toThrow();
  });

  it("scale 누락 시 에러", () => {
    expect(() => VideoUpscaleSchema.parse({ video_url: VALID_VIDEO_URL })).toThrow();
  });

  it("scale 범위 벗어나면 거부", () => {
    expect(() =>
      VideoUpscaleSchema.parse({ video_url: VALID_VIDEO_URL, scale: 1 })
    ).toThrow();
    expect(() =>
      VideoUpscaleSchema.parse({ video_url: VALID_VIDEO_URL, scale: 8 })
    ).toThrow();
  });

  it("video_url이 URL 아닌 경우 거부", () => {
    expect(() =>
      VideoUpscaleSchema.parse({ video_url: "not-a-url", scale: 2 })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      VideoUpscaleSchema.parse({ ...base, resolution: "4k" })
    ).toThrow();
  });
});

describe("VideoExtendSchema", () => {
  const base = { model: "ltx-2.3-extend", video_url: VALID_VIDEO_URL, duration: 5 };

  it("필수 필드 유효", () => {
    const r = VideoExtendSchema.parse(base);
    expect(r.model).toBe("ltx-2.3-extend");
    expect(r.video_url).toBe(VALID_VIDEO_URL);
    expect(r.duration).toBe(5);
  });

  it("model 누락 거부", () => {
    expect(() =>
      VideoExtendSchema.parse({ video_url: VALID_VIDEO_URL, duration: 5 })
    ).toThrow();
  });

  it("video_url 누락 거부", () => {
    expect(() => VideoExtendSchema.parse({ model: "m", duration: 5 })).toThrow();
  });

  it("duration 누락 거부", () => {
    expect(() =>
      VideoExtendSchema.parse({ model: "m", video_url: VALID_VIDEO_URL })
    ).toThrow();
  });

  it("duration 범위(1-20) 밖 거부", () => {
    expect(() => VideoExtendSchema.parse({ ...base, duration: 0 })).toThrow();
    expect(() => VideoExtendSchema.parse({ ...base, duration: 21 })).toThrow();
  });

  it("video_url 비URL 거부", () => {
    expect(() =>
      VideoExtendSchema.parse({ ...base, video_url: "nope" })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      VideoExtendSchema.parse({ ...base, prompt: "x" })
    ).toThrow();
  });
});

describe("VideoRetakeSchema", () => {
  const base = { model: "ltx-2.3-retake", video_url: VALID_VIDEO_URL, end_time: 3 };

  it("필수 필드 유효", () => {
    const r = VideoRetakeSchema.parse(base);
    expect(r.model).toBe("ltx-2.3-retake");
    expect(r.end_time).toBe(3);
  });

  it("end_time=0 유효", () => {
    expect(VideoRetakeSchema.parse({ ...base, end_time: 0 }).end_time).toBe(0);
  });

  it("end_time 음수 거부", () => {
    expect(() => VideoRetakeSchema.parse({ ...base, end_time: -1 })).toThrow();
  });

  it("model/video_url/end_time 누락 거부", () => {
    expect(() =>
      VideoRetakeSchema.parse({ video_url: VALID_VIDEO_URL, end_time: 3 })
    ).toThrow();
    expect(() =>
      VideoRetakeSchema.parse({ model: "m", end_time: 3 })
    ).toThrow();
    expect(() =>
      VideoRetakeSchema.parse({ model: "m", video_url: VALID_VIDEO_URL })
    ).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() => VideoRetakeSchema.parse({ ...base, foo: 1 })).toThrow();
  });
});
