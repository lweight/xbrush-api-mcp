/**
 * Audio tools: tts_generate, music_generate, sound_effect_generate
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TtsGenerateSchema,
  MusicGenerateSchema,
  SoundEffectGenerateSchema,
} from "../schemas/audio.js";
import { submitSyncOrAsync } from "../services/dispatch.js";
import { SYNC_TIMEOUTS } from "../constants.js";

// ── Tool Registration ─────────────────────────────────────────────────

export function registerAudioTools(server: McpServer): void {
  // ── xbrush_tts_generate ────────────────────────────────────────────

  server.registerTool(
    "xbrush_tts_generate",
    {
      title: "Generate Speech (TTS)",
      description: [
        "Generate speech audio from text using an XBrush TTS model (e.g. speech-2.6-hd, eleven_v3).",
        "By default async — returns a request ID you poll with xbrush_get_request.",
        "",
        "Args:",
        "  text (string, required): Text to speak.",
        "  model (string, optional): TTS model ID. Server default if omitted.",
        "  voice_id (string, optional): Voice selector (model-specific).",
        "  language (string, optional): Locale code (e.g. 'ko', 'en').",
        "  speed (float, optional): Speech rate (0.5-2.0). Default: 1.0.",
        "  sync (bool, optional): Default: false (async). Set true to wait.",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/tts/generate/sync",
        asyncUrl: "/v1/tts/generate",
        syncTimeout: SYNC_TIMEOUTS.audio_short,
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
        "Async by default — generation typically takes tens of seconds to minutes.",
        "",
        "Args:",
        "  prompt (string, required): Text description of the music.",
        "  model (string, optional): Music model ID. Server default if omitted.",
        "  duration (int, optional): Duration in seconds (1-120).",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  seed (int, optional): Random seed.",
        "  sync (bool, optional): Default: false (async).",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/music/generate/sync",
        asyncUrl: "/v1/music/generate",
        syncTimeout: SYNC_TIMEOUTS.audio_long,
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
        "Async by default.",
        "",
        "Args:",
        "  video_url (string, required): Source video URL.",
        "  prompt (string, optional): Text hint biasing the sound design.",
        "  sync (bool, optional): Default: false (async).",
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

      return submitSyncOrAsync({
        useSync: args.sync === true,
        syncUrl: "/v1/sound-effect/generate/sync",
        asyncUrl: "/v1/sound-effect/generate",
        syncTimeout: SYNC_TIMEOUTS.audio_short,
        body,
        label: "Sound effect generation",
      });
    }
  );
}
