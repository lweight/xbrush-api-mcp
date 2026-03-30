import { describe, it, expect } from "vitest";
import { ListModelsSchema } from "../../src/schemas/models.js";

describe("ListModelsSchema", () => {
  it("빈 객체 유효", () => {
    const result = ListModelsSchema.parse({});
    expect(result.category).toBeUndefined();
  });

  it("category='image' 유효", () => {
    expect(ListModelsSchema.parse({ category: "image" }).category).toBe("image");
  });

  it("category='video' 유효", () => {
    expect(ListModelsSchema.parse({ category: "video" }).category).toBe("video");
  });

  it("category='audio' 유효", () => {
    expect(ListModelsSchema.parse({ category: "audio" }).category).toBe("audio");
  });

  it("잘못된 category 거부", () => {
    expect(() => ListModelsSchema.parse({ category: "text" })).toThrow();
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      ListModelsSchema.parse({ category: "image", page: 1 })
    ).toThrow();
  });
});
