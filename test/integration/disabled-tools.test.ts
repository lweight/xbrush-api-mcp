import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

vi.mock("../../src/services/file-upload.js", () => ({
  uploadFile: vi.fn(),
}));

import { registerImageTools } from "../../src/tools/image.js";
import { registerRequestTools } from "../../src/tools/requests.js";
import { registerModelTools } from "../../src/tools/models.js";
import { registerFileUploadTools } from "../../src/tools/file-upload.js";
import { registerVideoTools } from "../../src/tools/video.js";
import { registerAudioTools } from "../../src/tools/audio.js";
import { registerLipSyncTools } from "../../src/tools/lip-sync.js";
import { registerWatermarkTools } from "../../src/tools/watermark.js";
import { registerModerationTools } from "../../src/tools/moderation.js";
import { registerVoiceTools } from "../../src/tools/voice.js";
import { applyDisableFilter, parseDisabledTools } from "../../src/tool-filter.js";

type ToolDef = { name: string };

async function spinServer(disabledRaw: string | undefined): Promise<{
  tools: ToolDef[];
  close: () => Promise<void>;
}> {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const mcpServer = new McpServer(
    { name: "t", version: "0.0.0" },
    { capabilities: { tools: {} } }
  );
  const disabled = parseDisabledTools(disabledRaw);
  const report = applyDisableFilter(mcpServer, disabled);

  registerImageTools(mcpServer);
  registerVideoTools(mcpServer);
  registerAudioTools(mcpServer);
  registerLipSyncTools(mcpServer);
  registerWatermarkTools(mcpServer);
  registerModerationTools(mcpServer);
  registerRequestTools(mcpServer);
  registerModelTools(mcpServer);
  registerVoiceTools(mcpServer);
  registerFileUploadTools(mcpServer);
  report();

  const client = new Client({ name: "c", version: "0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), mcpServer.connect(st)]);
  const result = await client.listTools();
  errSpy.mockRestore();
  return {
    tools: result.tools as ToolDef[],
    close: () => client.close(),
  };
}

describe("XBRUSH_DISABLED_TOOLS 통합", () => {
  let servers: Array<{ close: () => Promise<void> }> = [];

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    servers = [];
  });

  it("환경변수 없으면 20개 모두 노출", async () => {
    const s = await spinServer(undefined);
    servers.push(s);
    expect(s.tools.map((t) => t.name).length).toBe(20);
  });

  it("단일 도구 비활성 → tools/list에서 제외", async () => {
    const s = await spinServer("xbrush_tts_generate");
    servers.push(s);
    const names = s.tools.map((t) => t.name);
    expect(names.length).toBe(19);
    expect(names).not.toContain("xbrush_tts_generate");
    expect(names).toContain("xbrush_music_generate"); // 다른 도구는 살아있음
  });

  it("복수 도구 비활성 → 모두 제외", async () => {
    const s = await spinServer("xbrush_tts_generate,xbrush_music_generate,xbrush_watermark_add");
    servers.push(s);
    const names = s.tools.map((t) => t.name);
    expect(names.length).toBe(17);
    expect(names).not.toContain("xbrush_tts_generate");
    expect(names).not.toContain("xbrush_music_generate");
    expect(names).not.toContain("xbrush_watermark_add");
    expect(names).toContain("xbrush_image_generate"); // 무관한 도구는 생존
  });

  it("잘못된 이름 포함 + 정상 이름 조합 — 정상 이름은 비활성, 오타는 경고만", async () => {
    const s = await spinServer("xbrush_tts_generate,xbrush_typo_name");
    servers.push(s);
    const names = s.tools.map((t) => t.name);
    expect(names).not.toContain("xbrush_tts_generate");
    expect(names.length).toBe(19);
  });

  it("모든 도구 비활성", async () => {
    const all = [
      "xbrush_check_health",
      "xbrush_content_moderate",
      "xbrush_file_upload",
      "xbrush_get_request",
      "xbrush_image_edit",
      "xbrush_image_generate",
      "xbrush_image_remove_bg",
      "xbrush_image_upscale",
      "xbrush_list_models",
      "xbrush_list_requests",
      "xbrush_list_voices",
      "xbrush_music_generate",
      "xbrush_sound_effect_generate",
      "xbrush_tts_generate",
      "xbrush_video_extend",
      "xbrush_video_generate",
      "xbrush_video_lip_sync",
      "xbrush_video_retake",
      "xbrush_video_upscale",
      "xbrush_watermark_add",
    ].join(",");
    const s = await spinServer(all);
    servers.push(s);
    expect(s.tools.length).toBe(0);
  });
});
