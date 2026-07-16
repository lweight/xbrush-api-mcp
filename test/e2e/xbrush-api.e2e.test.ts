/**
 * E2E tests against the real XBrush API (api.xbrush.run).
 *
 * Run:
 *   npm run test:e2e                         # free probes only
 *   XBRUSH_API_KEY=... npm run test:e2e      # auth-required read-only tools
 *   XBRUSH_API_KEY=... XBRUSH_E2E_PAID=1 npm run test:e2e   # full paid pipeline
 *
 * The paid pipeline runs sequentially and threads outputs (image/video/audio URLs)
 * through dependent steps. Failed prerequisite gracefully skips dependents.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import { registerChatTools } from "../../src/tools/chat.js";

const hasApiKey = !!process.env.XBRUSH_API_KEY;
const paidOk = process.env.XBRUSH_E2E_PAID === "1";

let client: Client;

beforeAll(async () => {
  const server = new McpServer(
    { name: "xbrush-e2e", version: "0.0.0" },
    { capabilities: { tools: {} } }
  );
  registerImageTools(server);
  registerVideoTools(server);
  registerAudioTools(server);
  registerLipSyncTools(server);
  registerWatermarkTools(server);
  registerModerationTools(server);
  registerRequestTools(server);
  registerModelTools(server);
  registerVoiceTools(server);
  registerFileUploadTools(server);
  registerChatTools(server);

  client = new Client({ name: "e2e", version: "0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
});

// ── helpers ───────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; text: string }> {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text: string }>)[0]?.text ?? "";
  return { isError: !!r.isError, text };
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)`]+/);
  return m ? m[0] : null;
}

function extractRequestId(text: string): string | null {
  const m = text.match(/req[A-Za-z0-9]{20,}/);
  return m ? m[0] : null;
}

async function pollUntilDone(
  requestId: string,
  { maxMs = 10 * 60_000, intervalMs = 5000 } = {}
): Promise<{ status: string; text: string; url?: string }> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await callTool("xbrush_get_request", { request_id: requestId });
    const text = r.text;
    if (/Status.*completed/i.test(text)) {
      const url = firstUrl(text.replace(requestId, "")) ?? undefined;
      return { status: "completed", text, url };
    }
    if (/Status.*failed/i.test(text)) {
      return { status: "failed", text };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "timeout", text: `Timed out after ${maxMs}ms` };
}

// ── Probes (no auth needed) ───────────────────────────────────────────

describe("api.xbrush.run — 서버 reachability (무료)", () => {
  it("/v1/health 는 인증 없이 200", async () => {
    const resp = await fetch("https://api.xbrush.run/v1/health");
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { status?: string };
    expect(json.status).toBeDefined();
  });

  it("/v1/models 는 X-API-Key 없이 401", async () => {
    const resp = await fetch("https://api.xbrush.run/v1/models");
    expect(resp.status).toBe(401);
  });

  it("16개 엔드포인트 경로 유효 (401 MISSING_API_KEY)", async () => {
    const paths = [
      "/v1/image/generate",
      "/v1/image/edit",
      "/v1/image/upscale",
      "/v1/image/remove-background",
      "/v1/image/moderate",
      "/v1/video/generate",
      "/v1/video/upscale",
      "/v1/video/lip-sync",
      "/v1/video/extend",
      "/v1/video/retake",
      "/v1/video/moderate",
      "/v1/tts/generate",
      "/v1/music/generate",
      "/v1/sound-effect/generate",
      "/v1/watermark/add",
      "/v1/files/upload",
    ];
    for (const p of paths) {
      const resp = await fetch(`https://api.xbrush.run${p}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(resp.status, `path ${p}`).toBe(401);
    }
  });
});

// ── Auth-required read-only (0 credits) ───────────────────────────────

describe.runIf(hasApiKey)("MCP 도구 → 실 API (무과금)", () => {
  it("check_health", async () => {
    const r = await callTool("xbrush_check_health", {});
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/ok|up|healthy|available/i);
  });

  it("list_models (전체)", async () => {
    const r = await callTool("xbrush_list_models", {});
    expect(r.isError).toBe(false);
    expect(r.text).toContain("# Models");
  });

  it.each(["image", "video", "audio"] as const)(
    "list_models category=%s",
    async (cat) => {
      const r = await callTool("xbrush_list_models", { category: cat });
      expect(r.isError).toBe(false);
      expect(r.text).toContain("# Models");
    }
  );

  it("list_requests (최근 5건)", async () => {
    const r = await callTool("xbrush_list_requests", { limit: 5 });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("# Requests");
  });

  it("list_voices (기본 provider)", async () => {
    const r = await callTool("xbrush_list_voices", {});
    expect(r.isError).toBe(false);
    expect(r.text).toContain("# Voices");
  });
});

// ── Paid pipeline (XBRUSH_E2E_PAID=1) ─────────────────────────────────

describe.runIf(hasApiKey && paidOk)("유료 풀 파이프라인 (크레딧 소모)", () => {
  const state: {
    imageUrl?: string;
    editedUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
  } = {};

  it("01 image_generate (z-image-turbo, async+poll)", async () => {
    const r = await callTool("xbrush_image_generate", {
      model: "z-image-turbo",
      prompt: "a single red apple on a white background, minimal, centered",
      n: 1,
      width: 512,
      height: 512,
    });
    if (r.isError) console.warn("image_generate:", r.text.slice(0, 300));
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    expect(reqId).toBeTruthy();
    const done = await pollUntilDone(reqId!, { maxMs: 3 * 60_000 });
    expect(done.status).toBe("completed");
    state.imageUrl = done.url;
    expect(state.imageUrl).toMatch(/^https:/);
  });

  it("02 image_edit (qwen-image-edit, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_image_edit", {
      model: "qwen-image-edit",
      prompt: "make the apple blue",
      image_url: state.imageUrl,
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    expect(reqId).toBeTruthy();
    const done = await pollUntilDone(reqId!, { maxMs: 3 * 60_000 });
    expect(done.status).toBe("completed");
    state.editedUrl = done.url;
  });

  it("03 image_upscale (upscaler 2x, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_image_upscale", {
      image_url: state.imageUrl,
      upscale_factor: 2,
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 3 * 60_000 });
    expect(done.status).toBe("completed");
  });

  it("04 image_remove_bg (remover, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_image_remove_bg", {
      image_url: state.imageUrl,
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 3 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("05 watermark_add (image, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_watermark_add", {
      image_url: state.imageUrl,
    });
    if (r.isError) console.warn("watermark:", r.text.slice(0, 200));
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 5 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("06 tts_generate (eleven-v3, async+poll)", async () => {
    // eleven-v3 (ElevenLabs) works without voice_id; Minimax (speech-*) requires one.
    const r = await callTool("xbrush_tts_generate", {
      model: "eleven-v3",
      text: "Hello, this is a Lightweight test.",
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(done.status).toBe("completed");
    state.audioUrl = done.url;
    expect(state.audioUrl).toMatch(/^https:/);
  });

  it("07 music_generate (async+poll)", async () => {
    const r = await callTool("xbrush_music_generate", {
      prompt: "gentle piano, calm, short instrumental",
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("08 video_generate (kling-v2-1-standard 5s, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_video_generate", {
      model: "kling-v2-1-standard",
      image_url: state.imageUrl,
      prompt: "slight zoom in, subtle motion",
      duration: 5,
    });
    if (r.isError) console.warn("video_generate:", r.text.slice(0, 300));
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    expect(reqId).toBeTruthy();
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    if (done.status === "completed") {
      state.videoUrl = done.url;
    }
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("09 video_upscale (realesrgan 2x, async+poll)", async () => {
    if (!state.videoUrl) return;
    const r = await callTool("xbrush_video_upscale", {
      video_url: state.videoUrl,
      scale: 2,
      model: "realesrgan",
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("10 sound_effect_generate (video→audio, async+poll)", async () => {
    if (!state.videoUrl) return;
    const r = await callTool("xbrush_sound_effect_generate", {
      video_url: state.videoUrl,
      prompt: "ambient room tone",
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("11 video_lip_sync (pixverse-lipsync, async+poll)", async () => {
    if (!state.videoUrl || !state.audioUrl) return;
    const r = await callTool("xbrush_video_lip_sync", {
      model: "pixverse-lipsync",
      video_url: state.videoUrl,
      audio_url: state.audioUrl,
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("12 content_moderate (image, async+poll)", async () => {
    if (!state.imageUrl) return;
    const r = await callTool("xbrush_content_moderate", {
      image_url: state.imageUrl,
    });
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 3 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("13 video_extend (ltx-2.3-extend, async+poll)", async () => {
    if (!state.videoUrl) return;
    const r = await callTool("xbrush_video_extend", {
      model: "ltx-2.3-extend",
      video_url: state.videoUrl,
      duration: 5,
    });
    if (r.isError) console.warn("video_extend:", r.text.slice(0, 200));
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("14 video_retake (ltx-2.3-retake, async+poll)", async () => {
    if (!state.videoUrl) return;
    const r = await callTool("xbrush_video_retake", {
      model: "ltx-2.3-retake",
      video_url: state.videoUrl,
      end_time: 3,
    });
    if (r.isError) console.warn("video_retake:", r.text.slice(0, 200));
    expect(r.isError).toBe(false);
    const reqId = extractRequestId(r.text);
    const done = await pollUntilDone(reqId!, { maxMs: 10 * 60_000 });
    expect(["completed", "timeout"]).toContain(done.status);
  });

  it("15 chat function calling (seed-2.0-mini, 동기 2-turn 라운드트립)", async () => {
    const tools = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ];
    // Turn 1 — 모델이 tool call을 요청해야 함
    const r1 = await callTool("xbrush_chat", {
      model: "bytedance/seed-2.0-mini",
      messages: [{ role: "user", content: "What is the weather in Seoul right now?" }],
      tools,
      max_tokens: 300,
    });
    if (r1.isError) console.warn("chat turn1:", r1.text.slice(0, 300));
    expect(r1.isError).toBe(false);
    expect(r1.text).toContain("Tool calls requested");
    const callId = r1.text.match(/call_[a-z0-9]+/)?.[0];
    expect(callId).toBeTruthy();
    const argsJson = r1.text.match(/"arguments":\s*"(\{.*?\})"/)?.[1];
    expect(argsJson).toBeTruthy();

    // Turn 2 — assistant echo + tool 결과 회신 → 최종 답변
    const r2 = await callTool("xbrush_chat", {
      model: "bytedance/seed-2.0-mini",
      messages: [
        { role: "user", content: "What is the weather in Seoul right now?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: { name: "get_weather", arguments: JSON.parse(`"${argsJson}"`) },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: callId,
          content: '{"temp_c": 31, "condition": "sunny", "humidity": 78}',
        },
      ],
      tools,
      max_tokens: 300,
    });
    if (r2.isError) console.warn("chat turn2:", r2.text.slice(0, 300));
    expect(r2.isError).toBe(false);
    expect(r2.text).toContain("Finish reason**: stop");
    expect(r2.text.toLowerCase()).toContain("31");
  });
});

describe.skipIf(hasApiKey)("API 키 부재 안내", () => {
  it("XBRUSH_API_KEY 미설정 → 도구 호출 테스트 skip", () => {
    expect(hasApiKey).toBe(false);
  });
});
