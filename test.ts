#!/usr/bin/env npx tsx
/**
 * XBrush MCP Server — Phase 1 테스트
 * 실행: XBRUSH_API_KEY=... XBRUSH_BASE_URL=... npx tsx test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";

interface TestResult {
  name: string;
  status: string;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, status: string, detail: string) {
  results.push({ name, status, detail });
  const icon = status === PASS ? "✅" : status === FAIL ? "❌" : "⏭️";
  console.log(`${icon} ${name}: ${detail}`);
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.map((c) => c.text).join("\n");
  if (result.isError) throw new Error(text);
  return text;
}

async function main() {
  // Connect to MCP server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: {
      ...process.env,
      XBRUSH_API_KEY: process.env.XBRUSH_API_KEY!,
      ...(process.env.XBRUSH_BASE_URL ? { XBRUSH_BASE_URL: process.env.XBRUSH_BASE_URL } : {}),
    },
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected to XBrush MCP server\n");

  // ── T1. Tool listing ────────────────────────────────────────────────
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    record("T1. Tool listing", names.length === 9 ? PASS : FAIL, `${names.length} tools: ${names.join(", ")}`);
  } catch (e) {
    record("T1. Tool listing", FAIL, String(e));
  }

  // ── T2. Health check ────────────────────────────────────────────────
  try {
    const text = await callTool(client, "xbrush_check_health");
    const ok = text.includes("ok");
    record("T2. Health check", ok ? PASS : FAIL, text.trim());
  } catch (e) {
    record("T2. Health check", FAIL, String(e));
  }

  // ── T3. List models ─────────────────────────────────────────────────
  try {
    const text = await callTool(client, "xbrush_list_models");
    const hasModels = text.includes("z-image-turbo");
    record("T3. List models (all)", hasModels ? PASS : FAIL, text.split("\n")[0]);
  } catch (e) {
    record("T3. List models (all)", FAIL, String(e));
  }

  // ── T4. List models (filtered) ──────────────────────────────────────
  try {
    const text = await callTool(client, "xbrush_list_models", { category: "audio" });
    const noImage = !text.includes("z-image-turbo");
    const hasAudio = text.includes("eleven_v3") || text.includes("speech");
    record("T4. List models (audio)", noImage && hasAudio ? PASS : FAIL, text.split("\n")[0]);
  } catch (e) {
    record("T4. List models (audio)", FAIL, String(e));
  }

  // ── T5. List requests ───────────────────────────────────────────────
  try {
    const text = await callTool(client, "xbrush_list_requests", { limit: 3 });
    const hasRequests = text.includes("Requests");
    record("T5. List requests", hasRequests ? PASS : FAIL, text.split("\n")[0]);
  } catch (e) {
    record("T5. List requests", FAIL, String(e));
  }

  // ── T6. Image generate (sync) ──────────────────────────────────────
  let generatedImageUrl = "";
  try {
    const text = await callTool(client, "xbrush_image_generate", {
      model: "z-image-turbo",
      prompt: "a small red dot on white background",
      width: 512,
      height: 512,
    });
    const urlMatch = text.match(/https:\/\/assets\.xbrush\.ai\/[^\s]+/);
    generatedImageUrl = urlMatch ? urlMatch[0] : "";
    record("T6. Image generate", urlMatch ? PASS : FAIL, generatedImageUrl || text.substring(0, 100));
  } catch (e) {
    record("T6. Image generate", FAIL, String(e));
  }

  // ── T7. Image remove_bg (sync) ─────────────────────────────────────
  if (generatedImageUrl) {
    try {
      const text = await callTool(client, "xbrush_image_remove_bg", {
        image_url: generatedImageUrl,
      });
      const urlMatch = text.match(/https:\/\/assets\.xbrush\.ai\/[^\s]+/);
      record("T7. Remove background", urlMatch ? PASS : FAIL, urlMatch?.[0] || text.substring(0, 100));
    } catch (e) {
      record("T7. Remove background", FAIL, String(e));
    }
  } else {
    record("T7. Remove background", SKIP, "No image URL from T6");
  }

  // ── T8. Image edit (async) ─────────────────────────────────────────
  let editRequestId = "";
  if (generatedImageUrl) {
    try {
      const text = await callTool(client, "xbrush_image_edit", {
        model: "qwen-image-edit-re",
        prompt: "change the red dot to blue",
        image_url: generatedImageUrl,
      });
      const idMatch = text.match(/req[a-zA-Z0-9]{21}/);
      editRequestId = idMatch ? idMatch[0] : "";
      const isAsync = text.includes("async") || text.includes("pending");
      record("T8. Image edit (async)", isAsync && editRequestId ? PASS : FAIL, editRequestId || text.substring(0, 100));
    } catch (e) {
      record("T8. Image edit (async)", FAIL, String(e));
    }
  } else {
    record("T8. Image edit (async)", SKIP, "No image URL from T6");
  }

  // ── T9. Image upscale (async) ──────────────────────────────────────
  let upscaleRequestId = "";
  if (generatedImageUrl) {
    try {
      const text = await callTool(client, "xbrush_image_upscale", {
        image_url: generatedImageUrl,
        upscale_factor: 2,
      });
      const idMatch = text.match(/req[a-zA-Z0-9]{21}/);
      upscaleRequestId = idMatch ? idMatch[0] : "";
      const isAsync = text.includes("async") || text.includes("pending");
      record("T9. Image upscale (async)", isAsync && upscaleRequestId ? PASS : FAIL, upscaleRequestId || text.substring(0, 100));
    } catch (e) {
      record("T9. Image upscale (async)", FAIL, String(e));
    }
  } else {
    record("T9. Image upscale (async)", SKIP, "No image URL from T6");
  }

  // ── T10. Get request (poll edit) ────────────────────────────────────
  if (editRequestId) {
    try {
      const text = await callTool(client, "xbrush_get_request", { request_id: editRequestId });
      const hasStatus = text.includes("pending") || text.includes("completed") || text.includes("processing");
      record("T10. Get request (edit)", hasStatus ? PASS : FAIL, text.split("\n").find((l) => l.includes("Status")) || text.substring(0, 100));
    } catch (e) {
      record("T10. Get request (edit)", FAIL, String(e));
    }
  } else {
    record("T10. Get request (edit)", SKIP, "No edit request ID from T8");
  }

  // ── T11. Error: invalid model ───────────────────────────────────────
  try {
    await callTool(client, "xbrush_image_generate", {
      model: "nonexistent-model",
      prompt: "test",
    });
    record("T11. Error (invalid model)", FAIL, "Expected error but succeeded");
  } catch (e) {
    const msg = String(e);
    const hasModelHint = msg.includes("xbrush_list_models") || msg.includes("INVALID_MODEL");
    record("T11. Error (invalid model)", hasModelHint ? PASS : FAIL, msg.substring(0, 120));
  }

  // ── T12. Error: missing param ───────────────────────────────────────
  try {
    await callTool(client, "xbrush_image_generate", {
      model: "z-image-turbo",
      // prompt missing
    });
    record("T12. Error (missing prompt)", FAIL, "Expected error but succeeded");
  } catch (e) {
    record("T12. Error (missing prompt)", PASS, "Validation error caught");
  }

  // ── T13. Error: bad request_id ──────────────────────────────────────
  try {
    await callTool(client, "xbrush_get_request", { request_id: "bad" });
    record("T13. Error (bad request_id)", FAIL, "Expected error but succeeded");
  } catch (e) {
    record("T13. Error (bad request_id)", PASS, "Validation error caught");
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.status === PASS).length;
  const failed = results.filter((r) => r.status === FAIL).length;
  const skipped = results.filter((r) => r.status === SKIP).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped / ${results.length} total`);

  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
