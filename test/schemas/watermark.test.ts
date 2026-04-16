import { describe, it, expect } from "vitest";
import { WatermarkAddSchema } from "../../src/schemas/watermark.js";

const IMG = "https://cdn.xbrush.run/in.png";
const VID = "https://cdn.xbrush.run/in.mp4";

describe("WatermarkAddSchema", () => {
  it("image_url 만으로 유효", () => {
    const r = WatermarkAddSchema.parse({ image_url: IMG });
    expect(r.image_url).toBe(IMG);
  });

  it("video_url 만으로 유효", () => {
    const r = WatermarkAddSchema.parse({ video_url: VID });
    expect(r.video_url).toBe(VID);
  });

  it("image_url + video_url 둘 다 없으면 거부", () => {
    expect(() => WatermarkAddSchema.parse({})).toThrow(/image_url or video_url/);
  });

  it("text 같은 커스텀 필드 거부 (서버가 지원 안 함)", () => {
    expect(() =>
      WatermarkAddSchema.parse({ image_url: IMG, text: "t" })
    ).toThrow();
  });

  it("position/opacity 필드 거부", () => {
    expect(() =>
      WatermarkAddSchema.parse({ image_url: IMG, position: "center" })
    ).toThrow();
    expect(() =>
      WatermarkAddSchema.parse({ image_url: IMG, opacity: 0.5 })
    ).toThrow();
  });

  it("sync=false 유효", () => {
    expect(
      WatermarkAddSchema.parse({ image_url: IMG, sync: false }).sync
    ).toBe(false);
  });
});
