import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import {
  buildToolResult,
  handleApiError,
  handleToolError,
  XBrushApiError,
} from "../../src/services/xbrush-client.js";
import { CHARACTER_LIMIT } from "../../src/constants.js";

// ── XBrushApiError ───────────────────────────────────────────────────

describe("XBrushApiError", () => {
  it("속성 올바르게 설정됨", () => {
    const err = new XBrushApiError(401, "INVALID_API_KEY", "Bad key", "Check key");
    expect(err.status).toBe(401);
    expect(err.code).toBe("INVALID_API_KEY");
    expect(err.message).toBe("Bad key");
    expect(err.suggestion).toBe("Check key");
  });

  it("name이 XBrushApiError", () => {
    const err = new XBrushApiError(0, "X", "msg", "sug");
    expect(err.name).toBe("XBrushApiError");
  });
});

// ── buildToolResult ──────────────────────────────────────────────────

describe("buildToolResult", () => {
  it("일반 텍스트 반환", () => {
    const result = buildToolResult("hello");
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.isError).toBe(false);
  });

  it("isError=true 전달", () => {
    const result = buildToolResult("err", true);
    expect(result.isError).toBe(true);
  });

  it("CHARACTER_LIMIT 이하 미절삭", () => {
    const text = "x".repeat(CHARACTER_LIMIT);
    const result = buildToolResult(text);
    expect(result.content[0]).toHaveProperty("text", text);
  });

  it("CHARACTER_LIMIT 초과 절삭", () => {
    const text = "x".repeat(CHARACTER_LIMIT + 5000);
    const result = buildToolResult(text);
    const output = (result.content[0] as { text: string }).text;
    expect(output).toContain("truncated");
    expect(output).toContain(String(text.length));
  });
});

// ── handleApiError ───────────────────────────────────────────────────

function makeAxiosError(status: number, data: unknown): AxiosError {
  return new AxiosError(
    "Request failed",
    AxiosError.ERR_BAD_REQUEST,
    {} as any,
    {},
    { status, data, statusText: "Error", headers: {}, config: {} as any } as any
  );
}

describe("handleApiError", () => {
  it("구조화된 에러 응답 — INVALID_API_KEY", () => {
    const axErr = makeAxiosError(401, {
      error: { code: "INVALID_API_KEY", message: "Bad key" },
    });
    const result = handleApiError(axErr);
    expect(result).toBeInstanceOf(XBrushApiError);
    expect(result.status).toBe(401);
    expect(result.code).toBe("INVALID_API_KEY");
    expect(result.suggestion).toContain("xbrush.ai");
  });

  it("구조화된 에러 응답 — INSUFFICIENT_CREDIT", () => {
    const axErr = makeAxiosError(402, {
      error: { code: "INSUFFICIENT_CREDIT", message: "No credits" },
    });
    const result = handleApiError(axErr);
    expect(result.suggestion).toContain("Billing");
  });

  it("구조화된 에러 응답 — INVALID_MODEL", () => {
    const axErr = makeAxiosError(400, {
      error: { code: "INVALID_MODEL", message: "Unknown model" },
    });
    const result = handleApiError(axErr);
    expect(result.suggestion).toContain("xbrush_list_models");
  });

  it("비구조화 응답 (500)", () => {
    const axErr = makeAxiosError(500, "Internal error");
    const result = handleApiError(axErr);
    expect(result.status).toBe(500);
    expect(result.code).toBe("HTTP_500");
    expect(result.suggestion).toContain("server error");
  });

  it("구조화된 에러 응답 — VALIDATION_ERROR", () => {
    const axErr = makeAxiosError(400, {
      error: { code: "VALIDATION_ERROR", message: "Invalid params" },
    });
    const result = handleApiError(axErr);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.suggestion).toContain("parameters");
  });

  it("구조화된 에러 응답 — GENERATION_FAILED", () => {
    const axErr = makeAxiosError(500, {
      error: { code: "GENERATION_FAILED", message: "GPU OOM" },
    });
    const result = handleApiError(axErr);
    expect(result.code).toBe("GENERATION_FAILED");
    expect(result.suggestion).toContain("Try again");
  });

  it("구조화된 에러 응답 — POLLER_ERROR", () => {
    const axErr = makeAxiosError(500, {
      error: { code: "POLLER_ERROR", message: "Poll timeout" },
    });
    const result = handleApiError(axErr);
    expect(result.code).toBe("POLLER_ERROR");
    expect(result.suggestion).toContain("xbrush_get_request");
  });

  it("429 Rate limit", () => {
    const axErr = makeAxiosError(429, {});
    const result = handleApiError(axErr);
    expect(result.suggestion).toContain("Rate limit");
  });

  it("타임아웃 에러", () => {
    const err = new AxiosError("timeout", "ECONNABORTED", {} as any);
    const result = handleApiError(err);
    expect(result.code).toBe("TIMEOUT");
  });

  it("일반 Error", () => {
    const result = handleApiError(new Error("network fail"));
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("network fail");
  });

  it("문자열 에러", () => {
    const result = handleApiError("something broke");
    expect(result.code).toBe("UNKNOWN");
  });
});

// ── handleToolError ──────────────────────────────────────────────────

describe("handleToolError", () => {
  it("XBrushApiError 그대로 변환", () => {
    const apiErr = new XBrushApiError(401, "INVALID_API_KEY", "msg", "suggestion text");
    const result = handleToolError(apiErr);
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("msg");
    expect(text).toContain("suggestion text");
  });

  it("일반 Error 자동 변환", () => {
    const result = handleToolError(new Error("unexpected"));
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("unexpected");
  });

  it("문자열 에러", () => {
    const result = handleToolError("oops");
    expect(result.isError).toBe(true);
  });
});
