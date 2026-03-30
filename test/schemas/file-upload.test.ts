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
});
