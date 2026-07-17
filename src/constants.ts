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
 * Timeout for the synchronous chat completions call (35s).
 *
 * /v1/chat/completions has no async variant; the platform edge gateway cuts
 * the connection at ~30s with an HTML 504 (verified live 2026-07-15). We wait
 * slightly past that so the 504 reaches us and can be mapped to a recovery
 * hint (the request keeps processing server-side — see GATEWAY_TIMEOUT).
 */
export const TIMEOUT_CHAT = 35_000;

/**
 * Timeout for the synchronous voice clone call (35s).
 *
 * /v1/voice/clone is synchronous: the server downloads the audio files and
 * calls the provider before answering (a bad URL fails immediately with 502,
 * no request envelope — verified live 2026-07-17). Same ~30s edge-gateway
 * cutoff as chat applies; failures are recorded (domain "voice", action
 * "clone") and auto-refunded, so a 504 is recoverable via list_requests.
 */
export const TIMEOUT_VOICE_CLONE = 35_000;
