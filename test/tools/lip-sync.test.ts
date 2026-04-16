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
import { registerLipSyncTools } from "../../src/tools/lip-sync.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "l".repeat(21),
  status: "pending",
  domain: "video",
  action: "lip-sync",
  creditCharged: 5,
  estimatedTimeout: 180,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerLipSyncTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_video_lip_sync", () => {
  it("성공 — async 제출 + requestId 반환", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_video_lip_sync")!({
      video_url: "https://a.com/v.mp4",
      audio_url: "https://a.com/a.mp3",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
  });

  it("/v1/video/lip-sync (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_video_lip_sync")!({
      video_url: "https://a.com/v.mp4",
      audio_url: "https://a.com/a.mp3",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/video/lip-sync");
  });

  it("video_url/audio_url → videoUrl/audioUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_video_lip_sync")!({
      video_url: "https://a.com/v.mp4",
      audio_url: "https://a.com/a.mp3",
      model: "pixverse",
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data.videoUrl).toBe("https://a.com/v.mp4");
    expect(args.data.audioUrl).toBe("https://a.com/a.mp3");
    expect(args.data.model).toBe("pixverse");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("lip-sync model unavailable"));
    const result = await handlers.get("xbrush_video_lip_sync")!({
      video_url: "https://a.com/v.mp4",
      audio_url: "https://a.com/a.mp3",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("lip-sync model unavailable");
  });
});
