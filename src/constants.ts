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
 * no request envelope — verified live 2026-07-17; a successful clone answers
 * in ~6-10s with status "completed" — verified 2026-09-06). Same ~30s
 * edge-gateway cutoff as chat applies; the attempt is recorded (domain
 * "voice", action "clone") and failures auto-refund, so a 504 is recoverable
 * via list_requests.
 */
export const TIMEOUT_VOICE_CLONE = 35_000;

/**
 * Timeout for the small synchronous utility endpoints (35s): image OCR
 * (/v1/image/vision), open-vocabulary detection (/v1/image/segment-detect),
 * product lookup (/v1/image/product-lookup) and media probing
 * (GET /v1/media/info). They answer inline in ~1-7s (measured 2026-09-06);
 * the 35s ceiling exists only so a gateway 504 is still received and mapped.
 */
export const TIMEOUT_SYNC_UTILITY = 35_000;
