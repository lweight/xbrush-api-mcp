import { z } from "zod";

/**
 * Video lip-sync — /v1/video/lip-sync.
 *
 * The endpoint accepts one field superset for every model (verified live
 * 2026-07-15 — validation is NOT model-aware; per-model requirements are
 * enforced afterwards, e.g. INVALID_INPUT "imageUrl is required for
 * fabric-1.0 model"):
 *   videoUrl | imageUrl (face input), audioUrl | text+voiceId (speech input),
 *   duration 1-60, resolution 480p/720p.
 *
 * Video-driven models (pixverse-lipsync, infinite-talk) take video_url;
 * fabric-1.0 / fabric-1.0-fast animate a still portrait (talking photo) from
 * image_url. Speech comes from audio_url or, alternatively, built-in TTS via
 * text + voice_id. Which combination is required is decided per model by the
 * server — the schema stays permissive (no client whitelists), and the tool
 * handler only enforces the model-independent minimum (a face input and a
 * speech input).
 */
export const VideoLipSyncSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe(
        "Lip-sync model ID: pixverse-lipsync / infinite-talk (video input), fabric-1.0 / fabric-1.0-fast (still-photo input, 'talking photo'). Defaults to the server's default model."
      ),
    video_url: z
      .string()
      .url()
      .optional()
      .describe("URL of the source face video (video-driven models). Provide video_url OR image_url."),
    image_url: z
      .string()
      .url()
      .optional()
      .describe("URL of a still portrait photo to animate — talking photo (fabric-1.0/-fast). Provide video_url OR image_url."),
    audio_url: z
      .string()
      .url()
      .optional()
      .describe("URL of the speech audio to lip-sync. Alternative: text + voice_id (built-in TTS)."),
    text: z
      .string()
      .optional()
      .describe("Text to speak via built-in TTS instead of audio_url (use with voice_id; see xbrush_list_voices)."),
    voice_id: z
      .string()
      .optional()
      .describe("Voice for built-in TTS when using text (from xbrush_list_voices)."),
    duration: z
      .number()
      .min(1)
      .max(60)
      .optional()
      .describe("Output duration in seconds (1-60). Model default if omitted."),
    resolution: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Output resolution tier — currently \"480p\" or \"720p\" (higher costs more; e.g. fabric-1.0 480p 0.104 vs 720p 0.195 credits/sec). Server-validated."),
  })
  .strict();
