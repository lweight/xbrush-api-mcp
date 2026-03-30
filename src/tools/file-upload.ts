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
        const { cdnUrl } = await uploadFile(args.file_path);

        const lines = [
          "File uploaded successfully.",
          "",
          `- **CDN URL**: ${cdnUrl}`,
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
