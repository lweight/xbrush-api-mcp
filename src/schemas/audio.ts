import { z } from "zod";

/**
 * Audio-domain tool schemas: TTS (+ timestamps), music, sound-effect, STT.
 *
 * Field inventories re-verified live 2026-09-06 (wrong-type probe):
 *   /v1/tts/generate    text(≤10000), model, voiceId, speed(0.5-2), pitch(-12..12),
 *                       style(0-1), emotion(enum), outputFormat, webhookUrl
 *                       (no `language` field any more — ignored if sent)
 *   /v1/tts-wt/generate text, model, voiceId, speed(0.5-2), style(0-1) → character-level
 *                       timing (alignment); completes inline (202 + status "completed")
 *   /v1/music/generate  prompt, model, duration(5-300), negativePrompt, seed, imageUrl
 *   /v1/sound-effect/generate prompt, model, videoUrl, duration(1-30)
 *   /v1/stt/transcribe  audioUrl (WAV only, RIFF header checked at submit), language(ISO-639-1)
 *
 * Voice requirements (server messages, 2026-09-06): MiniMax speech-* and both
 * Seed models REQUIRE voiceId — seed-icl-2.0 takes a cloned xbseed_* id from
 * xbrush_voice_clone, seed-tts-2.0 a preset voice name, MiniMax a moss_audio_*
 * id from xbrush_list_voices(model='speech-2.8-hd'). eleven-v3 works without
 * one (default "Rachel"; other names via xbrush_list_voices(model='eleven-v3')).
 */

const NonBlankString = z
  .string()
  .trim()
  .min(1, "must not be blank");

export const TTS_EMOTIONS = [
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
  "calm",
  "fluent",
  "whisper",
] as const;

export const TtsGenerateSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe(
        "TTS model ID: eleven-v3 (ElevenLabs, 0.12 credits/1k chars, works without voice_id), speech-2.8-hd / speech-2.8-turbo / speech-2.6-hd (MiniMax, need a moss_audio_* voice_id), seed-tts-2.0 (ByteDance preset voices, 0.039) or seed-icl-2.0 (ByteDance, needs a cloned xbseed_* voice_id, 0.039). Optional — server default is a MiniMax model (which needs voice_id). See xbrush_list_models(category='audio')."
      ),
    text: NonBlankString.max(10_000).describe("Text to synthesize (non-blank, ≤10,000 characters)."),
    voice_id: z
      .string()
      .optional()
      .describe("Voice identifier. REQUIRED for MiniMax speech-* (moss_audio_* from xbrush_list_voices(model='speech-2.8-hd')), seed-icl-2.0 (xbseed_* from xbrush_voice_clone) and seed-tts-2.0 (preset name). For eleven-v3 a preset name like 'Rachel' or 'Aria' (xbrush_list_voices(model='eleven-v3')); omit for the default."),
    speed: z
      .number()
      .min(0.5)
      .max(2.0)
      .optional()
      .describe("Speech rate multiplier (0.5-2.0). Default: 1.0."),
    pitch: z
      .number()
      .min(-12)
      .max(12)
      .optional()
      .describe("Pitch shift in semitones (-12..12) for providers that support it (MiniMax). Default 0."),
    style: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Style exaggeration 0-1 (ElevenLabs style knob). Default provider-defined."),
    emotion: z
      .enum(TTS_EMOTIONS)
      .optional()
      .describe("Emotion preset (MiniMax voices): happy, sad, angry, fearful, disgusted, surprised, calm, fluent, whisper."),
    output_format: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Requested audio container/format hint passed to the provider (e.g. 'mp3', 'wav'). Provider-dependent — eleven-v3 returned mp3 regardless in testing; Seed voices return wav."),
    language: z
      .string()
      .optional()
      .describe("DEPRECATED — the endpoint no longer recognizes a language field (ignored). Voices are multilingual; write the text in the target language."),
    with_timestamps: z
      .boolean()
      .optional()
      .describe("true → use the timestamped variant (POST /v1/tts-wt/generate): the result carries character-level start/end times (alignment arrays) for subtitles/karaoke. Only model, voice_id, speed and style apply on that path; it completes inline (~2-7s) and the audio + alignment are read back with xbrush_get_request."),
  })
  .strict();

export const MusicGenerateSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe("Music model ID: lyria2 (0.13 credits/track), lyria3 (0.052), lyria3-pro (0.104). Optional — server picks a default; other values are rejected with the supported list."),
    prompt: NonBlankString.describe("Text description of the music to generate (genre, mood, instruments, tempo)."),
    duration: z
      .number()
      .int()
      .min(5)
      .max(300)
      .optional()
      .describe("Requested duration in seconds (5-300). Model may round to its native clip length (lyria3 returned ~30s for a 5s request)."),
    negative_prompt: z
      .string()
      .optional()
      .describe("Styles/elements to exclude from the generated music."),
    image_url: z
      .string()
      .url()
      .optional()
      .describe("Optional reference image URL — the model derives mood/style from it (image-conditioned music)."),
    seed: z.number().int().optional().describe("Random seed for reproducibility."),
  })
  .strict();

/**
 * Sound-effect generation. `video_url` is required by the endpoint for EVERY
 * model (re-verified 2026-09-06 — even the text-driven soundeffect-text
 * models reject a prompt-only request with videoUrl REQUIRED). Video-driven
 * models (pixverse-sound-effects) design sound from the visuals; text-driven
 * models (elevenlabs-sound-effects, stable-audio-sfx) lean on `prompt`.
 */
export const SoundEffectGenerateSchema = z
  .object({
    model: z
      .string()
      .optional()
      .describe(
        "Sound-effect model ID: pixverse-sound-effects (video-driven, 0.026/sec), elevenlabs-sound-effects (text-driven, 0.0026/sec) or stable-audio-sfx (text-driven, 0.26/clip) — describe the sound in prompt for the text-driven ones. Server default if omitted."
      ),
    video_url: z
      .string()
      .url()
      .describe("URL of the source video. Required for all models (even text-driven ones)."),
    prompt: z
      .string()
      .optional()
      .describe("Text description of the sound (e.g. 'gentle rain on leaves'). Main input for text-driven models; a bias hint for video-driven ones."),
    duration: z
      .number()
      .min(1)
      .max(30)
      .optional()
      .describe("Sound duration in seconds (1-30)."),
  })
  .strict();

/**
 * Speech-to-text — POST /v1/stt/transcribe (whisper-1, 0.00013 credits/sec,
 * async: 202 + request_id; ~30s clip transcribed in a few seconds).
 * v1 accepts WAV only (the server checks the RIFF header at submit and 400s
 * otherwise); max 25 MB. Output: { text, language, duration, model }.
 */
export const SttTranscribeSchema = z
  .object({
    audio_url: z
      .string()
      .url()
      .describe("http(s) URL of a WAV file (v1 accepts WAV only — mp3/m4a are rejected at submit with 'RIFF header not found'; convert first, e.g. via xbrush_media_ffmpeg extract-audio with output format wav, then upload). Max 25 MB."),
    language: z
      .string()
      .regex(/^[a-z]{2}$/, "ISO-639-1 code (two lowercase letters)")
      .optional()
      .describe("ISO-639-1 language code hint (two lowercase letters, e.g. 'en', 'ko'). Omit for auto-detect."),
  })
  .strict();
