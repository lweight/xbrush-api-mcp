import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushSyncResponse, XBrushAsyncResponse } from "../../src/types.js";

// Mock makeApiRequest — 나머지 함수는 실제 로직 사용
vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return {
    ...actual,
    makeApiRequest: vi.fn(),
  };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerVideoTools } from "../../src/tools/video.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockVideoSync: XBrushSyncResponse = {
  requestId: "req" + "v".repeat(21),
  status: "completed",
  domain: "video",
  action: "generate",
  creditCharged: 50,
  output: { videoUrl: "https://assets.xbrush.ai/video1.mp4" },
  completedAt: "2025-01-01T00:00:00Z",
  syncCompleted: true,
};

const mockVideoAsync: XBrushAsyncResponse = {
  requestId: "req" + "w".repeat(21),
  status: "pending",
  domain: "video",
  action: "generate",
  creditCharged: 50,
  estimatedTimeout: 300,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerVideoTools(mock.server);
  handlers = mock.handlers;
});

// ── xbrush_video_generate ────────────────────────────────────────────

describe("xbrush_video_generate", () => {
  it("기본(async) — requestId 반환", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("async");
    expect(result.content[0].text).toContain(mockVideoAsync.requestId);
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("async — /v1/video/generate 호출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/generate");
  });

  it("sync=true — 완료 결과 + videoUrl 포함", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoSync);
    const result = await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
      sync: true,
    });
    expect(result.content[0].text).toContain("completed");
    expect(result.content[0].text).toContain("https://assets.xbrush.ai/video1.mp4");
  });

  it("sync=true — /v1/video/generate/sync 호출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoSync);
    await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
      sync: true,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/generate/sync");
  });

  it("snake_case → camelCase 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "wan",
      image_url: "https://a.com/start.png",
      end_image_url: "https://a.com/end.png",
      prompt_relevance: 0.8,
      duration: 10,
      prompt: "zoom in",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrl).toBe("https://a.com/start.png");
    expect(callArgs.data.endImageUrl).toBe("https://a.com/end.png");
    expect(callArgs.data.promptRelevance).toBe(0.8);
    expect(callArgs.data.duration).toBe(10);
    expect(callArgs.data.prompt).toBe("zoom in");
  });

  it("optional 필드 미전달 시 body에 미포함", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://a.com/start.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data).toEqual({
      model: "kling",
      imageUrl: "https://a.com/start.png",
    });
  });

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("video service down"));
    const result = await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://a.com/start.png",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("video service down");
  });
});

// ── xbrush_video_upscale ─────────────────────────────────────────────

describe("xbrush_video_upscale", () => {
  it("기본(async) — requestId 반환", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("async");
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("async — /v1/video/upscale 호출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/upscale");
  });

  it("sync=true — /v1/video/upscale/sync 호출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoSync);
    await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
      sync: true,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/upscale/sync");
  });

  it("sync=true — videoUrl 포함 결과", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoSync);
    const result = await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
      sync: true,
    });
    expect(result.content[0].text).toContain("completed");
    expect(result.content[0].text).toContain("video1.mp4");
  });

  it("video_url → videoUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_upscale")!({
      video_url: "https://a.com/video.mp4",
      scale: 2,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.videoUrl).toBe("https://a.com/video.mp4");
  });

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("upscale failed"));
    const result = await handlers.get("xbrush_video_upscale")!({
      video_url: "https://a.com/video.mp4",
      scale: 2,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upscale failed");
  });
});
