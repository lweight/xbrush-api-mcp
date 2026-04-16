/**
 * File upload service.
 * Supports two strategies:
 *   - presign: request presigned URL, upload directly to S3 (works for any size)
 *   - direct : send multipart to /v1/files/upload (convenient for small files)
 *
 * The 'auto' strategy picks 'direct' for files under DIRECT_UPLOAD_THRESHOLD
 * bytes, 'presign' otherwise.
 */

import { readFileSync, statSync } from "fs";
import { basename, extname } from "path";
import { API_BASE_URL, TIMEOUT_ASYNC_POST, TIMEOUT_UPLOAD } from "../constants.js";
import { getApiKey, makeApiRequest } from "./xbrush-client.js";
import type { XBrushPresignResponse } from "../types.js";
import type { UploadStrategy } from "../schemas/file-upload.js";

/** Files smaller than this use direct upload when strategy = 'auto'. */
export const DIRECT_UPLOAD_THRESHOLD = 10 * 1024 * 1024; // 10 MB

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

export interface UploadResult {
  cdnUrl: string;
  strategy: "direct" | "presign";
}

export async function uploadFile(
  filePath: string,
  strategy: UploadStrategy = "auto"
): Promise<UploadResult> {
  const fileName = basename(filePath);
  const mimeType = getMimeType(filePath);
  const fileSize = statSync(filePath).size;
  const fileBuffer = readFileSync(filePath);

  const resolved: "direct" | "presign" =
    strategy === "auto"
      ? fileSize < DIRECT_UPLOAD_THRESHOLD
        ? "direct"
        : "presign"
      : strategy;

  if (resolved === "direct") {
    const cdnUrl = await uploadDirect(fileName, mimeType, fileBuffer);
    return { cdnUrl, strategy: "direct" };
  }

  const cdnUrl = await uploadViaPresign(fileName, mimeType, fileSize, fileBuffer);
  return { cdnUrl, strategy: "presign" };
}

// ── Presign + S3 flow ─────────────────────────────────────────────────

async function uploadViaPresign(
  fileName: string,
  mimeType: string,
  fileSize: number,
  fileBuffer: Buffer
): Promise<string> {
  const presign = await makeApiRequest<XBrushPresignResponse>({
    method: "POST",
    url: "/v1/files/presign",
    data: { fileName, mimeType, fileSize },
    timeout: TIMEOUT_ASYNC_POST,
  });

  const formData = new FormData();
  for (const [key, value] of Object.entries(presign.fields)) {
    formData.append(key, value);
  }
  formData.append(
    "file",
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName
  );

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(TIMEOUT_UPLOAD),
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
    );
  }

  return presign.cdnUrl;
}

// ── Direct multipart flow (/v1/files/upload) ──────────────────────────

interface DirectUploadResponse {
  cdnUrl?: string;
  url?: string;
  [key: string]: unknown;
}

async function uploadDirect(
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<string> {
  const apiKey = getApiKey();

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName
  );

  const response = await fetch(`${API_BASE_URL}/v1/files/upload`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: formData,
    signal: AbortSignal.timeout(TIMEOUT_UPLOAD),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Direct upload failed: ${response.status} ${response.statusText} ${text}`
    );
  }

  const data = (await response.json()) as DirectUploadResponse;
  const cdnUrl = data.cdnUrl ?? data.url;
  if (!cdnUrl) {
    throw new Error("Direct upload response missing cdnUrl/url");
  }
  return cdnUrl;
}
