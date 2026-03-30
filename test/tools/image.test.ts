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
import { registerImageTools } from "../../src/tools/image.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockSync: XBrushSyncResponse = {
  requestId: "req" + "a".repeat(21),
  status: "completed",
  domain: "image",
  action: "generate",
  creditCharged: 5,
  output: { imageUrls: ["https://assets.xbrush.ai/img1.png"] },
  completedAt: "2025-01-01T00:00:00Z",
  syncCompleted: true,
};

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "b".repeat(21),
  status: "pending",
  domain: "image",
  action: "edit",
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
  it("성공 — 이미지 URL 포함", async () => {
    mockedApi.mockResolvedValueOnce(mockSync);
    const result = await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "a cat",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("completed");
    expect(result.content[0].text).toContain("https://assets.xbrush.ai/img1.png");
  });

  it("성공 — 이미지 3개", async () => {
    const multiSync = {
      ...mockSync,
      output: {
        imageUrls: [
          "https://assets.xbrush.ai/1.png",
          "https://assets.xbrush.ai/2.png",
          "https://assets.xbrush.ai/3.png",
        ],
      },
    };
    mockedApi.mockResolvedValueOnce(multiSync);
    const result = await handlers.get("xbrush_image_generate")!({
      model: "z-image-turbo",
      prompt: "cats",
      n: 3,
    });
    expect(result.content[0].text).toContain("3.png");
  });

  it("optional 파라미터 → API body 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockSync);
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

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("server down"));
    const result = await handlers.get("xbrush_image_generate")!({
      model: "x",
      prompt: "y",
    });
    expect(result.isError).toBe(true);
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
    expect(result.content[0].text).toContain("async");
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

  it("API 에러 → isError 결과", async () => {
    mockedApi.mockRejectedValueOnce(new Error("fail"));
    const result = await handlers.get("xbrush_image_edit")!({
      model: "m",
      prompt: "p",
      image_url: "https://a.com/i.png",
    });
    expect(result.isError).toBe(true);
  });
});

// ── xbrush_image_upscale ─────────────────────────────────────────────

describe("xbrush_image_upscale", () => {
  it("성공", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_image_upscale")!({
      image_url: "https://assets.xbrush.ai/src.png",
    });
    expect(result.content[0].text).toContain("async");
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
});

// ── xbrush_image_remove_bg ───────────────────────────────────────────

describe("xbrush_image_remove_bg", () => {
  it("성공", async () => {
    mockedApi.mockResolvedValueOnce(mockSync);
    const result = await handlers.get("xbrush_image_remove_bg")!({
      image_url: "https://assets.xbrush.ai/src.png",
    });
    expect(result.content[0].text).toContain("Background removal");
    expect(result.content[0].text).toContain("completed");
  });

  it("image_url → imageUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(mockSync);
    await handlers.get("xbrush_image_remove_bg")!({
      image_url: "https://a.com/photo.jpg",
    });
    const callArgs = mockedApi.mock.calls.at(-1)![0] as any;
    expect(callArgs.data.imageUrl).toBe("https://a.com/photo.jpg");
  });
});
