import { describe, it, expect } from "vitest";
import { ContentModerateSchema } from "../../src/schemas/moderation.js";

const IMG = "https://cdn.xbrush.run/in.png";
const VID = "https://cdn.xbrush.run/in.mp4";

describe("ContentModerateSchema", () => {
  it("image_url 단독 유효", () => {
    expect(ContentModerateSchema.parse({ image_url: IMG }).image_url).toBe(IMG);
  });

  it("video_url 단독 유효", () => {
    expect(ContentModerateSchema.parse({ video_url: VID }).video_url).toBe(VID);
  });

  it("둘 다 없으면 거부", () => {
    expect(() => ContentModerateSchema.parse({})).toThrow();
  });

  it("둘 다 있으면 거부 (정확히 하나만)", () => {
    expect(() =>
      ContentModerateSchema.parse({ image_url: IMG, video_url: VID })
    ).toThrow();
  });

  it("image_url 비URL 거부", () => {
    expect(() => ContentModerateSchema.parse({ image_url: "nope" })).toThrow();
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() =>
      ContentModerateSchema.parse({ image_url: IMG, foo: 1 })
    ).toThrow();
  });
});
