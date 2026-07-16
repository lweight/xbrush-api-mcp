// ── Async response (pending, poll later) ──────────────────────────────

export interface XBrushAsyncResponse {
  requestId: string;
  status: "pending";
  domain: string;
  action: string;
  creditCharged: number;
  estimatedTimeout: number;
}

// ── Request detail (GET /v1/requests/{id}) ────────────────────────────

export interface XBrushRequestDetail {
  requestId: string;
  status: "pending" | "processing" | "completed" | "failed";
  domain: string;
  action: string;
  creditCharged: number;
  createdAt?: string;
  completedAt?: string;
  duration?: number;
  input?: Record<string, unknown>;
  output?: XBrushOutput;
  error?: XBrushErrorInfo;
}

// ── Output (varies by endpoint) ───────────────────────────────────────

export interface XBrushOutput {
  imageUrls?: string[];
  videoUrl?: string;
  audioUrl?: string;
  url?: string;
  metaId?: string;
  found?: boolean;
  confidence?: number;
  tampered?: boolean;
  seedOrder?: number;
  model?: string;
  voice_id?: string;
  audio_url?: string | null;
  mode?: string;
  duration?: number;
  // Moderation outputs (/v1/image|video/moderate)
  flagged?: boolean;
  overallScore?: number;
  regionsMasked?: number;
  processedImageUrl?: string;
  processedVideoUrl?: string;
  // Chat outputs (domain "text" / action "chat")
  choices?: XBrushChatChoice[];
  [key: string]: unknown;
}

// ── Error ─────────────────────────────────────────────────────────────

export interface XBrushErrorInfo {
  code: string;
  message: string;
  status?: number;
}

export interface XBrushErrorResponse {
  error: XBrushErrorInfo;
}

// ── Models ────────────────────────────────────────────────────────────

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
    creditConfig?: Record<string, number | Record<string, number>>;
  };
  constraints?: {
    // Video i2v: duration range in seconds.
    max?: number;
    min?: number;
    step?: number;
    default?: number;
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
    [key: string]: unknown;
  };
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
    pagination?: {
      page_size?: number;
      next_page_token?: string | null;
      has_more?: boolean;
      returned_count?: number;
      category?: string | null;
    };
  };
}
