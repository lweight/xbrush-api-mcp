# Changelog

## 2.1.0 — 2026-05-26

**Breaking changes:** None. All existing tool signatures and response formats are unchanged.

Survey of the live `api.xbrush.run` (now 67 models across image/video/audio/**utility**) surfaced
new endpoints and one display bug. This release adds the new low-risk tools and fixes the bug.

### Added — 4 new tools (16 → 20)

- `xbrush_video_extend` — extend an existing video by 1–20 seconds (e.g. `ltx-2.3-extend`, `pixverse-v6-extend`). Async.
- `xbrush_video_retake` — regenerate a video variation up to a timestamp (`ltx-2.3-retake`). Async.
- `xbrush_content_moderate` — NSFW moderation + masking for an image **or** video (routes to `/v1/image/moderate` or `/v1/video/moderate`). Async. Result includes a `flagged` verdict, an overall score, and a masked copy.
- `xbrush_list_voices` — list TTS voices (`GET /v1/voice/list`), optionally filtered by `model`. Returns a compact id/name/category/preview summary for picking a `voice_id`.

### Fixed

- **`xbrush_list_models` credit rendering** — nested `creditConfig` shapes (resolution tiers, audio/noAudio, quality tiers used by veo3/kling-v3/seedream/nano-banana/gpt-image-2, etc.) rendered as `[object Object]`. Now expanded, e.g. `720p=audio 0.52/noAudio 0.26`.
- `xbrush_list_models` `category` filter now accepts `"utility"` (new top-level category) in addition to image/video/audio.
- `README.md` — corrected stale "sync default" documentation left over from the 2.0.0 async-only migration; tool list updated to 20.
- `xbrush_get_request` now surfaces moderation results (`flagged`, moderation score) and falls back to `processedVideoUrl` when present.

### Changed

- `xbrush_image_edit` description clarifies that outpaint is performed by selecting an outpaint model (`flux-outpaint`, `qwen-outpaint`); `/v1/image/outpaint` does not exist. Stale `qwen-image-edit-re` example corrected to `qwen-image-edit`.

### Notes

- Model IDs remain `z.string()` — the 67 current models (nano-banana, seedream-4.5, veo3.1, kling-v3, etc.) work without a client upgrade.
- `voice_clone` (`POST /v1/voice/clone`) and `lora_train` (`POST /v1/lora/train`) endpoints exist but are deferred to a later release pending consumption-side specs.

### Tests

- 243 → 278 unit + integration tests pass.

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
