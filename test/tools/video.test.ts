import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushAsyncResponse } from "../../src/types.js";

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
  it("성공 — async 제출 + requestId/안내 포함", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockVideoAsync.requestId);
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("/v1/video/generate (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "kling",
      image_url: "https://assets.xbrush.ai/start.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/generate");
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

  it("image_url 없이 model만 — body에 imageUrl 미포함", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "a cat",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data).toEqual({ model: "seedance-2.0", prompt: "a cat" });
    expect(callArgs.data).not.toHaveProperty("imageUrl");
  });

  it("reference-to-video: image_urls → imageUrls 매핑 (image_url 없이)", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "@Image1 and @Image2 dance",
      image_urls: ["https://a.com/ref1.png", "https://a.com/ref2.png"],
      duration: 12,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrls).toEqual([
      "https://a.com/ref1.png",
      "https://a.com/ref2.png",
    ]);
    expect(callArgs.data.duration).toBe(12);
    expect(callArgs.data).not.toHaveProperty("imageUrl");
  });

  it("reference-to-video: image_urls 객체 {url, role} → imageUrls 그대로 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const refs = [
      { url: "https://a.com/start.png", role: "first_frame" },
      { url: "https://a.com/end.png", role: "last_frame" },
      { url: "https://a.com/ref.png", role: "reference_image" },
    ];
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "transform with @Image3", // @Image3 = reference_image (position 3)
      image_urls: refs,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrls).toEqual(refs);
  });

  it("idea → body.idea 매핑 (비영어)", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      idea: "변하는 영상",
      image_urls: [{ url: "https://a.com/ref.png", role: "reference_image" }],
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.idea).toBe("변하는 영상");
    expect(callArgs.data).not.toHaveProperty("prompt");
  });

  it("resolution/aspect_ratio/generate_audio/consistency_mode → camelCase 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "x",
      resolution: "720p",
      aspect_ratio: "adaptive",
      generate_audio: true,
      consistency_mode: "advanced",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.resolution).toBe("720p");
    expect(callArgs.data.aspectRatio).toBe("adaptive");
    expect(callArgs.data.generateAudio).toBe(true);
    expect(callArgs.data.consistencyMode).toBe("advanced");
  });

  it("@ImageN 가드: @Image2가 reference_image(위치2) 지칭 → 정상 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "@Image2 appears briefly",
      image_urls: [
        { url: "https://a.com/last.png", role: "last_frame" },
        { url: "https://a.com/ref.png", role: "reference_image" },
      ],
    });
    expect(result.isError).toBeFalsy();
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrls).toHaveLength(2);
  });

  it("@ImageN 가드: @Image1이 last_frame(위치1) 지칭 → 에러 + 올바른 위치 안내", async () => {
    const result = await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "@Image1 appears briefly",
      image_urls: [
        { url: "https://a.com/last.png", role: "last_frame" },
        { url: "https://a.com/ref.png", role: "reference_image" },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("last_frame");
    expect(result.content[0].text).toContain("@Image2"); // 올바른 reference 위치 안내
  });

  it("@ImageN 가드: 범위 초과(@Image3, 항목 2개) → 에러", async () => {
    const result = await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      idea: "@Image3가 잠깐 나와",
      image_urls: [
        { url: "https://a.com/a.png", role: "reference_image" },
        { url: "https://a.com/b.png", role: "reference_image" },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("@Image1..@Image2");
  });

  it("@ImageN 가드: 문자열 배열 + @Image1 → 정상 (role 없음, 범위 내)", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.0",
      prompt: "@Image1 walks forward",
      image_urls: ["https://a.com/a.png", "https://a.com/b.png"],
    });
    expect(result.isError).toBeFalsy();
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
  it("성공 — async 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("/v1/video/upscale (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_upscale")!({
      video_url: "https://assets.xbrush.ai/video.mp4",
      scale: 2,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/video/upscale");
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

// ── xbrush_video_extend ──────────────────────────────────────────────

describe("xbrush_video_extend", () => {
  it("성공 — async 제출 + camelCase 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    const result = await handlers.get("xbrush_video_extend")!({
      model: "ltx-2.3-extend",
      video_url: "https://a.com/v.mp4",
      duration: 5,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("submitted (async)");
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/video/extend");
    expect(args.data).toEqual({
      model: "ltx-2.3-extend",
      videoUrl: "https://a.com/v.mp4",
      duration: 5,
    });
  });

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("extend failed"));
    const result = await handlers.get("xbrush_video_extend")!({
      model: "m",
      video_url: "https://a.com/v.mp4",
      duration: 5,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("extend failed");
  });
});

// ── xbrush_video_retake ──────────────────────────────────────────────

describe("xbrush_video_retake", () => {
  it("성공 — async 제출 + end_time→endTime", async () => {
    mockedApi.mockResolvedValueOnce(mockVideoAsync);
    await handlers.get("xbrush_video_retake")!({
      model: "ltx-2.3-retake",
      video_url: "https://a.com/v.mp4",
      end_time: 3,
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/video/retake");
    expect(args.data.endTime).toBe(3);
    expect(args.data.videoUrl).toBe("https://a.com/v.mp4");
  });

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("retake failed"));
    const result = await handlers.get("xbrush_video_retake")!({
      model: "m",
      video_url: "https://a.com/v.mp4",
      end_time: 0,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("retake failed");
  });
});
