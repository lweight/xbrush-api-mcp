import { z } from "zod";

export const GetRequestSchema = z
  .object({
    request_id: z.string().min(24).describe("Request ID (starts with 'req', 24 characters)."),
  })
  .strict();

/** Server enum for the `status` filter (uppercase on the wire; we accept either case). */
export const REQUEST_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "TIMEOUT",
  "ABORTED",
] as const;

export const ListRequestsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional().describe("Number of requests to return (1-100). Default: 20."),
    cursor: z.string().optional().describe("Pagination cursor from a previous response."),
    domain: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by domain: image, video, tts, tts-wt, music, sound-effect, stt, voice, lora, text (chat), media (ffmpeg/image/graph jobs)."),
    action: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by action, e.g. generate, edit, outpaint, inpaint, enhance, layer-split, upscale, chat, clone, train, transcribe, video_edit, video_vision, ffmpeg, image, graph."),
    status: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.toUpperCase())
      .pipe(z.enum(REQUEST_STATUSES))
      .optional()
      .describe("Filter by status: pending, processing, completed, failed, timeout, aborted (case-insensitive)."),
  })
  .strict();

export const CheckHealthSchema = z.object({}).strict();
