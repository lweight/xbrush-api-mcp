import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushModelsResponse, XBrushModel } from "../../src/types.js";

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
import { registerModelTools } from "../../src/tools/models.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerModelTools(mock.server);
  handlers = mock.handlers;
});

function makeModel(overrides: Partial<XBrushModel> = {}): XBrushModel {
  return {
    id: "z-image-turbo",
    modelType: "generation",
    name: "Z Image Turbo",
    category: "image",
    featureType: "text-to-image",
    calType: "image",
    creditInfo: { creditValue: 10 },
    ...overrides,
  };
}

describe("xbrush_list_models", () => {
  it("전체 모델 (카테고리 그룹핑)", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({ id: "m1", category: "image" }),
        makeModel({ id: "m2", category: "image" }),
        makeModel({ id: "m3", category: "audio", name: "TTS Model" }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    const text = result.content[0].text;
    expect(text).toContain("Models (3 total)");
    expect(text).toContain("Image (2)");
    expect(text).toContain("Audio (1)");
  });

  it("category 필터 적용", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({ id: "m1", category: "image" }),
        makeModel({ id: "m2", category: "audio" }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({ category: "audio" });
    const text = result.content[0].text;
    expect(text).toContain("m2");
    expect(text).not.toContain("m1");
  });

  it("creditValue 포맷", async () => {
    const resp: XBrushModelsResponse = {
      models: [makeModel({ creditInfo: { creditValue: 10 }, calType: "image" })],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    expect(result.content[0].text).toContain("10 credits/image");
  });

  it("creditConfig 포맷", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({
          creditInfo: { creditConfig: { "720p": 20, "1080p": 40 } },
        }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    const text = result.content[0].text;
    expect(text).toContain("720p=20");
    expect(text).toContain("1080p=40");
  });

  it("중첩 creditConfig 포맷 — [object Object] 없이 펼침", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({
          creditInfo: {
            creditConfig: { "720p": { audio: 0.52, noAudio: 0.26 } },
          },
        }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    const text = result.content[0].text;
    expect(text).toContain("720p=audio 0.52/noAudio 0.26");
    expect(text).not.toContain("[object Object]");
  });

  it("video duration constraints 포맷", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({
          id: "seedance-2.0",
          category: "video",
          featureType: "i2v",
          constraints: { min: 4, max: 15, step: 1, default: 5 },
        }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    expect(result.content[0].text).toContain("duration 4-15s (default 5)");
  });

  it("text 모델 vision constraints 포맷 (vision true/false)", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({
          id: "bytedance/seed-2.0-mini",
          category: "text",
          featureType: "chat",
          calType: "perToken",
          creditInfo: { creditConfig: { inputPer1M: 0.13, outputPer1M: 0.52 } },
          constraints: { vision: true, maxImages: 10, baseTokens: 100, tokensPerImage: 1298 },
        }),
        makeModel({
          id: "z-ai/glm-5.2",
          category: "text",
          featureType: "chat",
          calType: "perToken",
          creditInfo: { creditConfig: { inputPer1M: 1.82, outputPer1M: 5.72 } },
          constraints: { vision: false, baseTokens: 100 },
        }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    const text = result.content[0].text;
    expect(text).toContain("vision (max 10 images, ~1298 tokens/image)");
    expect(text).toContain("text-only");
  });

  it("text 모델 function calling constraints 포맷 (2026-07-16)", async () => {
    const resp: XBrushModelsResponse = {
      models: [
        makeModel({
          id: "bytedance/seed-2.0-mini",
          category: "text",
          featureType: "chat",
          calType: "perToken",
          creditInfo: { creditConfig: { inputPer1M: 0.13, outputPer1M: 0.52 } },
          constraints: {
            vision: true,
            maxImages: 10,
            baseTokens: 100,
            tokensPerImage: 1298,
            functionCalling: true,
            toolsFixedTokens: 350,
            forcedChoiceHonored: true,
          },
        }),
        makeModel({
          id: "z-ai/glm-5.2",
          category: "text",
          featureType: "chat",
          calType: "perToken",
          creditInfo: { creditConfig: { inputPer1M: 1.82, outputPer1M: 5.72 } },
          constraints: {
            vision: false,
            baseTokens: 100,
            functionCalling: true,
            toolsFixedTokens: 150,
            forcedChoiceHonored: false,
          },
        }),
        makeModel({
          id: "legacy/no-fc",
          category: "text",
          featureType: "chat",
          calType: "perToken",
          creditInfo: { creditConfig: { inputPer1M: 1 } },
          constraints: { vision: false, functionCalling: false },
        }),
      ],
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_models")!({});
    const text = result.content[0].text;
    expect(text).toContain(
      "function calling (~350 fixed tokens/request, forced choice honored)"
    );
    expect(text).toContain(
      "function calling (~150 fixed tokens/request, forced choice NOT honored)"
    );
    expect(text).toContain("no function calling");
  });
});
