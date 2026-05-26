import { z } from "zod";

/**
 * Audio-domain tool schemas: TTS, music, sound-effect.
 *
 * Field names follow XBrush patterns (snake_case in, camelCase to the API).
 * Numeric upper bounds are set conservatively; they may be tightened or
 * loosened once an official API spec lands.
 */

const NonBlankString = z
  .string()
  .trim()
  .min(1, "must not be blank");

export const TtsGenerateSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe(
        "TTS model ID (e.g. eleven-v3, speech-2.8-hd). Optional — server default is a Minimax model (which needs voice_id). Use xbrush_list_models with category='audio'."
      ),
    text: NonBlankString.describe("Text to synthesize (non-blank)."),
    voice_id: z
      .string()
      .optional()
      .describe("Voice identifier. REQUIRED for Minimax models (speech-*); get one from xbrush_list_voices. ElevenLabs (eleven-v3) works without it."),
    language: z
      .string()
      .optional()
      .describe("Language/locale code (e.g. 'ko', 'en', 'ko-KR')."),
    speed: z
      .number()
      .min(0.5)
      .max(2.0)
      .optional()
      .describe("Speech rate multiplier (0.5-2.0). Default: 1.0."),
  })
  .strict();

export const MusicGenerateSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe("Music model ID (e.g. lyria2). Optional — server picks a default."),
    prompt: NonBlankString.describe("Text description of the music to generate."),
    duration: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Duration in seconds (1-120). Conservative upper bound; may be lifted by server."),
    negative_prompt: z
      .string()
      .optional()
      .describe("Styles/elements to exclude from the generated music."),
    seed: z.number().int().optional().describe("Random seed for reproducibility."),
  })
  .strict();

/**
 * Sound-effect generation is a video-to-audio task — the server generates
 * foley / ambient audio appropriate to the supplied video. The optional
 * `prompt` biases the sound design.
 */
export const SoundEffectGenerateSchema = z
  .object({
    video_url: z
      .string()
      .url()
      .describe("URL of the source video to generate sound effects for."),
    prompt: z
      .string()
      .optional()
      .describe("Optional text description biasing the sound (e.g. 'gentle rain on leaves')."),
  })
  .strict();
