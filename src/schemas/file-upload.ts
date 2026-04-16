import { z } from "zod";

export const UPLOAD_STRATEGIES = ["auto", "direct", "presign"] as const;
export type UploadStrategy = (typeof UPLOAD_STRATEGIES)[number];

/**
 * Auto strategy picks `direct` for files < DIRECT_UPLOAD_THRESHOLD bytes and
 * `presign` otherwise. Tune in src/services/file-upload.ts.
 */
export const FileUploadSchema = z
  .object({
    file_path: z.string().describe("Absolute path to the local file to upload."),
    strategy: z
      .enum(UPLOAD_STRATEGIES)
      .optional()
      .describe(
        "Upload strategy: 'auto' (default) picks by file size; 'direct' uses /v1/files/upload; 'presign' uses /v1/files/presign + S3."
      ),
  })
  .strict();
