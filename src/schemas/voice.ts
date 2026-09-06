import { z } from "zod";

/**
 * List voices available for TTS. `model` filters to a specific TTS provider
 * (server enum 2026-09: eleven, speech-2.8-hd, speech-2.6-hd, seed-icl-2.0 —
 * TTS model ids like eleven-v3 / speech-2.8-turbo are rejected with the list,
 * so the tool maps them to the accepted provider keys). Omit to get the
 * server's default provider (ElevenLabs). `voice_id` instead returns one
 * voice's detail (GET /v1/voice/{voiceId}).
 */
export const ListVoicesSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe("Provider/model to list voices for: 'eleven' (ElevenLabs — also accepts 'eleven-v3'), 'speech-2.8-hd' / 'speech-2.6-hd' (MiniMax — also accepts 'speech-2.8-turbo'), 'seed-icl-2.0' (ByteDance clones; vendor listing not supported — empty list). Omit for the default provider."),
    voice_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Return the detail of one voice instead of a list (GET /v1/voice/{voiceId}): name, model, provider, demo audio, status. Use for cloned voices (moss_audio_*, xbseed_*)."),
  })
  .strict();

/**
 * Voice clone — POST /v1/voice/clone (live since 2026-07-17; re-verified with
 * two successful clones 2026-09-06).
 *
 * Recognized fields: `name` (required), `audioUrls` (required, ≥1 URL),
 * `model` (enum eleven / speech-2.8-hd / speech-2.6-hd / seed-icl-2.0 — kept
 * free-form here, the server rejects others with the allowed list),
 * `voiceId` (xbseed_* only — retrain an existing Seed voice), `description`,
 * `removeBackgroundNoise`, `webhookUrl`.
 * SYNCHRONOUS: the server downloads the samples and calls the provider before
 * answering (202 with status "completed" in ~6-10s; a bad URL fails
 * immediately). Billing is a flat per-attempt fee from xbrush_list_models
 * (featureType voice_clone): 2 credits for eleven / speech-2.8-hd /
 * speech-2.6-hd, 2.6 credits for seed-icl-2.0; failures auto-refund.
 * The voice appears in xbrush_list_voices for its provider and the new id
 * (moss_audio_* for MiniMax, xbseed_* for Seed, ElevenLabs ids for eleven) is
 * used as `voice_id` in xbrush_tts_generate with the matching model.
 */
export const VoiceCloneSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .describe("Display name for the cloned voice (shown in xbrush_list_voices; the vendor-side name is generated)."),
    audio_urls: z
      .array(z.string().url())
      .min(1)
      .describe(
        "URLs of voice sample audio files (≥1; mp3/wav). Upload local files first via xbrush_file_upload. " +
          "The server downloads these at submit time — an unreachable URL fails immediately. " +
          "Providers enforce minimum sample length (MiniMax rejects short clips with 'voice duration too short') — " +
          "provide at least ~10s, ideally 30s+ of clean single-speaker speech (a 28s clip cloned fine on both MiniMax and Seed)."
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Target TTS provider/model for the clone: 'seed-icl-2.0' (ByteDance, 2.6 credits, then use with xbrush_tts_generate model seed-icl-2.0), " +
          "'speech-2.8-hd' / 'speech-2.6-hd' (MiniMax, 2 credits), or 'eleven' (ElevenLabs, 2 credits; platform-wide slot limit may reject). " +
          "Server-validated; other values are rejected with the allowed list. Omit for the server default."
      ),
    voice_id: z
      .string()
      .regex(/^xbseed_/, "must be a BytePlus Seed voice id (xbseed_*)")
      .optional()
      .describe("Retrain an existing Seed voice instead of creating a new one: its xbseed_* id (model seed-icl-2.0 only; each voice has a limited number of training runs — see available_training_times in the clone result)."),
    description: z.string().optional().describe("Optional description stored with the voice."),
    remove_background_noise: z
      .boolean()
      .optional()
      .describe("Denoise the samples before cloning (default: false)."),
  })
  .strict();
