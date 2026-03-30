import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock makeApiRequest for all tool handlers
vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return {
    ...actual,
    makeApiRequest: vi.fn(),
  };
});

vi.mock("../../src/services/file-upload.js", () => ({
  uploadFile: vi.fn(),
}));

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerImageTools } from "../../src/tools/image.js";
import { registerRequestTools } from "../../src/tools/requests.js";
import { registerModelTools } from "../../src/tools/models.js";
import { registerFileUploadTools } from "../../src/tools/file-upload.js";
import type { XBrushSyncResponse } from "../../src/types.js";

const mockedApi = vi.mocked(makeApiRequest);

let client: Client;
let mcpServer: McpServer;

type ToolDef = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

let tools: ToolDef[];

beforeAll(async () => {
  mcpServer = new McpServer(
    { name: "xbrush-test", version: "0.0.0" },
    { capabilities: { tools: {} } }
  );

  registerImageTools(mcpServer);
  registerRequestTools(mcpServer);
  registerModelTools(mcpServer);
  registerFileUploadTools(mcpServer);

  client = new Client({ name: "test-client", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    mcpServer.connect(serverTransport),
  ]);

  const result = await client.listTools();
  tools = result.tools as ToolDef[];
});

afterAll(async () => {
  await client.close();
});

// ── 도구 등록 검증 ───────────────────────────────────────────────────

describe("도구 등록", () => {
  it("도구 9개 등록", () => {
    expect(tools).toHaveLength(9);
  });

  it("도구 이름 목록 일치", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "xbrush_check_health",
      "xbrush_file_upload",
      "xbrush_get_request",
      "xbrush_image_edit",
      "xbrush_image_generate",
      "xbrush_image_remove_bg",
      "xbrush_image_upscale",
      "xbrush_list_models",
      "xbrush_list_requests",
    ]);
  });

  it("모든 도구에 annotations 존재", () => {
    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations).toHaveProperty("readOnlyHint");
      expect(tool.annotations).toHaveProperty("destructiveHint");
    }
  });
});

// ── 도구 스키마 스냅샷 ───────────────────────────────────────────────

describe("도구 스키마 스냅샷", () => {
  it("xbrush_image_generate", () => {
    const tool = tools.find((t) => t.name === "xbrush_image_generate")!;
    expect(tool.inputSchema).toMatchSnapshot();
  });

  it("xbrush_image_edit", () => {
    const tool = tools.find((t) => t.name === "xbrush_image_edit")!;
    expect(tool.inputSchema).toMatchSnapshot();
  });

  it("xbrush_list_models", () => {
    const tool = tools.find((t) => t.name === "xbrush_list_models")!;
    expect(tool.inputSchema).toMatchSnapshot();
  });

  it("xbrush_get_request", () => {
    const tool = tools.find((t) => t.name === "xbrush_get_request")!;
    expect(tool.inputSchema).toMatchSnapshot();
  });
});

// ── MCP 프로토콜 동작 ────────────────────────────────────────────────

describe("MCP 프로토콜 동작", () => {
  it("유효 입력 → 정상 응답", async () => {
    const mockResponse: XBrushSyncResponse = {
      requestId: "req" + "z".repeat(21),
      status: "completed",
      domain: "image",
      action: "generate",
      creditCharged: 5,
      output: { imageUrls: ["https://assets.xbrush.ai/result.png"] },
      completedAt: "2025-01-01T00:00:00Z",
      syncCompleted: true,
    };
    mockedApi.mockResolvedValueOnce(mockResponse);

    const result = await client.callTool({
      name: "xbrush_image_generate",
      arguments: { model: "z-image-turbo", prompt: "a cat" },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("completed");
  });

  it("Zod 검증 실패 → 에러 응답 (prompt 누락)", async () => {
    const result = await client.callTool({
      name: "xbrush_image_generate",
      arguments: { model: "x" },
    });
    expect(result.isError).toBe(true);
  });

  it("미정의 필드 → strict mode 에러", async () => {
    const result = await client.callTool({
      name: "xbrush_image_generate",
      arguments: { model: "x", prompt: "y", extra_field: 1 },
    });
    expect(result.isError).toBe(true);
  });

  it("존재하지 않는 도구 → isError 응답", async () => {
    const result = await client.callTool({
      name: "nonexistent_tool",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("not found");
  });
});

// ── 도구 annotation 검증 ─────────────────────────────────────────────

describe("도구 annotation 검증", () => {
  it("xbrush_check_health — readOnlyHint: true", () => {
    const tool = tools.find((t) => t.name === "xbrush_check_health")!;
    expect(tool.annotations!.readOnlyHint).toBe(true);
  });

  it("xbrush_list_models — readOnlyHint: true", () => {
    const tool = tools.find((t) => t.name === "xbrush_list_models")!;
    expect(tool.annotations!.readOnlyHint).toBe(true);
  });

  it("xbrush_image_generate — readOnlyHint: false", () => {
    const tool = tools.find((t) => t.name === "xbrush_image_generate")!;
    expect(tool.annotations!.readOnlyHint).toBe(false);
  });

  it("xbrush_get_request — idempotentHint: true", () => {
    const tool = tools.find((t) => t.name === "xbrush_get_request")!;
    expect(tool.annotations!.idempotentHint).toBe(true);
  });
});
