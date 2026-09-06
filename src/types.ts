// ── Async response (pending, poll later) ──────────────────────────────

export interface XBrushAsyncResponse {
  requestId: string;
  /**
   * Normally "pending". A few endpoints finish inside the submit call and
   * answer 202 with "completed" (e.g. /v1/tts-wt/generate, /v1/voice/clone) —
   * the output is then only in the request record (GET /v1/requests/{id}).
   */
  status: "pending" | "completed" | string;
  domain: string;
  action: string;
  creditCharged: number;
  /** Seconds. Absent when the server already completed the job inline. */
  estimatedTimeout?: number;
  /** Added 2026-08: relative poll path, e.g. "/v1/requests/req…". */
  pollUrl?: string;
  urls?: { get?: string; [key: string]: unknown };
}

// ── Request detail (GET /v1/requests/{id}) ────────────────────────────

export type XBrushRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "timeout"
  | "aborted";

export interface XBrushRequestCredits {
  charged?: number;
  refunded?: number;
  balance_after?: number;
  [key: string]: unknown;
}

export interface XBrushRequestDetail {
  requestId: string;
  status: XBrushRequestStatus | string;
  domain: string;
  action: string;
  creditCharged: number;
  /** Added 2026-08: charged/refunded/balance_after ledger for the request. */
  credits?: XBrushRequestCredits;
  createdAt?: string;
  completedAt?: string;
  duration?: number;
  /** Server-side normalized payload (worker shape). */
  input?: Record<string, unknown>;
  /** The request body exactly as submitted by the client. */
  originalBody?: Record<string, unknown>;
  output?: XBrushOutput;
  error?: XBrushErrorInfo;
  queueTimesMs?: number[];
  processingTimesMs?: number[];
}

// ── Output (varies by endpoint) ───────────────────────────────────────

export interface XBrushImageDimension {
  width?: number;
  height?: number;
}

export interface XBrushOutput {
  // Image family (generate/edit/outpaint/inpaint/enhance/upscale/remove-bg/layer-split)
  imageUrls?: string[];
  imageDimensions?: XBrushImageDimension[];
  seedOrder?: number;
  /** /v1/image/layer-split: one entry per output image (same index as imageUrls). */
  layers?: Array<{
    name?: string | null;
    zIndex?: number;
    description?: string | null;
    boundingBox?: { absolute?: number[]; normalized?: number[] };
    [key: string]: unknown;
  }>;
  // Video family (generate/edit/extend/retake/upscale/lip-sync) + media jobs
  videoUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  fileSize?: number;
  format?: string;
  nsfwDetected?: boolean;
  // Audio family (tts/tts-wt/music/sound-effect)
  audioUrl?: string;
  voiceId?: string;
  /** /v1/tts-wt/generate: character-level timing arrays (ElevenLabs alignment shape). */
  alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
    [key: string]: unknown;
  } | null;
  normalizedAlignment?: unknown;
  // STT (/v1/stt/transcribe)
  text?: string;
  language?: string | null;
  // Video vision (/v1/video/vision): whisper transcript + per-frame OCR
  transcript?: {
    text?: string;
    language?: string;
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    [key: string]: unknown;
  } | null;
  fullText?: string;
  frames?: unknown[];
  analyzedFrames?: number;
  url?: string;
  metaId?: string;
  found?: boolean;
  confidence?: number;
  tampered?: boolean;
  model?: string;
  voice_id?: string;
  audio_url?: string | null;
  mode?: string;
  // Moderation outputs (/v1/image|video/moderate)
  flagged?: boolean;
  overallScore?: number;
  regionsMasked?: number;
  processedImageUrl?: string;
  processedVideoUrl?: string;
  // Chat outputs (domain "text" / action "chat")
  choices?: XBrushChatChoice[];
  // Voice clone record output ({ success, data: { voice_id, provider, ... } })
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Error ─────────────────────────────────────────────────────────────

export interface XBrushErrorInfo {
  code: string;
  message: string;
  status?: number;
  provider?: unknown;
  [key: string]: unknown;
}

export interface XBrushErrorResponse {
  error: XBrushErrorInfo;
}

// ── Models ────────────────────────────────────────────────────────────

export interface XBrushModelConstraints {
  // Video i2v / extend / retake: duration range in seconds.
  max?: number;
  min?: number;
  step?: number;
  default?: number;
  /** Video/image models with a default resolution tier (e.g. "2K", "720p"). */
  defaultResolution?: string;
  // Text chat: vision capability (image input via content parts).
  vision?: boolean;
  maxImages?: number;
  tokensPerImage?: number;
  baseTokens?: number;
  // Text chat: function calling (tools) support — 2026-07-16.
  functionCalling?: boolean;
  /** Fixed input-token overhead billed per request whenever `tools` is present. */
  toolsFixedTokens?: number;
  /** Whether a forced tool_choice {type:"function"} is obeyed (glm-5.2: false). */
  forcedChoiceHonored?: boolean;
  // Text chat: per-model parameter quirks. false/true flags surface as
  // top-level `warnings[]` (PARAM_DROPPED / PARAM_ADJUSTED) in the response.
  /** false → frequency/presence penalties are ignored. */
  penaltiesHonored?: boolean;
  /** false → temperature/top_p are ignored (Anthropic, gemini-3.5, gpt-5.4). */
  samplingHonored?: boolean;
  /** false → `stop` is ignored (grok-4.3). */
  stopHonored?: boolean;
  /** true → response_format json_object/json_schema is applied (OpenAI, gemini-3.5). */
  structuredOutputHonored?: boolean;
  /** true → image_url.detail actually changes vision token cost (OpenAI). */
  imageDetailHonored?: boolean;
  /** true → model has no reasoning mode (gpt-4o family). */
  reasoningUnsupported?: boolean;
  /** true → reasoning_effort "max" is adjusted to "high". */
  reasoningMaxClampsToHigh?: boolean;
  /** true → reasoning_effort "minimal" is mapped to "low" (gpt-5.4). */
  reasoningMinimalMapsToLow?: boolean;
  /** true → reasoning_effort "none" is mapped to "minimal" (gemini-3.5 cannot disable reasoning). */
  reasoningNoneMapsToMinimal?: boolean;
  /** true → "low"/"medium" are promoted to "high" (glm-5.2). */
  reasoningMidTiersPromoteToHigh?: boolean;
  /** true → tools force reasoning_effort "none" (gpt-5.4). */
  toolsRequireReasoningNone?: boolean;
  /** Lip-sync: maximum clip duration in seconds (e.g. pixverse-lipsync 30). */
  maxDuration?: number;
  minCredits?: number;
  creditPer?: number;
  // STT (whisper-1)
  inputFormats?: string[];
  maxAudioBytes?: number;
  returns?: string[];
  [key: string]: unknown;
}

/** Output-size contract metadata the registry publishes per model (2026-07-30+). */
export interface XBrushModelOutputMeta {
  status?: string;
  modes?: string[];
  axes?: string[];
  requiresInput?: boolean;
  backend?: string;
  measuredAt?: string;
  [key: string]: unknown;
}

export interface XBrushModel {
  id: string;
  modelType: string;
  name: string;
  category: string;
  featureType: string;
  calType: string;
  vendor?: string;
  creditInfo: {
    creditValue?: number;
    // Flat (`{ "1K": 0.1 }`) or nested (`{ "720p": { audio: 0.5, noAudio: 0.2 } }`)
    // — the server uses both shapes depending on calType.
    creditConfig?: Record<string, number | boolean | Record<string, number>>;
  };
  constraints?: XBrushModelConstraints;
  output?: XBrushModelOutputMeta;
}

export interface XBrushModelsResponse {
  models: XBrushModel[];
}

// ── Chat completions (POST /v1/chat/completions — sync only) ─────────
// OpenAI-compatible response. The `id` doubles as an XBrush request id
// (domain "text" / action "chat" in /v1/requests).

export interface XBrushChatToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    /** JSON-encoded arguments string (OpenAI convention — not an object). */
    arguments?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface XBrushChatMessage {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  /** Present (with finish_reason "tool_calls") when the model requests function calls. */
  tool_calls?: XBrushChatToolCall[] | null;
  [key: string]: unknown;
}

/** Non-fatal request warnings, e.g. PARAM_NOT_HONORED when glm-5.2 ignores a forced tool_choice. */
export interface XBrushChatWarning {
  code?: string;
  param?: string;
  message?: string;
  [key: string]: unknown;
}

export interface XBrushChatChoice {
  index?: number;
  finish_reason?: string | null;
  message?: XBrushChatMessage;
  [key: string]: unknown;
}

export interface XBrushChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Credits billed for this call (perToken pricing). */
  credits_charged?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
    [key: string]: unknown;
  } | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface XBrushChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: XBrushChatChoice[];
  usage?: XBrushChatUsage;
  warnings?: XBrushChatWarning[] | null;
  [key: string]: unknown;
}

// ── Request list ──────────────────────────────────────────────────────

export interface XBrushRequestListResponse {
  data: XBrushRequestDetail[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Health ─────────────────────────────────────────────────────────────

export interface XBrushHealthResponse {
  status: string;
  timestamp?: string;
}

// ── File presign ──────────────────────────────────────────────────────

export interface XBrushPresignResponse {
  uploadUrl: string;
  fields: Record<string, string>;
  fileKey: string;
  cdnUrl: string;
  expiresIn: number;
}

// ── Voice list (GET /v1/voice/list) ───────────────────────────────────

export interface XBrushVoice {
  voice_id: string;
  name?: string;
  category?: string;
  description?: string | null;
  preview_url?: string | null;
  labels?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface XBrushVoiceListResponse {
  success?: boolean;
  provider?: string;
  model?: string;
  data?: {
    provider?: string;
    voices?: XBrushVoice[];
    /** e.g. seed-icl-2.0: "BytePlus Seed voices are tracked in the xbrush ledger; vendor listing is not supported." */
    note?: string;
    pagination?: {
      page_size?: number;
      next_page_token?: string | null;
      has_more?: boolean;
      returned_count?: number;
      category?: string | null;
    };
  };
}

// ── Voice detail (GET /v1/voice/{voiceId}) — 2026-09 ──────────────────

export interface XBrushVoiceDetail {
  voiceId: string;
  name?: string | null;
  model?: string | null;
  provider?: string | null;
  description?: string | null;
  demoAudioUrl?: string | null;
  status?: number | string | null;
  retrainable?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// ── Synchronous utility endpoints (2026-08/09) ────────────────────────

/** POST /v1/image/vision — OCR. bbox is [x0, y0, x1, y1] normalized 0-1. */
export interface XBrushImageVisionResponse {
  requestId?: string;
  items?: Array<{ text?: string; bbox?: number[]; confidence?: number | null }>;
  fullText?: string;
  imageWidth?: number;
  imageHeight?: number;
  locale?: string | null;
  analyzedFrames?: number;
  creditsCharged?: number;
  [key: string]: unknown;
}

/** POST /v1/image/segment-detect — open-vocabulary box detection (pixel coords). */
export interface XBrushSegmentDetectResponse {
  requestId?: string;
  detected?: boolean;
  count?: number;
  imageWidth?: number;
  imageHeight?: number;
  boxes?: Array<{ x?: number; y?: number; width?: number; height?: number; score?: number }>;
  [key: string]: unknown;
}

export interface XBrushProductInfo {
  brand?: string;
  brandNameEn?: string;
  brandId?: string;
  brandDomain?: string;
  productName?: string;
  modelCode?: string;
  categoryLabel?: string;
  confidence?: number;
  releaseYear?: string;
  priceEstimate?: string;
  keySpecs?: string[];
  unconfirmed?: string[];
  [key: string]: unknown;
}

/** POST /v1/image/product-lookup — brand/product identification. */
export interface XBrushProductLookupResponse {
  requestId?: string;
  productPresent?: boolean;
  brandPresent?: boolean;
  brandStatus?: string;
  brandStatusReason?: string;
  brand?: { brandId?: string; brandNameEn?: string; brandDomain?: string; [key: string]: unknown };
  product?: XBrushProductInfo;
  products?: XBrushProductInfo[];
  noProductReason?: string;
  mode?: string;
  grounded?: boolean;
  sources?: unknown[];
  searchQueries?: string[];
  visionEvidence?: {
    entities?: Array<{ name?: string; score?: number }>;
    logos?: unknown[];
    [key: string]: unknown;
  };
  creditsCharged?: number;
  [key: string]: unknown;
}

/** GET /v1/media/info?url= — ffprobe/sharp style metadata (no credits). */
export interface XBrushMediaInfoResponse {
  // video
  width?: number;
  height?: number;
  fps?: number;
  durationInSeconds?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  sizeBytes?: number;
  videoCodec?: string;
  // image
  kind?: string;
  format?: string;
  frames?: number;
  hasAlpha?: boolean;
  /** Present instead of metadata when the URL cannot be read (HTTP 200 nonetheless). */
  error?: string;
  url?: string;
  [key: string]: unknown;
}
