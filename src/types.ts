// ── Sync response (completed immediately) ─────────────────────────────

export interface XBrushSyncResponse {
  requestId: string;
  status: "completed";
  domain: string;
  action: string;
  creditCharged: number;
  output: XBrushOutput;
  completedAt: string;
  syncCompleted: true;
}

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
  creditInfo: {
    creditValue?: number;
    creditConfig?: Record<string, number>;
  };
  constraints?: {
    max?: number;
    min?: number;
    step?: number;
    default?: number;
    [key: string]: unknown;
  };
}

export interface XBrushModelsResponse {
  models: XBrushModel[];
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
