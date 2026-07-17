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

  it("resolution/aspect_ratio/quality 유효", () => {
    const result = ImageGenerateSchema.parse({
      ...base,
      resolution: "2K",
      aspect_ratio: "16:9",
      quality: "high",
    });
    expect(result.resolution).toBe("2K");
    expect(result.aspect_ratio).toBe("16:9");
    expect(result.quality).toBe("high");
  });

  it("quality 잘못된 값 거부", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, quality: "ultra" })).toThrow();
  });

  it("resolution 빈 문자열 거부", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, resolution: "" })).toThrow();
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

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      ImageGenerateSchema.parse({ ...base, unknown_field: true })
    ).toThrow();
  });

  describe("loras (2026-07-17 LoRA 적용)", () => {
    it("[{url, weight}] 유효 (weight 경계 0/2)", () => {
      const r = ImageGenerateSchema.parse({
        ...base,
        loras: [
          { url: "https://cdn.xbrush.ai/lora/a.safetensors", weight: 0 },
          { url: "https://cdn.xbrush.ai/lora/b.safetensors", weight: 2 },
        ],
      });
      expect(r.loras).toHaveLength(2);
    });

    it("weight 범위 밖/누락, url 누락/비URL, 빈 배열, 미정의 필드 거부", () => {
      const u = "https://cdn.xbrush.ai/lora/a.safetensors";
      expect(() =>
        ImageGenerateSchema.parse({ ...base, loras: [{ url: u, weight: 2.1 }] })
      ).toThrow();
      expect(() =>
        ImageGenerateSchema.parse({ ...base, loras: [{ url: u, weight: -0.1 }] })
      ).toThrow();
      expect(() => ImageGenerateSchema.parse({ ...base, loras: [{ url: u }] })).toThrow();
      expect(() => ImageGenerateSchema.parse({ ...base, loras: [{ weight: 1 }] })).toThrow();
      expect(() =>
        ImageGenerateSchema.parse({ ...base, loras: [{ url: "not-a-url", weight: 1 }] })
      ).toThrow();
      expect(() => ImageGenerateSchema.parse({ ...base, loras: [] })).toThrow();
      expect(() =>
        ImageGenerateSchema.parse({ ...base, loras: [{ url: u, weight: 1, scale: 1 }] })
      ).toThrow();
    });
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

  it("resolution/aspect_ratio/quality 유효", () => {
    const result = ImageEditSchema.parse({
      ...base,
      resolution: "1K",
      aspect_ratio: "1:1",
      quality: "medium",
    });
    expect(result.resolution).toBe("1K");
    expect(result.aspect_ratio).toBe("1:1");
    expect(result.quality).toBe("medium");
  });

  it("quality 잘못된 값 거부", () => {
    expect(() => ImageEditSchema.parse({ ...base, quality: "best" })).toThrow();
  });

  it("image_urls 추가 레퍼런스 배열 유효", () => {
    const refs = ["https://a.com/1.png", "https://a.com/2.png"];
    const result = ImageEditSchema.parse({ ...base, image_urls: refs });
    expect(result.image_urls).toEqual(refs);
  });

  it("image_urls 내 잘못된 URL 거부", () => {
    expect(() =>
      ImageEditSchema.parse({ ...base, image_urls: ["https://a.com/1.png", "nope"] })
    ).toThrow();
  });

  it("image_urls 빈 배열 거부", () => {
    expect(() => ImageEditSchema.parse({ ...base, image_urls: [] })).toThrow();
  });

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => ImageEditSchema.parse({ ...base, sync: true })).toThrow();
  });

  it("mode='inpaint' 유효", () => {
    expect(ImageEditSchema.parse({ ...base, mode: "inpaint" }).mode).toBe("inpaint");
  });

  it("mode='outpaint' 유효", () => {
    expect(ImageEditSchema.parse({ ...base, mode: "outpaint" }).mode).toBe("outpaint");
  });

  it("mode 잘못된 값 거부", () => {
    expect(() => ImageEditSchema.parse({ ...base, mode: "extend" })).toThrow();
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

  it("sync 필드 거부 (async 전용)", () => {
    expect(() => ImageUpscaleSchema.parse({ ...base, sync: true })).toThrow();
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
