import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs so we don't touch the real filesystem
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => Buffer.from("fake-image-bytes")),
  statSync: vi.fn(() => ({ size: 1_000_000 })),
}));

// Mock the xbrush-client's makeApiRequest (presign path) and getApiKey (direct path)
vi.mock("../../src/services/xbrush-client.js", () => ({
  makeApiRequest: vi.fn(),
  getApiKey: vi.fn(() => {
    if (!process.env.XBRUSH_API_KEY) {
      throw new Error("XBRUSH_API_KEY environment variable is not set");
    }
    return process.env.XBRUSH_API_KEY;
  }),
}));

import { statSync } from "fs";
import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { uploadFile, DIRECT_UPLOAD_THRESHOLD } from "../../src/services/file-upload.js";

const mockedApi = vi.mocked(makeApiRequest);
const mockedStat = vi.mocked(statSync);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.XBRUSH_API_KEY = "test-key";
  mockedStat.mockReturnValue({ size: 1_000_000 } as ReturnType<typeof statSync>);
});

function mockPresign() {
  mockedApi.mockResolvedValueOnce({
    uploadUrl: "https://s3.example/upload",
    fields: { key: "abc", policy: "p" },
    fileKey: "abc",
    cdnUrl: "https://cdn.xbrush.ai/abc.png",
    expiresIn: 60,
  });
}

function mockFetchOk(body: unknown) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function mockFetchFail(status = 500, statusText = "ERR") {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => "failure",
  })) as unknown as typeof fetch;
}

describe("uploadFile — strategy=presign", () => {
  it("presign + S3 업로드 → cdnUrl 반환", async () => {
    mockPresign();
    mockFetchOk({});
    const result = await uploadFile("/tmp/image.png", "presign");
    expect(result.cdnUrl).toBe("https://cdn.xbrush.ai/abc.png");
    expect(result.strategy).toBe("presign");
    const apiCall = mockedApi.mock.calls.at(-1)![0] as any;
    expect(apiCall.url).toBe("/v1/files/presign");
  });

  it("S3 업로드 실패 → throw", async () => {
    mockPresign();
    mockFetchFail(403, "Forbidden");
    await expect(uploadFile("/tmp/image.png", "presign")).rejects.toThrow(/S3 upload failed/);
  });
});

describe("uploadFile — strategy=direct", () => {
  it("direct POST /v1/files/upload → cdnUrl 반환", async () => {
    mockFetchOk({ cdnUrl: "https://cdn.xbrush.ai/direct/x.png" });
    const result = await uploadFile("/tmp/image.png", "direct");
    expect(result.cdnUrl).toBe("https://cdn.xbrush.ai/direct/x.png");
    expect(result.strategy).toBe("direct");
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(fetchCall[0]).toContain("/v1/files/upload");
  });

  it("cdnUrl 없고 url만 있으면 url 사용", async () => {
    mockFetchOk({ url: "https://cdn.xbrush.ai/fallback.png" });
    const result = await uploadFile("/tmp/image.png", "direct");
    expect(result.cdnUrl).toBe("https://cdn.xbrush.ai/fallback.png");
  });

  it("direct 응답에 cdnUrl/url 없으면 throw", async () => {
    mockFetchOk({ id: "abc" });
    await expect(uploadFile("/tmp/image.png", "direct")).rejects.toThrow(/missing cdnUrl/);
  });

  it("direct 실패 상태 → throw", async () => {
    mockFetchFail(500);
    await expect(uploadFile("/tmp/image.png", "direct")).rejects.toThrow(/Direct upload failed/);
  });

  it("API 키 없으면 throw", async () => {
    delete process.env.XBRUSH_API_KEY;
    await expect(uploadFile("/tmp/image.png", "direct")).rejects.toThrow(/XBRUSH_API_KEY/);
  });
});

describe("uploadFile — strategy=auto", () => {
  it("파일이 임계값 미만 → direct 선택", async () => {
    mockedStat.mockReturnValue({ size: DIRECT_UPLOAD_THRESHOLD - 1 } as ReturnType<typeof statSync>);
    mockFetchOk({ cdnUrl: "https://cdn.xbrush.ai/small.png" });
    const result = await uploadFile("/tmp/small.png", "auto");
    expect(result.strategy).toBe("direct");
  });

  it("파일이 임계값 이상 → presign 선택", async () => {
    mockedStat.mockReturnValue({ size: DIRECT_UPLOAD_THRESHOLD + 1 } as ReturnType<typeof statSync>);
    mockPresign();
    mockFetchOk({});
    const result = await uploadFile("/tmp/big.mp4", "auto");
    expect(result.strategy).toBe("presign");
  });
});
