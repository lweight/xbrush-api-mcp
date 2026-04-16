import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  applyDisableFilter,
  parseDisabledTools,
} from "../src/tool-filter.js";

describe("parseDisabledTools", () => {
  it("undefined → empty set", () => {
    expect(parseDisabledTools(undefined).size).toBe(0);
  });

  it("empty string → empty set", () => {
    expect(parseDisabledTools("").size).toBe(0);
  });

  it("단일 이름", () => {
    const s = parseDisabledTools("xbrush_tts_generate");
    expect(s.has("xbrush_tts_generate")).toBe(true);
    expect(s.size).toBe(1);
  });

  it("쉼표 구분 복수 이름 + 공백 제거", () => {
    const s = parseDisabledTools("xbrush_tts_generate, xbrush_music_generate , xbrush_watermark_add");
    expect(s.size).toBe(3);
    expect(s.has("xbrush_tts_generate")).toBe(true);
    expect(s.has("xbrush_music_generate")).toBe(true);
    expect(s.has("xbrush_watermark_add")).toBe(true);
  });

  it("빈 토큰 무시", () => {
    const s = parseDisabledTools("a,,b,");
    expect(s.size).toBe(2);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
  });
});

describe("applyDisableFilter", () => {
  let server: McpServer;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } }
    );
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  const registerTool = (name: string) =>
    server.registerTool(
      name,
      {
        title: name,
        description: "t",
        inputSchema: { x: z.string() },
      },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] })
    );

  it("disabled 빈 셋 → 모든 도구 등록", () => {
    const report = applyDisableFilter(server, new Set());
    registerTool("tool_a");
    registerTool("tool_b");
    report();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("지정한 도구만 등록 차단", () => {
    applyDisableFilter(server, new Set(["tool_a"]));
    registerTool("tool_a");
    registerTool("tool_b");
    const logs = errSpy.mock.calls.map((c) => c[0]);
    expect(logs.some((l) => String(l).includes("tool_a"))).toBe(true);
    expect(logs.some((l) => String(l).includes("tool_b"))).toBe(false);
  });

  it("복수 이름 차단", () => {
    applyDisableFilter(server, new Set(["tool_a", "tool_c"]));
    registerTool("tool_a");
    registerTool("tool_b");
    registerTool("tool_c");
    const disabledLogs = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes("Tool disabled")
    );
    expect(disabledLogs).toHaveLength(2);
  });

  it("매치되지 않은 이름은 reportUnmatched로 경고", () => {
    const report = applyDisableFilter(server, new Set(["nonexistent_tool"]));
    registerTool("tool_a");
    report();
    const logs = errSpy.mock.calls.map((c) => String(c[0]));
    expect(logs.some((l) => l.includes("did not match"))).toBe(true);
  });

  it("매치된 이름은 unmatched 경고 없음", () => {
    const report = applyDisableFilter(server, new Set(["tool_a"]));
    registerTool("tool_a");
    report();
    const unmatched = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes("did not match")
    );
    expect(unmatched).toHaveLength(0);
  });
});
