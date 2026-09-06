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

  it("model만으로 유효 (image_url optional)", () => {
    const result = VideoGenerateSchema.parse({ model: "seedance-2.0", prompt: "a cat" });
    expect(result.model).toBe("seedance-2.0");
    expect(result.image_url).toBeUndefined();
  });

  it("reference-to-video: image_urls 배열 유효 (image_url 없이)", () => {
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      prompt: "@Image1 walks past @Image2",
      image_urls: [VALID_URL, "https://assets.xbrush.ai/ref2.png"],
    });
    expect(result.image_urls).toEqual([VALID_URL, "https://assets.xbrush.ai/ref2.png"]);
    expect(result.image_url).toBeUndefined();
  });

  it("image_urls 원소가 URL 아니면 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ model: "seedance-2.0", image_urls: ["not-a-url"] })
    ).toThrow();
  });

  it("image_urls 빈 배열 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ model: "seedance-2.0", image_urls: [] })
    ).toThrow();
  });

  it("reference-to-video: image_urls 객체 {url, role} 유효", () => {
    const refs = [
      { url: VALID_URL, role: "first_frame" },
      { url: "https://assets.xbrush.ai/ref2.png", role: "last_frame" },
      { url: "https://assets.xbrush.ai/ref3.png", role: "reference_image" },
    ];
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      prompt: "변하는 영상",
      image_urls: refs,
    });
    expect(result.image_urls).toEqual(refs);
  });

  it("image_urls 객체 role 생략 유효 (role optional)", () => {
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      prompt: "x",
      image_urls: [{ url: VALID_URL }],
    });
    expect(result.image_urls).toEqual([{ url: VALID_URL }]);
  });

  it("image_urls 문자열 + 객체 혼합 유효 (하위호환)", () => {
    const mixed = [
      VALID_URL,
      { url: "https://assets.xbrush.ai/ref2.png", role: "reference_image" },
    ];
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      prompt: "x",
      image_urls: mixed,
    });
    expect(result.image_urls).toEqual(mixed);
  });

  it("image_urls 객체에 url 없으면 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({
        model: "seedance-2.0",
        image_urls: [{ role: "first_frame" }],
      })
    ).toThrow();
  });

  it("image_urls 객체 url이 비URL이면 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({
        model: "seedance-2.0",
        image_urls: [{ url: "nope", role: "first_frame" }],
      })
    ).toThrow();
  });

  it("image_urls 객체에 미정의 키 있으면 거부 (strict)", () => {
    expect(() =>
      VideoGenerateSchema.parse({
        model: "seedance-2.0",
        image_urls: [{ url: VALID_URL, weight: 1 }],
      })
    ).toThrow();
  });

  it("idea 필드 유효 (비영어 — 서버 번역)", () => {
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      idea: "변하는 영상이고 @Image1이 잠깐 나와",
      image_urls: [{ url: VALID_URL, role: "reference_image" }],
    });
    expect(result.idea).toBe("변하는 영상이고 @Image1이 잠깐 나와");
  });

  it("prompt와 idea 둘 다 optional (서버가 prompt|idea 검증)", () => {
    const result = VideoGenerateSchema.parse({ model: "seedance-2.0" });
    expect(result.prompt).toBeUndefined();
    expect(result.idea).toBeUndefined();
  });

  it("resolution/aspect_ratio/generate_audio/consistency_mode 유효", () => {
    const result = VideoGenerateSchema.parse({
      model: "seedance-2.0",
      prompt: "x",
      resolution: "720p",
      aspect_ratio: "adaptive",
      generate_audio: true,
      consistency_mode: "advanced",
    });
    expect(result.resolution).toBe("720p");
    expect(result.aspect_ratio).toBe("adaptive");
    expect(result.generate_audio).toBe(true);
    expect(result.consistency_mode).toBe("advanced");
  });

  it("generate_audio 불리언 아니면 거부", () => {
    expect(() =>
      VideoGenerateSchema.parse({ model: "seedance-2.0", prompt: "x", generate_audio: "yes" })
    ).toThrow();
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => VideoGenerateSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("model 누락 시 에러", () => {
    expect(() => VideoGenerateSchema.parse({ image_url: VALID_URL })).toThrow();
  });

  it("image_url 누락 허용 (optional — t2v / reference-to-video)", () => {
    const result = VideoGenerateSchema.parse({ model: "kling" });
    expect(result.model).toBe("kling");
    expect(result.image_url).toBeUndefined();
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

  it("duration=7 유효 (model-specific 범위 — 서버가 모델별로 검증)", () => {
    const result = VideoGenerateSchema.parse({ ...base, duration: 7 });
    expect(result.duration).toBe(7);
  });

  it("duration=15 유효 (seedance-2.0 상한)", () => {
    const result = VideoGenerateSchema.parse({ ...base, duration: 15 });
    expect(result.duration).toBe(15);
  });

  it("duration 정수 아니면 거부", () => {
    expect(() => VideoGenerateSchema.parse({ ...base, duration: 5.5 })).toThrow();
  });

  it("duration 범위(1-30) 밖 거부", () => {
    expect(() => VideoGenerateSchema.parse({ ...base, duration: 0 })).toThrow();
    expect(() => VideoGenerateSchema.parse({ ...base, duration: 31 })).toThrow();
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
      VideoExtendSchema.parse({ ...base, unknown_field: "x" })
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
