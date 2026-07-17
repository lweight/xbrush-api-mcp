#!/usr/bin/env node

/**
 * XBrush MCP Server
 *
 * MCP server for the XBrush AI media generation API.
 * Provides tools for image generation/editing, model listing,
 * request tracking, and file upload.
 *
 * Transport: stdio (local use with Claude Code)
 * Auth: XBRUSH_API_KEY environment variable (X-API-Key header)
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerImageTools } from "./tools/image.js";
import { registerRequestTools } from "./tools/requests.js";
import { registerModelTools } from "./tools/models.js";
import { registerFileUploadTools } from "./tools/file-upload.js";
import { registerVideoTools } from "./tools/video.js";
import { registerAudioTools } from "./tools/audio.js";
import { registerChatTools } from "./tools/chat.js";
import { registerLipSyncTools } from "./tools/lip-sync.js";
import { registerWatermarkTools } from "./tools/watermark.js";
import { registerModerationTools } from "./tools/moderation.js";
import { registerVoiceTools } from "./tools/voice.js";
import { registerLoraTools } from "./tools/lora.js";
import { applyDisableFilter, parseDisabledTools } from "./tool-filter.js";

// ── Read version from package.json ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf-8")
);

// ── Server Initialization ─────────────────────────────────────────────

const server = new McpServer(
  {
    name: pkg.name,
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Register All Tools ────────────────────────────────────────────────

const disabled = parseDisabledTools(process.env.XBRUSH_DISABLED_TOOLS);
const reportUnmatched = applyDisableFilter(server, disabled);

registerImageTools(server); // 4 tools: generate, edit, upscale, remove_bg
registerVideoTools(server); // 4 tools: video_generate, video_upscale, video_extend, video_retake
registerAudioTools(server); // 3 tools: tts_generate, music_generate, sound_effect_generate
registerChatTools(server); // 1 tool:  chat (sync LLM — the async-only rule's lone exception)
registerLipSyncTools(server); // 1 tool:  video_lip_sync
registerWatermarkTools(server); // 1 tool:  watermark_add
registerModerationTools(server); // 1 tool:  content_moderate
registerRequestTools(server); // 3 tools: get_request, list_requests, check_health
registerModelTools(server); // 1 tool:  list_models
registerVoiceTools(server); // 2 tools: list_voices, voice_clone (sync — like chat)
registerLoraTools(server); // 1 tool:  lora_train
registerFileUploadTools(server); // 1 tool:  file_upload

reportUnmatched();

// ── Start Server ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("XBrush MCP server started (stdio transport)");
}

main().catch((error) => {
  console.error("Failed to start XBrush MCP server:", error);
  process.exit(1);
});
