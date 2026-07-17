import { z } from "zod";

/**
 * LoRA training — POST /v1/lora/train (2026-07-17, endpoint newly live).
 *
 * Recognized fields (reverse-engineered from validation errors): `name`
 * (required), `imageUrls` (required, 1-80 HTTPS URLs), `model`, `triggerWord`
 * (server default "TOK"), `steps` (500-8000, server default 1000). Billing is
 * per1kStep: 2 credits per 1000 steps (500 steps → 1 credit, measured).
 *
 * `model` is NOT validated at submit time — an unknown model is accepted
 * (202) and fails during processing with a refund. The worker's accepted set
 * (from its error message) is FLUX.1-dev, z-image-turbo, sdxl,
 * animagine-xl-4.0, qwen-image, x-image-alpha — registry-cased IDs like
 * "flux.1-dev" work too (verified live), so pass the lowercase IDs shown by
 * xbrush_list_models (featureType lora_train). Kept free-form here.
 */
export const LoraTrainSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .describe("Name for the trained LoRA."),
    image_urls: z
      .array(z.string().url())
      .min(1)
      .max(80)
      .describe(
        "Training image URLs (1-80, HTTPS). Upload local files first with xbrush_file_upload. " +
          "The server fetches these and packages them for the training backend."
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Base model to train the LoRA for — see xbrush_list_models entries with featureType " +
          "'lora_train' (e.g. flux.1-dev, qwen-image, z-image-turbo, netayume-v4). NOT validated at " +
          "submit: an unsupported model is accepted and fails during processing (refunded)."
      ),
    trigger_word: z
      .string()
      .optional()
      .describe(
        "Token that activates the LoRA in prompts. Server default: \"TOK\". Include it in prompts " +
          "when generating with the trained LoRA."
      ),
    steps: z
      .number()
      .int()
      .min(500)
      .max(8000)
      .optional()
      .describe(
        "Training steps (500-8000, server default 1000). Billing is 2 credits per 1000 steps."
      ),
  })
  .strict();
