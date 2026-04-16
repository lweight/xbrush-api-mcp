import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushAsyncResponse } from "../../src/types.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerWatermarkTools } from "../../src/tools/watermark.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "x".repeat(21),
  status: "pending",
  domain: "watermark",
  action: "add",
  creditCharged: 5,
  estimatedTimeout: 300,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerWatermarkTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_watermark_add", () => {
  it("성공 — async 제출 + image_url", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_watermark_add")!({
      image_url: "https://a.com/in.png",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
  });

  it("/v1/watermark/add (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_watermark_add")!({
      image_url: "https://a.com/in.png",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/watermark/add");
  });

  it("video_url → videoUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_watermark_add")!({
      video_url: "https://a.com/in.mp4",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.videoUrl).toBe("https://a.com/in.mp4");
    expect("imageUrl" in args.data).toBe(false);
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("watermark service busy"));
    const result = await handlers.get("xbrush_watermark_add")!({
      image_url: "https://a.com/in.png",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("watermark service busy");
  });
});
