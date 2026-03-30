/**
 * File upload service: presign + S3 upload.
 */

import { readFileSync, statSync } from "fs";
import { basename, extname } from "path";
import { makeApiRequest } from "./xbrush-client.js";
import { TIMEOUT_ASYNC_POST } from "../constants.js";
import type { XBrushPresignResponse } from "../types.js";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export async function uploadFile(filePath: string): Promise<{ cdnUrl: string }> {
  const fileName = basename(filePath);
  const mimeType = getMimeType(filePath);
  const fileSize = statSync(filePath).size;
  const fileBuffer = readFileSync(filePath);

  // Step 1: Get presigned upload URL
  const presign = await makeApiRequest<XBrushPresignResponse>({
    method: "POST",
    url: "/v1/files/presign",
    data: { fileName, mimeType, fileSize },
    timeout: TIMEOUT_ASYNC_POST,
  });

  // Step 2: Upload to S3 via presigned POST
  const formData = new FormData();
  for (const [key, value] of Object.entries(presign.fields)) {
    formData.append(key, value);
  }
  formData.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);

  // Use native fetch for S3 upload (no XBrush API key needed, requires Node 18+)
  const uploadResponse = await fetch(presign.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  return { cdnUrl: presign.cdnUrl };
}
