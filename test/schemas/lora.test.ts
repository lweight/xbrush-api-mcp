import { describe, it, expect } from "vitest";
import { LoraTrainSchema } from "../../src/schemas/lora.js";

const BASE = {
  name: "my-style",
  image_urls: ["https://assets.xbrush.ai/a.png"],
};

describe("LoraTrainSchema", () => {
  it("name + image_urls만으로 유효", () => {
    const r = LoraTrainSchema.parse(BASE);
    expect(r.name).toBe("my-style");
    expect(r.image_urls).toHaveLength(1);
  });

  it("전체 옵션 필드 유효 (steps 경계 500/8000)", () => {
    const r = LoraTrainSchema.parse({
      ...BASE,
      model: "flux.1-dev",
      trigger_word: "MYSTYLE",
      steps: 500,
    });
    expect(r.steps).toBe(500);
    LoraTrainSchema.parse({ ...BASE, steps: 8000 });
  });

  it("name 누락/공백 거부", () => {
    expect(() => LoraTrainSchema.parse({ image_urls: BASE.image_urls })).toThrow();
    expect(() => LoraTrainSchema.parse({ ...BASE, name: "  " })).toThrow();
  });

  it("image_urls 빈 배열/80개 초과/비URL 거부 (서버: 1~80 HTTPS)", () => {
    expect(() => LoraTrainSchema.parse({ ...BASE, image_urls: [] })).toThrow();
    const many = Array.from({ length: 81 }, (_, i) => `https://a.com/${i}.png`);
    expect(() => LoraTrainSchema.parse({ ...BASE, image_urls: many })).toThrow();
    LoraTrainSchema.parse({ ...BASE, image_urls: many.slice(0, 80) });
    expect(() => LoraTrainSchema.parse({ ...BASE, image_urls: ["not-a-url"] })).toThrow();
  });

  it("steps 범위 밖 거부 (499, 8001, 소수)", () => {
    expect(() => LoraTrainSchema.parse({ ...BASE, steps: 499 })).toThrow();
    expect(() => LoraTrainSchema.parse({ ...BASE, steps: 8001 })).toThrow();
    expect(() => LoraTrainSchema.parse({ ...BASE, steps: 1000.5 })).toThrow();
  });

  it("sync/미정의 필드 거부 (strict)", () => {
    expect(() => LoraTrainSchema.parse({ ...BASE, sync: true })).toThrow();
    expect(() => LoraTrainSchema.parse({ ...BASE, epochs: 3 })).toThrow();
  });
});
