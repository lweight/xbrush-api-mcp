import { describe, it, expect } from "vitest";
import {
  GetRequestSchema,
  ListRequestsSchema,
  CheckHealthSchema,
} from "../../src/schemas/requests.js";

describe("GetRequestSchema", () => {
  const validId = "req" + "a".repeat(21); // 24 chars

  it("유효한 request_id (24자)", () => {
    const result = GetRequestSchema.parse({ request_id: validId });
    expect(result.request_id).toBe(validId);
  });

  it("짧은 request_id 거부", () => {
    expect(() =>
      GetRequestSchema.parse({ request_id: "req123" })
    ).toThrow();
  });

  it("request_id 누락 거부", () => {
    expect(() => GetRequestSchema.parse({})).toThrow();
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      GetRequestSchema.parse({ request_id: validId, verbose: true })
    ).toThrow();
  });
});

describe("ListRequestsSchema", () => {
  it("빈 객체 유효", () => {
    const result = ListRequestsSchema.parse({});
    expect(result.limit).toBeUndefined();
    expect(result.cursor).toBeUndefined();
  });

  it("limit=50 유효", () => {
    const result = ListRequestsSchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it("limit=0 거부", () => {
    expect(() => ListRequestsSchema.parse({ limit: 0 })).toThrow();
  });

  it("limit=101 거부", () => {
    expect(() => ListRequestsSchema.parse({ limit: 101 })).toThrow();
  });
});

describe("CheckHealthSchema", () => {
  it("빈 객체 유효", () => {
    const result = CheckHealthSchema.parse({});
    expect(result).toEqual({});
  });

  it("아무 필드나 거부", () => {
    expect(() => CheckHealthSchema.parse({ foo: "bar" })).toThrow();
  });
});
