/**
 * XBrush API base URL.
 * Override with XBRUSH_BASE_URL env var.
 */
export const API_BASE_URL =
  process.env.XBRUSH_BASE_URL || "https://api.xbrush.run";

/**
 * Maximum character limit for tool responses.
 */
export const CHARACTER_LIMIT = 25000;

/**
 * Timeout for GET requests (10s).
 */
export const TIMEOUT_GET = 10_000;

/**
 * Timeout for async POST requests — just submitting (30s).
 */
export const TIMEOUT_ASYNC_POST = 30_000;

/**
 * Timeout for uploading a file body (to S3 or /v1/files/upload). 3 minutes.
 * Covers files up to ~60 MB at modest 3 Mbps uplinks.
 */
export const TIMEOUT_UPLOAD = 180_000;

/**
 * Sync-mode timeout table by domain.
 * Use SYNC_TIMEOUTS instead of the deprecated TIMEOUT_SYNC / TIMEOUT_VIDEO_SYNC.
 */
export const SYNC_TIMEOUTS = {
  image: 120_000,        // image generate/edit/upscale/remove-bg
  audio_short: 60_000,   // tts, sound-effect, watermark
  audio_long: 180_000,   // music generate
  video: 600_000,        // video generate/upscale/lip-sync
} as const;

export type SyncTimeoutKey = keyof typeof SYNC_TIMEOUTS;

/**
 * @deprecated use SYNC_TIMEOUTS.image
 */
export const TIMEOUT_SYNC = SYNC_TIMEOUTS.image;

/**
 * @deprecated use SYNC_TIMEOUTS.video
 */
export const TIMEOUT_VIDEO_SYNC = SYNC_TIMEOUTS.video;
