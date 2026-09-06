/**
 * Audio tools: tts_generate (+ timestamped variant), music_generate,
 * sound_effect_generate, stt_transcribe
 *
 * All tools submit asynchronously and return a request_id. Callers must poll
 * the result with `xbrush_get_request`. /sync endpoints are intentionally not
 * used (see CLAUDE.md "Async only"). /v1/tts-wt/generate happens to finish
 * inside the submit call (202 + status "completed") — the result is still
 * read back through xbrush_get_request like every other job.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TtsGenerateSchema,
  MusicGenerateSchema,
  SoundEffectGenerateSchema,
  SttTranscribeSchema,
} from "../schemas/audio.js";
import { submitAsync } from "../services/dispatch.js";
import { formatAsyncResult } from "../services/xbrush-client.js";
import type { XBrushAsyncResponse } from "../types.js";

const ASYNC_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

// ── Tool Registration ─────────────────────────────────────────────────

export function registerAudioTools(server: McpServer): void {
  // ── xbrush_tts_generate ────────────────────────────────────────────

  server.registerTool(
    "xbrush_tts_generate",
    {
      title: "Generate Speech (TTS)",
      description: [
        "Generate speech audio from text using an XBrush TTS model.",
        "Voices: eleven-v3 (ElevenLabs) works without voice_id (default 'Rachel'; names via xbrush_list_voices(model='eleven-v3')).",
        "MiniMax speech-2.8-hd / speech-2.8-turbo / speech-2.6-hd REQUIRE a moss_audio_* voice_id (xbrush_list_voices(model='speech-2.8-hd')",
        "or your own clone). ByteDance seed-icl-2.0 REQUIRES a cloned xbseed_* voice_id (xbrush_voice_clone); seed-tts-2.0 requires a",
        "preset voice name (the preset list is not exposed by the API — prefer eleven-v3 / seed-icl-2.0).",
        "Submits async — poll the returned request_id with xbrush_get_request. Output: audioUrl, duration, voiceId (mp3; Seed → wav).",
        "Set with_timestamps:true for character-level timing (subtitles/karaoke) — uses POST /v1/tts-wt/generate; the output adds",
        "alignment {characters[], character_start_times_seconds[], character_end_times_seconds[]}; only model/voice_id/speed/style apply there.",
        "",
        "Args:",
        "  text (string, required): Text to speak (≤10,000 chars).",
        "  model (string, optional): eleven-v3 | speech-2.8-hd | speech-2.8-turbo | speech-2.6-hd | seed-tts-2.0 | seed-icl-2.0. Default is MiniMax (needs voice_id).",
        "  voice_id (string): see above.",
        "  speed (float, optional): 0.5-2.0 (default 1.0). pitch (float, optional): -12..12 semitones (MiniMax). style (float, optional): 0-1 (ElevenLabs).",
        "  emotion (string, optional): happy/sad/angry/fearful/disgusted/surprised/calm/fluent/whisper (MiniMax).",
        "  output_format (string, optional): provider hint, e.g. 'mp3'/'wav'.",
        "  with_timestamps (bool, optional): character-level timing variant (see above).",
        "  language: deprecated (ignored by the server).",
      ].join("\n"),
      inputSchema: TtsGenerateSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        text: args.text,
      };
      if (args.model !== undefined) body.model = args.model;
      if (args.voice_id !== undefined) body.voiceId = args.voice_id;
      if (args.speed !== undefined) body.speed = args.speed;
      if (args.style !== undefined) body.style = args.style;

      if (args.with_timestamps) {
        return submitAsync<XBrushAsyncResponse>({
          url: "/v1/tts-wt/generate",
          body,
          label: "TTS generation with timestamps",
          formatAsync: (r, label) =>
            r.status === "completed"
              ? [
                  `${label} completed inline (the server finished it during submission).`,
                  "",
                  `- **Request ID**: \`${r.requestId}\``,
                  `- **Credits charged**: ${r.creditCharged}`,
                  "",
                  `Fetch the audio URL and the character-level alignment with \`xbrush_get_request\` (request_id \`${r.requestId}\`).`,
                ].join("\n")
              : formatAsyncResult(r, label),
        });
      }

      if (args.pitch !== undefined) body.pitch = args.pitch;
      if (args.emotion !== undefined) body.emotion = args.emotion;
      if (args.output_format !== undefined) body.outputFormat = args.output_format;
      if (args.language !== undefined) body.language = args.language;

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
        "Generate music from a text prompt using a Google Lyria model (lyria2 0.13, lyria3 0.052, lyria3-pro 0.104 credits per track).",
        "Submits async — generation takes ~30s-2min. Poll with xbrush_get_request. Output: audioUrl (mp3), duration.",
        "",
        "Args:",
        "  prompt (string, required): Text description of the music.",
        "  model (string, optional): lyria2 | lyria3 | lyria3-pro. Server default if omitted.",
        "  duration (int, optional): Requested seconds (5-300; models round to their clip length, e.g. lyria3 ≈30s).",
        "  negative_prompt (string, optional): Elements to exclude.",
        "  image_url (string, optional): Reference image to derive mood/style from.",
        "  seed (int, optional): Random seed.",
      ].join("\n"),
      inputSchema: MusicGenerateSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        prompt: args.prompt,
      };
      if (args.model !== undefined) body.model = args.model;
      if (args.duration !== undefined) body.duration = args.duration;
      if (args.negative_prompt !== undefined) body.negativePrompt = args.negative_prompt;
      if (args.image_url !== undefined) body.imageUrl = args.image_url;
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
        "Video-driven models (pixverse-sound-effects) design sound from the visuals; text-driven",
        "models (elevenlabs-sound-effects, stable-audio-sfx) generate from prompt — but video_url",
        "is required for every model.",
        "Submits async — poll the returned request_id with xbrush_get_request. Output: audioUrl.",
        "",
        "Args:",
        "  video_url (string, required): Source video URL (required even for text-driven models).",
        "  prompt (string, optional): Sound description — main input for text-driven models.",
        "  model (string, optional): pixverse-sound-effects | elevenlabs-sound-effects | stable-audio-sfx. Server default if omitted.",
        "  duration (number, optional): Seconds (1-30).",
      ].join("\n"),
      inputSchema: SoundEffectGenerateSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = {
        videoUrl: args.video_url,
      };
      if (args.prompt !== undefined) body.prompt = args.prompt;
      if (args.model !== undefined) body.model = args.model;
      if (args.duration !== undefined) body.duration = args.duration;

      return submitAsync({
        url: "/v1/sound-effect/generate",
        body,
        label: "Sound effect generation",
      });
    }
  );

  // ── xbrush_stt_transcribe ──────────────────────────────────────────

  server.registerTool(
    "xbrush_stt_transcribe",
    {
      title: "Transcribe Speech (STT)",
      description: [
        "Speech-to-text with whisper-1 (0.00013 credits/sec of audio — a 30s clip ≈0.004).",
        "Submits async — poll the returned request_id with xbrush_get_request (a 30s clip finished in seconds).",
        "Output: text, language, duration, model.",
        "INPUT MUST BE WAV (v1): mp3/m4a URLs are rejected at submit ('RIFF header not found'). Convert first with",
        "xbrush_media_ffmpeg (op extract-audio, output.format 'wav') or upload a local .wav via xbrush_file_upload. Max 25 MB.",
        "For videos, xbrush_video_vision returns a timed transcript directly.",
        "",
        "Args:",
        "  audio_url (string, required): http(s) URL of a WAV file.",
        "  language (string, optional): ISO-639-1 hint (e.g. 'en', 'ko'); omit for auto-detect.",
      ].join("\n"),
      inputSchema: SttTranscribeSchema,
      annotations: ASYNC_ANNOTATIONS,
    },
    async (args) => {
      const body: Record<string, unknown> = { audioUrl: args.audio_url };
      if (args.language !== undefined) body.language = args.language;
      return submitAsync({ url: "/v1/stt/transcribe", body, label: "Speech transcription" });
    }
  );
}
