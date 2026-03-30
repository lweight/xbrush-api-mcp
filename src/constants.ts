/**
 * XBrush API base URL.
 * Override with XBRUSH_BASE_URL env var for dev environment.
 */
export const API_BASE_URL =
  process.env.XBRUSH_BASE_URL || "https://api.xbrush.run";

/**
 * Maximum character limit for tool responses.
 */
export const CHARACTER_LIMIT = 25000;

/**
 * Timeout for sync image generation (120s).
 */
export const TIMEOUT_SYNC = 120_000;

/**
 * Timeout for async POST requests — just submitting (30s).
 */
export const TIMEOUT_ASYNC_POST = 30_000;

/**
 * Timeout for GET requests (10s).
 */
export const TIMEOUT_GET = 10_000;
