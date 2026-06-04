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
import { registerImageTools } from "../../src/tools/image.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "b".repeat(21),
  status: "pending",
  domain: "image",
  action: "generate",
  creditCharged: 10,
  estimatedTimeout: 60,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerImageTools(mock.server);
  handlers = mock.handlers;
});

// ── xbrush_image_generate ────────────────────────────────────────────

describe("xbrush_image_generate", () => {
  it("성공 — async 제출 + request_id 안내", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "a cat",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("/v1/image/generate (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "a cat",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/image/generate");
  });

  it("optional 파라미터 → API body 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "a cat",
      negative_prompt: "blur",
      width: 512,
      seed: 42,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.negativePrompt).toBe("blur");
    expect(callArgs.data.width).toBe(512);
    expect(callArgs.data.seed).toBe(42);
  });

  it("resolution/aspect_ratio/quality → API body 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_generate")!({
      model: "gpt-image-2",
      prompt: "a cat",
      resolution: "2K",
      aspect_ratio: "16:9",
      quality: "high",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.resolution).toBe("2K");
    expect(callArgs.data.aspectRatio).toBe("16:9");
    expect(callArgs.data.quality).toBe("high");
  });

  it("resolution 기반 모델(gpt-image-2) + width → 거부(isError), API 미제출", async () => {
    const before = mockedApi.mock.calls.length;
    const result = await handlers.get("xbrush_image_generate")!({
      model: "gpt-image-2",
      prompt: "a cat",
      width: 1024,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("resolution");
    expect(mockedApi.mock.calls.length).toBe(before); // 제출 안 됨
  });

  it("byResolution 모델(seedream-4.5) + height → 거부", async () => {
    const before = mockedApi.mock.calls.length;
    const result = await handlers.get("xbrush_image_generate")!({
      model: "seedream-4.5",
      prompt: "a cat",
      height: 768,
    });
    expect(result.isError).toBe(true);
    expect(mockedApi.mock.calls.length).toBe(before);
  });

  it("resolution 기반 모델 + resolution(width 없음) → 정상 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_generate")!({
      model: "gpt-image-2",
      prompt: "a cat",
      resolution: "1K",
      quality: "low",
    });
    expect(result.isError).toBeFalsy();
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.resolution).toBe("1K");
    expect(callArgs.data.quality).toBe("low");
    expect("width" in callArgs.data).toBe(false);
  });

  it("megapixel 모델(z-image-turbo) + width → 거부 안 함 (정상)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "a cat",
      width: 768,
    });
    expect(result.isError).toBeFalsy();
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.width).toBe(768);
  });

  it("API 에러 → isError 결과 + 메시지 포함", async () => {
    mockedApi.mockRejectedValueOnce(new Error("server down"));
    const result = await handlers.get("xbrush_image_generate")!({
      model: "x",
      prompt: "y",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("server down");
    expect(result.content[0].text).toContain("Suggestion");
  });
});

// ── xbrush_image_edit ────────────────────────────────────────────────

describe("xbrush_image_edit", () => {
  it("성공 — async 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_edit")!({
      model: "qwen-image-edit-re",
      prompt: "make blue",
      image_url: "https://assets.xbrush.ai/src.png",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("snake_case → camelCase 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
      mask_url: "https://a.com/m.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrl).toBe("https://a.com/i.png");
    expect(callArgs.data.maskUrl).toBe("https://a.com/m.png");
  });

  it("image_urls → imageUrls 매핑 (다중 레퍼런스)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "gpt-image-2-edit",
      prompt: "combine references",
      image_url: "https://a.com/primary.png",
      image_urls: ["https://a.com/ref2.png", "https://a.com/ref3.png"],
      resolution: "1K",
      aspect_ratio: "1:1",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrl).toBe("https://a.com/primary.png");
    expect(callArgs.data.imageUrls).toEqual([
      "https://a.com/ref2.png",
      "https://a.com/ref3.png",
    ]);
  });

  it("image_urls 미지정 → body에 imageUrls 없음", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect("imageUrls" in callArgs.data).toBe(false);
  });

  it("mode=outpaint → body.mode 포함", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "extend the sky",
      image_url: "https://a.com/i.png",
      mode: "outpaint",
      width: 2048,
      height: 1024,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.mode).toBe("outpaint");
    expect(callArgs.data.width).toBe(2048);
    expect(callArgs.data.height).toBe(1024);
  });

  it("mode 미지정 → body에 mode 없음", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect("mode" in callArgs.data).toBe(false);
  });

  it("/v1/image/edit (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/image/edit");
  });

  it("resolution 기반 edit 모델(gpt-image-2-edit) + width → 거부, API 미제출", async () => {
    const before = mockedApi.mock.calls.length;
    const result = await handlers.get("xbrush_image_edit")!({
      model: "gpt-image-2-edit",
      prompt: "p",
      image_url: "https://a.com/i.png",
      width: 1024,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("resolution");
    expect(mockedApi.mock.calls.length).toBe(before);
  });

  it("resolution/aspect_ratio/quality → body 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_edit")!({
      model: "gpt-image-2-edit",
      prompt: "p",
      image_url: "https://a.com/i.png",
      resolution: "2K",
      aspect_ratio: "1:1",
      quality: "medium",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.resolution).toBe("2K");
    expect(callArgs.data.aspectRatio).toBe("1:1");
    expect(callArgs.data.quality).toBe("medium");
  });

  it("API 에러 → isError 결과 + 메시지 포함", async () => {
    mockedApi.mockRejectedValueOnce(new Error("edit service unavailable"));
    const result = await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("edit service unavailable");
    expect(result.content[0].text).toContain("Suggestion");
  });
});

// ── xbrush_image_upscale ─────────────────────────────────────────────

describe("xbrush_image_upscale", () => {
  it("성공", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_upscale")!({
      image_url: "https://assets.xbrush.ai/src.png",
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain("xbrush_get_request");
  });

  it("upscale_factor → upscaleFactor 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_upscale")!({
      image_url: "https://a.com/i.png",
      upscale_factor: 4,
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.upscaleFactor).toBe(4);
  });

  it("/v1/image/upscale (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_upscale")!({
      image_url: "https://a.com/i.png",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.url).toBe("/v1/image/upscale");
  });
});

// ── xbrush_image_remove_bg ───────────────────────────────────────────

describe("xbrush_image_remove_bg", () => {
  it("성공 — async 제출", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_remove_bg")!({
      image_url: "https://assets.xbrush.ai/src.png",
    });
    expect(result.content[0].text).toContain("Background removal");
    expect(result.content[0].text).toContain("submitted (async)");
  });

  it("image_url → imageUrl 매핑 + /v1/image/remove-background", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_image_remove_bg")!({
      image_url: "https://a.com/photo.jpg",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrl).toBe("https://a.com/photo.jpg");
    expect(callArgs.url).toBe("/v1/image/remove-background");
  });
});
