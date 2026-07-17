import { z } from "zod";

/**
 * List voices available for TTS. `model` filters to a specific TTS model /
 * provider (the same model ID accepted by xbrush_tts_generate). Omit to get the
 * server's default provider.
 */
export const ListVoicesSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe("TTS model ID to list voices for (e.g. speech-2.8-hd, eleven-v3). Omit for the default provider. See xbrush_list_models(category='audio')."),
  })
  .strict();

/**
 * Voice clone — POST /v1/voice/clone (2026-07-17, endpoint newly live).
 *
 * Recognized fields (reverse-engineered from validation errors): `name`
 * (required), `audioUrls` (required, ≥1 URL), `model` (enum eleven /
 * speech-2.8-hd / speech-2.6-hd — kept free-form here, the server rejects
 * others with the allowed list), `description`, `removeBackgroundNoise`.
 * SYNCHRONOUS endpoint: audio is downloaded and the provider is called before
 * the response returns. Flat 50 credits per attempt, auto-refunded on failure
 * (verified live). The record's input shows the server stores the user name as
 * `display_name` and generates its own internal voice name.
 */
export const VoiceCloneSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .describe("Display name for the cloned voice (shown in xbrush_list_voices)."),
    audio_urls: z
      .array(z.string().url())
      .min(1)
      .describe(
        "URLs of voice sample audio files (≥1). Uploaded first via xbrush_file_upload if local. " +
          "The server downloads these at submit time — an unreachable URL fails immediately. " +
          "Providers enforce minimum sample length (MiniMax rejects short clips with 'voice duration " +
          "too short') — provide at least ~10s, ideally 30s+ of clean single-speaker speech."
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Target TTS provider/model for the clone: 'eleven', 'speech-2.8-hd', or 'speech-2.6-hd' " +
          "(server-validated; other values are rejected with the allowed list). Omit for the server default."
      ),
    description: z.string().optional().describe("Optional description stored with the voice."),
    remove_background_noise: z
      .boolean()
      .optional()
      .describe("Denoise the samples before cloning (default: false)."),
  })
  .strict();
