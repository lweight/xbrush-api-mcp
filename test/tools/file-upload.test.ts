import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../src/services/file-upload.js", () => ({
  uploadFile: vi.fn(),
}));

// handleToolError / buildToolResult는 실제 로직 필요 — xbrush-client mock 최소화
vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return {
    ...actual,
    makeApiRequest: vi.fn(),
  };
});

import { uploadFile } from "../../src/services/file-upload.js";
import { registerFileUploadTools } from "../../src/tools/file-upload.js";

const mockedUpload = vi.mocked(uploadFile);
let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerFileUploadTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_file_upload", () => {
  it("성공", async () => {
    mockedUpload.mockResolvedValueOnce({
      cdnUrl: "https://cdn.xbrush.ai/uploads/test.png",
    });
    const result = await handlers.get("xbrush_file_upload")!({
      file_path: "/tmp/test.png",
    });
    const text = result.content[0].text;
    expect(text).toContain("uploaded successfully");
    expect(text).toContain("https://cdn.xbrush.ai/uploads/test.png");
  });

  it("업로드 실패 → isError + 메시지 포함", async () => {
    mockedUpload.mockRejectedValueOnce(new Error("S3 upload failed: 403"));
    const result = await handlers.get("xbrush_file_upload")!({
      file_path: "/tmp/bad.png",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("S3 upload failed");
    expect(result.content[0].text).toContain("Suggestion");
  });
});
