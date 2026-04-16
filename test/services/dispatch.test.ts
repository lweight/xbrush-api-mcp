import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { submitAsync } from "../../src/services/dispatch.js";
import type { XBrushAsyncResponse } from "../../src/types.js";

const mockedApi = vi.mocked(makeApiRequest);

const asyncResp: XBrushAsyncResponse = {
  requestId: "req" + "b".repeat(21),
  status: "pending",
  domain: "image",
  action: "generate",
  creditCharged: 1,
  estimatedTimeout: 30,
};

beforeEach(() => {
  mockedApi.mockReset();
});

describe("submitAsync", () => {
  it("POST asyncUrl + TIMEOUT_ASYNC_POST(30s) + 기본 async 포맷터", async () => {
    mockedApi.mockResolvedValueOnce(asyncResp);
    const result = await submitAsync({
      url: "/v1/image/generate",
      body: { model: "m", prompt: "p" },
      label: "Image generation",
    });
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as any).text).toContain("submitted (async)");
    const call = mockedApi.mock.calls[0]![0] as any;
    expect(call.url).toBe("/v1/image/generate");
    expect(call.timeout).toBe(30_000);
    expect(call.method).toBe("POST");
    expect(call.data).toEqual({ model: "m", prompt: "p" });
  });

  it("커스텀 async formatter 전달", async () => {
    mockedApi.mockResolvedValueOnce(asyncResp);
    const custom = vi.fn((_r: any, label: string) => `A[${label}]`);
    const result = await submitAsync({
      url: "/v",
      body: {},
      label: "Lbl2",
      formatAsync: custom,
    });
    expect(custom).toHaveBeenCalledWith(asyncResp, "Lbl2");
    expect((result.content[0] as any).text).toBe("A[Lbl2]");
  });

  it("makeApiRequest 실패 → isError + Suggestion", async () => {
    mockedApi.mockRejectedValueOnce(new Error("boom"));
    const result = await submitAsync({
      url: "/u",
      body: {},
      label: "X",
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("boom");
    expect((result.content[0] as any).text).toContain("Suggestion");
  });

  it("formatter 예외도 안전하게 isError로 포장", async () => {
    mockedApi.mockResolvedValueOnce(asyncResp);
    const result = await submitAsync({
      url: "/u",
      body: {},
      label: "X",
      formatAsync: () => {
        throw new Error("formatter bug");
      },
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("formatter bug");
  });
});
