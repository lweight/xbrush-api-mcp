# Changelog

## 2.0.0 — 2026-04-16

**Breaking changes:** All generation tools now use async-only flow. The `/sync` endpoints are no longer called.

### Why

The XBrush API's `/sync` endpoints have a dual-shape contract: fast models return `{status: "completed", output: {...}}` immediately, but slow models (e.g. `x-image-alpha`) return HTTP 202 + `{status: "pending", syncCompleted: false, output: undefined}` after their sync timeout — effectively async-shaped. The previous client code unconditionally read `r.output.imageUrls`, producing `Cannot read properties of undefined` on the slow-model path. MCP stdio tools also can't safely block for minutes.

### Changed

- All 11 generation tools now POST to async endpoints only and return a `request_id`. Callers must poll with `xbrush_get_request`.
- `sync` parameter removed from all schemas (image/video/audio/lip-sync/watermark). Sending it now fails Zod strict validation.
- `image_remove_bg`, `image_generate`, `watermark_add` — previously sync-default — now async like the rest.

### Removed

- `XBrushSyncResponse` type, `formatSyncResult`, `formatVideoSyncResult`, `formatLipSyncResult`.
- `submitSyncOrAsync` helper → replaced by `submitAsync`.
- `SYNC_TIMEOUTS` constant table and the deprecated `TIMEOUT_SYNC` / `TIMEOUT_VIDEO_SYNC` aliases.

### Migration

```js
// v1.x
await call("xbrush_image_generate", { model, prompt, sync: true });
// → returns "Image generation completed.\n- Images: https://..."

// v2.0
const r = await call("xbrush_image_generate", { model, prompt });
// → returns "Image generation submitted (async).\n- Request ID: req..."
const id = parseRequestId(r);
const done = await pollUntilCompleted(id, "xbrush_get_request");
```

### Tests

- 243/243 unit + integration tests pass.
- Real-API E2E: 28/28 covering all 16 tools.

## 1.2.1 — 2026-04-16

Same code as 2.0.0. Published into the 1.2.x line so that `^1.x` and `~1.2.x` consumers receive the async-only fix automatically. See 2.0.0 above for full details, breaking changes, and migration notes.

## 1.2.0 — 2026-04-16 (unreleased)

**Breaking changes:** None. Existing tool signatures and response formats are unchanged.

### Added — 5 new tools (11 → 16)

- `xbrush_tts_generate` — text-to-speech (e.g. minimax). Async default.
- `xbrush_music_generate` — music generation from text (e.g. lyria2). Async default.
- `xbrush_sound_effect_generate` — short sound effects from text prompts. Async default.
- `xbrush_video_lip_sync` — lip-sync a face video to an audio track (e.g. pixverse). Async default.
- `xbrush_watermark_add` — overlay a text or image watermark on image/video. Sync default.

### Extended — existing tools

- `xbrush_image_edit` accepts a new optional `mode` parameter (`"inpaint"` | `"outpaint"`). Defaults to server-side behavior (inpaint).
- `xbrush_file_upload` accepts a new optional `strategy` parameter (`"auto"` | `"direct"` | `"presign"`). `auto` (default) picks direct for files under 10MB, presign otherwise. Adds support for the `/v1/files/upload` endpoint.
- `xbrush_list_models` `category` filter now accepts `"music"`, `"sound-effect"`, and `"lip-sync"` in addition to `"image"`, `"video"`, `"audio"`.

### Added — operations

- `XBRUSH_DISABLED_TOOLS` environment variable — comma-separated tool names to skip registration. Safety valve for selectively turning off a tool while waiting for a patch release. Example: `XBRUSH_DISABLED_TOOLS=xbrush_music_generate,xbrush_watermark_add`.
- `prepublishOnly` now runs `npm run build && npm test`. Prevents publishing with failing tests.

### Docs

- Corrected API key URL references to `https://xbrush.run/api-keys` (previously pointed at nonexistent xbrush.ai Dashboard page). Affected: README, CLAUDE.md, `.env.example`, and the `MISSING_API_KEY` / `INVALID_API_KEY` error suggestions.
- Removed `api-dev.xbrush.run` example from `.env.example` — default production base URL is the only officially documented target.

### Internal

- Extracted `submitSyncOrAsync` dispatch helper (`src/services/dispatch.ts`). Removes sync/async branching boilerplate across image, video, audio, lip-sync, and watermark tools.
- Extracted generic `formatSyncResult` / `formatAsyncResult` formatters.
- Introduced `SYNC_TIMEOUTS` table (image/audio_short/audio_long/video). Legacy `TIMEOUT_SYNC` / `TIMEOUT_VIDEO_SYNC` kept as `@deprecated` aliases.
- Test suite expanded: 143 → 241 cases across 20 files.

## 1.1.0 — earlier

- Added video tools: `xbrush_video_generate`, `xbrush_video_upscale`.
- Added `sync` parameter to `image_generate`, `image_edit`, `image_upscale`, `video_generate`, `video_upscale` for per-call mode switching.
- Introduced 4-tier Vitest test structure (143 cases).

## 1.0.1 — earlier

- Fixed repository URL prefix in `package.json`.

## 1.0.0 — earlier

- Initial release: 9 tools (image generate/edit/upscale/remove_bg, list_models, get_request, list_requests, file_upload, check_health).
