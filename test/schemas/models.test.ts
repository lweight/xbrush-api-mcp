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

  it("category='utility' 유효", () => {
    expect(ListModelsSchema.parse({ category: "utility" }).category).toBe("utility");
  });

  it("category='text' 유효 (chat LLM — 2026-07 추가)", () => {
    expect(ListModelsSchema.parse({ category: "text" }).category).toBe("text");
  });

  it("music, sound-effect, lip-sync 은 category가 아니므로 거부", () => {
    expect(() => ListModelsSchema.parse({ category: "music" })).toThrow();
    expect(() => ListModelsSchema.parse({ category: "sound-effect" })).toThrow();
    expect(() => ListModelsSchema.parse({ category: "lip-sync" })).toThrow();
  });

  it("잘못된 category 거부", () => {
    expect(() => ListModelsSchema.parse({ category: "chat" })).toThrow();
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      ListModelsSchema.parse({ category: "image", page: 1 })
    ).toThrow();
  });
});
