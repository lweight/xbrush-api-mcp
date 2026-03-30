import { z } from "zod";

export const FileUploadSchema = z
  .object({
    file_path: z.string().describe("Absolute path to the local file to upload."),
  })
  .strict();
