import { describe, it, expect } from "vitest";
import { FileUploadSchema } from "../../src/schemas/file-upload.js";

describe("FileUploadSchema", () => {
  it("유효한 경로", () => {
    const result = FileUploadSchema.parse({ file_path: "/tmp/image.png" });
    expect(result.file_path).toBe("/tmp/image.png");
  });

  it("file_path 누락 거부", () => {
    expect(() => FileUploadSchema.parse({})).toThrow();
  });

  it("미정의 필드 거부", () => {
    expect(() =>
      FileUploadSchema.parse({ file_path: "/tmp/x.png", overwrite: true })
    ).toThrow();
  });

  it("strategy='auto' 유효", () => {
    expect(
      FileUploadSchema.parse({ file_path: "/x.png", strategy: "auto" }).strategy
    ).toBe("auto");
  });

  it("strategy='direct' 유효", () => {
    expect(
      FileUploadSchema.parse({ file_path: "/x.png", strategy: "direct" }).strategy
    ).toBe("direct");
  });

  it("strategy='presign' 유효", () => {
    expect(
      FileUploadSchema.parse({ file_path: "/x.png", strategy: "presign" }).strategy
    ).toBe("presign");
  });

  it("strategy 잘못된 값 거부", () => {
    expect(() =>
      FileUploadSchema.parse({ file_path: "/x.png", strategy: "s3" })
    ).toThrow();
  });
});
