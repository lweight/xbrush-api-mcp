/**
 * File upload tool
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileUploadSchema } from "../schemas/file-upload.js";
import { buildToolResult, handleToolError } from "../services/xbrush-client.js";
import { uploadFile } from "../services/file-upload.js";

export function registerFileUploadTools(server: McpServer): void {
  server.registerTool(
    "xbrush_file_upload",
    {
      title: "Upload File",
      description: [
        "Upload a local file to XBrush CDN and get a URL.",
        "Use the returned CDN URL as image_url or video_url in other XBrush tools.",
        "",
        "Supported formats: PNG, JPG, GIF, WebP, MP4, WebM, MP3, WAV.",
        "",
        "Args:",
        "  file_path (string, required): Absolute path to the local file.",
        "  strategy (string, optional): 'auto' (default), 'direct', or 'presign'.",
        "    - auto: small files (< 10MB) go via direct upload, larger via presigned S3.",
        "    - direct: POST /v1/files/upload (multipart).",
        "    - presign: presigned URL + S3 upload (handles large files).",
      ].join("\n"),
      inputSchema: FileUploadSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const { cdnUrl, strategy } = await uploadFile(
          args.file_path,
          args.strategy ?? "auto"
        );

        const lines = [
          "File uploaded successfully.",
          "",
          `- **CDN URL**: ${cdnUrl}`,
          `- **Strategy**: ${strategy}`,
          "",
          "Use this URL as `image_url` or `video_url` in other XBrush tools.",
        ];

        return buildToolResult(lines.join("\n"));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
