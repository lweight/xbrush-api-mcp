import { describe, it, expect } from "vitest";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageRemoveBgSchema,
} from "../../src/schemas/image.js";

const VALID_URL = "https://assets.xbrush.ai/test.png";

describe("ImageGenerateSchema", () => {
  const base = { model: "z-image-turbo", prompt: "a cat" };

  it("필수 필드만으로 유효", () => {
    const result = ImageGenerateSchema.parse(base);
    expect(result.model).toBe("z-image-turbo");
    expect(result.prompt).toBe("a cat");
    expect(result.n).toBeUndefined();
  });

  it("전체 필드 유효", () => {
    const result = ImageGenerateSchema.parse({
      ...base,
      n: 4,
      negative_prompt: "blur",
      width: 1024,
      height: 1024,
      seed: 42,
    });
    expect(result.n).toBe(4);
    expect(result.seed).toBe(42);
  });

  it("prompt 누락 시 에러", () => {
    expect(() => ImageGenerateSchema.parse({ model: "x" })).toThrow();
  });

  it("model 누락 시 에러", () => {
    expect(() => ImageGenerateSchema.parse({ prompt: "x" })).toThrow();
  });

  it("width 범위 미달 거부", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, width: 100 })).toThrow();
  });

  it("width 범위 초과 거부", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, width: 5000 })).toThrow();
  });

  it("n 범위 초과 거부", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, n: 10 })).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      ImageGenerateSchema.parse({ ...base, unknown_field: true })
    ).toThrow();
  });
});

describe("ImageEditSchema", () => {
  const base = { model: "qwen-image-edit-re", prompt: "make it blue", image_url: VALID_URL };

  it("필수 필드 유효", () => {
    const result = ImageEditSchema.parse(base);
    expect(result.image_url).toBe(VALID_URL);
  });

  it("image_url이 URL 아닌 경우 거부", () => {
    expect(() =>
      ImageEditSchema.parse({ ...base, image_url: "not-a-url" })
    ).toThrow();
  });

  it("mask_url이 URL 아닌 경우 거부", () => {
    expect(() =>
      ImageEditSchema.parse({ ...base, mask_url: "bad" })
    ).toThrow();
  });

  it("옵션 전체 포함 유효", () => {
    const result = ImageEditSchema.parse({
      ...base,
      n: 2,
      mask_url: VALID_URL,
      width: 512,
      height: 512,
      seed: 7,
    });
    expect(result.n).toBe(2);
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      ImageEditSchema.parse({ ...base, style: "anime" })
    ).toThrow();
  });
});

describe("ImageUpscaleSchema", () => {
  const base = { image_url: VALID_URL };

  it("필수 필드만 유효", () => {
    const result = ImageUpscaleSchema.parse(base);
    expect(result.upscale_factor).toBeUndefined();
  });

  it("upscale_factor=4 유효", () => {
    const result = ImageUpscaleSchema.parse({ ...base, upscale_factor: 4 });
    expect(result.upscale_factor).toBe(4);
  });

  it("upscale_factor=5 거부", () => {
    expect(() =>
      ImageUpscaleSchema.parse({ ...base, upscale_factor: 5 })
    ).toThrow();
  });

  it("upscale_factor=1 거부", () => {
    expect(() =>
      ImageUpscaleSchema.parse({ ...base, upscale_factor: 1 })
    ).toThrow();
  });
});

describe("ImageRemoveBgSchema", () => {
  it("유효한 URL", () => {
    const result = ImageRemoveBgSchema.parse({ image_url: VALID_URL });
    expect(result.image_url).toBe(VALID_URL);
  });

  it("URL 아닌 문자열 거부", () => {
    expect(() =>
      ImageRemoveBgSchema.parse({ image_url: "not-url" })
    ).toThrow();
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      ImageRemoveBgSchema.parse({ image_url: VALID_URL, format: "png" })
    ).toThrow();
  });
});
