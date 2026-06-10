# Changelog

## 2.3.1 — 2026-06-10

**Breaking changes:** None. Schema and runtime behavior are unchanged — `aspect_ratio` stays a free-form string. This release only expands the field's `description` so the calling model picks from the full set of supported ratios.

A live probe of `gpt-image-2`/`-edit` on `api.xbrush.run` surfaced more aspect ratios than the previous describe text listed. The server validates `aspect_ratio` per resolution and returns the allowed list on an unsupported value (1K/2K reject during processing → `failed` + refund; 4K rejects at submit → `400 VALIDATION_ERROR`). Measured 1K output sizes: 1:1→1024×1024, 16:9→1280×720, 9:16→720×1280, 4:3→1152×864, 3:4→864×1152, 3:2→1248×832, 2:3→832×1248, 21:9→1456×624, 4:5→896×1120.

### Changed

- `xbrush_image_generate` / `xbrush_image_edit` — the `aspect_ratio` description now lists the full `gpt-image-2`/`-edit` support set:
  - **1K / 2K:** `1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1` (10 ratios)
  - **4K:** `16:9, 9:16, 21:9, 1.91:1` (4 ratios, wide only)
  - Previously only `1:1, 16:9, 9:16, 4:3, 3:4` were shown — `3:2, 2:3, 4:5, 21:9, 1.91:1` were missing.
- No client-side whitelist guard was added: the supported set varies by model, resolution and over time, and the server already rejects unsupported values with the allowed list — a hardcoded guard would risk false rejections. Guidance lives in the describe text only.

### Tests

- 295 unit + integration tests pass (the snapshot for the two updated descriptions was refreshed).

## 2.3.0 — 2026-06-03

**Breaking changes:** None. `image_url` stays required; the new field is optional and additive.

Bug report: `gpt-image-2` (and other multi-reference models) couldn't accept two or more reference images through `xbrush_image_edit`. Root cause was an MCP-layer omission — the tool exposed only a single `image_url`, while the XBrush API `/v1/image/edit` accepts `imageUrl` (primary) **plus** `imageUrls` (an array of additional references) and passes them all to the model as `images`. Verified live against `gpt-image-2-edit`: a request with a yellow-circle `imageUrl` + a green-triangle `imageUrls` entry returned a single image containing **both** shapes.

### Added

- `xbrush_image_edit` — new optional `image_urls` (string[], 1–15) input for multi-reference models (`gpt-image-2-edit`, `nano-banana-edit`, ...). The model receives `[image_url, ...image_urls]`. Maps to the API's `imageUrls` field; omit it for single-reference edits.

### Tests

- 290 → 295 unit + integration tests pass.

## 2.2.0 — 2026-05-31

**Breaking changes:** None for megapixel-based models. Resolution-based image models now **reject** `width`/`height` with a guidance error instead of silently dropping them — those inputs never affected these models anyway (verified: a 1280×768 request to `gpt-image-2` returned 1024×1024, and `width`/`height` were absent from the model-facing payload).

Investigation of `gpt-image-2` showed XBrush image models split by `calType`: `perMegapixel`/`perImage` models size output by `width`/`height`, while `byResolution`/`byResolutionAndQuality` models (`gpt-image-2`, `seedream-4.x`, `nano-banana-pro`, `nano-banana-2` and their `-edit` variants) size by a resolution tier + aspect ratio and ignore `width`/`height`.

### Added

- `xbrush_image_generate` / `xbrush_image_edit` — three new optional inputs for resolution-based models:
  - `resolution` (string, e.g. `"1K"`/`"2K"`/`"4K"`) — output resolution tier.
  - `aspect_ratio` (string, e.g. `"1:1"`/`"16:9"`) — output aspect ratio (verified: `aspect_ratio:"16:9"` produced a 1280×720 image).
  - `quality` (`low`/`medium`/`high`) — quality tier for `gpt-image-2`/`-edit` (byResolutionAndQuality). Verified: `quality:"low"` costs 0.0078 credits vs. the server default `high` at 0.2743 (~35× cheaper).

### Changed

- Resolution-based image models (`gpt-image-2`, `seedream-4.0/4.5`, `nano-banana-pro`, `nano-banana-2` and `-edit` variants) now reject `width`/`height` up front with a hint to use `resolution`/`aspect_ratio`. Megapixel-based models (`flux.*`, `z-image-turbo`, `qwen-image-edit`, ...) are unaffected and continue to use `width`/`height`.
- `width`/`height` descriptions updated to note they apply only to megapixel-based models.

### Tests

- 278 → 290 unit + integration tests pass.

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
