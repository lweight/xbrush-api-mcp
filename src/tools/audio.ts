/**
 * Audio tools: tts_generate, music_generate, sound_effect_generate
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only").
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TtsGenerateSchema,
  MusicGenerateSchema,
  SoundEffectGenerateSchema,
} from "../schemas/audio.js";
import { submitAsync } from "../services/dispatch.js";

// ── Tool Registration ─────────────────────────────────────────────────

export function registerAudioTools(server: McpServer): void {
  // ── xbrush_tts_generate ────────────────────────────────────────────

  server.registerTool(
    "xbrush_tts_generate",
    {
      title: "Generate Speech (TTS)",
      description: [
        "Generate speech audio from text using an XBrush TTS model (e.g. speech-2.6-hd, eleven_v3).",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  text (string, required): Text to speak.",
        "  model (string, optional): TTS model ID. Server default if omitted.",
        "  voice_id (string, optional): Voice selector (model-specific).",
        "  language (string, optional): Locale code (e.g. 'ko', 'en').",
        "  speed (float, optional): Speech rate (0.5-2.0). Default: 1.0.",
      ].join("\n"),
      inputSchema: TtsGenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        text: args.text,
      };
      if (args.model !== undefined) body.model = args.model;
      if (args.voice_id !== undefined) body.voiceId = args.voice_id;
      if (args.language !== undefined) body.language = args.language;
      if (args.speed !== undefined) body.speed = args.speed;

      return submitAsync({
        url: "/v1/tts/generate",
        body,
        label: "TTS generation",
      });
    }
  );

  // ── xbrush_music_generate ──────────────────────────────────────────

  server.registerTool(
    "xbrush_music_generate",
    {
      title: "Generate Music",
      description: [
        "Generate music from a text prompt using an XBrush music model (e.g. lyria2).",
        "Submits async — generation typically takes tens of seconds to minutes. Poll with xbrush_get_request.",
        "",
        "Args:",
        "  prompt (string, required): Text description of the music.",
        "  model (string, optional): Music model ID. Server default if omitted.",
        "  duration (int, optional): Duration in seconds (1-120).",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  seed (int, optional): Random seed.",
      ].join("\n"),
      inputSchema: MusicGenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        prompt: args.prompt,
      };
      if (args.model !== undefined) body.model = args.model;
      if (args.duration !== undefined) body.duration = args.duration;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.seed !== undefined) body.seed = args.seed;

      return submitAsync({
        url: "/v1/music/generate",
        body,
        label: "Music generation",
      });
    }
  );

  // ── xbrush_sound_effect_generate ───────────────────────────────────

  server.registerTool(
    "xbrush_sound_effect_generate",
    {
      title: "Generate Sound Effect",
      description: [
        "Generate foley / ambient sound effects for a given video.",
        "Takes a source video URL and returns audio appropriate to its visual content.",
        "Submits async — poll the returned request_id with xbrush_get_request.",
        "",
        "Args:",
        "  video_url (string, required): Source video URL.",
        "  prompt (string, optional): Text hint biasing the sound design.",
      ].join("\n"),
      inputSchema: SoundEffectGenerateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        videoUrl: args.video_url,
      };
      if (args.prompt !== undefined) body.prompt = args.prompt;

      return submitAsync({
        url: "/v1/sound-effect/generate",
        body,
        label: "Sound effect generation",
      });
    }
  );
}
