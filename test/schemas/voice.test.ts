import { describe, it, expect } from "vitest";
import { ListVoicesSchema } from "../../src/schemas/voice.js";

describe("ListVoicesSchema", () => {
  it("빈 객체 유효 (model 옵션)", () => {
    expect(ListVoicesSchema.parse({}).model).toBeUndefined();
  });

  it("model 지정 유효", () => {
    expect(ListVoicesSchema.parse({ model: "speech-2.8-hd" }).model).toBe(
      "speech-2.8-hd"
    );
  });

  it("미정의 필드 거부 (strict)", () => {
    expect(() => ListVoicesSchema.parse({ provider: "elevenlabs" })).toThrow();
  });
});
