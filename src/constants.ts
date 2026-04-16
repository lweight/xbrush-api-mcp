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
