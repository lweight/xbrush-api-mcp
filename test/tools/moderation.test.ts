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
import { registerModerationTools } from "../../src/tools/moderation.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "m".repeat(21),
  status: "pending",
  domain: "image",
  action: "moderate",
  creditCharged: 0.01,
  estimatedTimeout: 30,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerModerationTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_content_moderate", () => {
  it("image_url → /v1/image/moderate {imageUrl}", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_content_moderate")!({
      image_url: "https://a.com/in.png",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/image/moderate");
    expect(args.data).toEqual({ imageUrl: "https://a.com/in.png" });
  });

  it("video_url → /v1/video/moderate {videoUrl}", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_content_moderate")!({
      video_url: "https://a.com/in.mp4",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/video/moderate");
    expect(args.data).toEqual({ videoUrl: "https://a.com/in.mp4" });
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("moderation busy"));
    const result = await handlers.get("xbrush_content_moderate")!({
      image_url: "https://a.com/in.png",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("moderation busy");
  });
});
