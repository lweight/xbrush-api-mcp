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
