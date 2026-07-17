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
import { registerLoraTools } from "../../src/tools/lora.js";
import { TIMEOUT_ASYNC_POST } from "../../src/constants.js";

const mockedApi = vi.mocked(makeApiRequest);

const mockAsync: XBrushAsyncResponse = {
  requestId: "req" + "l".repeat(21),
  status: "pending",
  domain: "lora",
  action: "train",
  creditCharged: 2,
  estimatedTimeout: 2400,
};

let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerLoraTools(mock.server);
  handlers = mock.handlers;
});

describe("xbrush_lora_train", () => {
  it("성공 — async 제출 + request_id 반환", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    const result = await handlers.get("xbrush_lora_train")!({
      name: "my-style",
      image_urls: ["https://assets.xbrush.ai/a.png"],
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(mockAsync.requestId);
  });

  it("/v1/lora/train POST + TIMEOUT_ASYNC_POST (async 단일 경로)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_lora_train")!({
      name: "n",
      image_urls: ["https://a.com/1.png"],
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/lora/train");
    expect(args.method).toBe("POST");
    expect(args.timeout).toBe(TIMEOUT_ASYNC_POST);
  });

  it("snake_case → camelCase 매핑 (image_urls/trigger_word)", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_lora_train")!({
      name: "n",
      image_urls: ["https://a.com/1.png", "https://a.com/2.png"],
      model: "flux.1-dev",
      trigger_word: "TOKKI",
      steps: 1500,
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data).toEqual({
      name: "n",
      imageUrls: ["https://a.com/1.png", "https://a.com/2.png"],
      model: "flux.1-dev",
      triggerWord: "TOKKI",
      steps: 1500,
    });
  });

  it("미지정 옵션 필드는 body에서 생략", async () => {
    mockedApi.mockResolvedValueOnce(mockAsync);
    await handlers.get("xbrush_lora_train")!({
      name: "n",
      image_urls: ["https://a.com/1.png"],
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(Object.keys(args.data)).toEqual(["name", "imageUrls"]);
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("training backend down"));
    const result = await handlers.get("xbrush_lora_train")!({
      name: "n",
      image_urls: ["https://a.com/1.png"],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("training backend down");
  });
});
