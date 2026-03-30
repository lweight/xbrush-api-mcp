import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type {
  XBrushRequestDetail,
  XBrushRequestListResponse,
  XBrushHealthResponse,
} from "../../src/types.js";

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
import { registerRequestTools } from "../../src/tools/requests.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerRequestTools(mock.server);
  handlers = mock.handlers;
});

// ── xbrush_get_request ───────────────────────────────────────────────

describe("xbrush_get_request", () => {
  const baseDetail: XBrushRequestDetail = {
    requestId: "req" + "a".repeat(21),
    status: "completed",
    domain: "image",
    action: "generate",
    creditCharged: 5,
    createdAt: "2025-01-01T00:00:00Z",
    completedAt: "2025-01-01T00:01:00Z",
    duration: 60,
    output: { imageUrls: ["https://assets.xbrush.ai/out.png"] },
  };

  it("completed 상태 + output", async () => {
    mockedApi.mockResolvedValueOnce(baseDetail);
    const result = await handlers.get("xbrush_get_request")!({
      request_id: baseDetail.requestId,
    });
    const text = result.content[0].text;
    expect(text).toContain("completed");
    expect(text).toContain("https://assets.xbrush.ai/out.png");
  });

  it("pending 상태", async () => {
    mockedApi.mockResolvedValueOnce({
      ...baseDetail,
      status: "pending",
      output: undefined,
      completedAt: undefined,
      duration: undefined,
    });
    const result = await handlers.get("xbrush_get_request")!({
      request_id: baseDetail.requestId,
    });
    const text = result.content[0].text;
    expect(text).toContain("pending");
    expect(text).not.toContain("Output");
  });

  it("failed 상태 + error", async () => {
    mockedApi.mockResolvedValueOnce({
      ...baseDetail,
      status: "failed",
      output: undefined,
      error: { code: "GENERATION_FAILED", message: "GPU error" },
    });
    const result = await handlers.get("xbrush_get_request")!({
      request_id: baseDetail.requestId,
    });
    const text = result.content[0].text;
    expect(text).toContain("GENERATION_FAILED");
    expect(text).toContain("GPU error");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("not found"));
    const result = await handlers.get("xbrush_get_request")!({
      request_id: "req" + "x".repeat(21),
    });
    expect(result.isError).toBe(true);
  });
});

// ── xbrush_list_requests ─────────────────────────────────────────────

describe("xbrush_list_requests", () => {
  const makeItem = (id: string): XBrushRequestDetail => ({
    requestId: id,
    status: "completed",
    domain: "image",
    action: "generate",
    creditCharged: 5,
  });

  it("목록 반환 (hasMore=false)", async () => {
    const resp: XBrushRequestListResponse = {
      data: [makeItem("req_aaa"), makeItem("req_bbb"), makeItem("req_ccc")],
      nextCursor: null,
      hasMore: false,
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_requests")!({});
    const text = result.content[0].text;
    expect(text).toContain("Requests (3)");
    expect(text).toContain("req_aaa");
  });

  it("페이지네이션 있음", async () => {
    const resp: XBrushRequestListResponse = {
      data: [makeItem("req_111")],
      nextCursor: "cursor_abc",
      hasMore: true,
    };
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_requests")!({});
    const text = result.content[0].text;
    expect(text).toContain("Next cursor");
    expect(text).toContain("cursor_abc");
  });

  it("빈 목록", async () => {
    mockedApi.mockResolvedValueOnce({
      data: [],
      nextCursor: null,
      hasMore: false,
    });
    const result = await handlers.get("xbrush_list_requests")!({});
    expect(result.content[0].text).toContain("Requests (0)");
  });
});

// ── xbrush_check_health ──────────────────────────────────────────────

describe("xbrush_check_health", () => {
  it("정상 + timestamp", async () => {
    const health: XBrushHealthResponse = {
      status: "ok",
      timestamp: "2025-01-01T00:00:00Z",
    };
    mockedApi.mockResolvedValueOnce(health);
    const result = await handlers.get("xbrush_check_health")!({});
    const text = result.content[0].text;
    expect(text).toContain("ok");
    expect(text).toContain("2025-01-01");
  });

  it("timestamp 없음", async () => {
    mockedApi.mockResolvedValueOnce({ status: "ok" });
    const result = await handlers.get("xbrush_check_health")!({});
    const text = result.content[0].text;
    expect(text).toContain("ok");
    expect(text).not.toContain("undefined");
  });
});
