# Changelog

## 2.12.0 — 2026-09-06

**Breaking changes:** None — every existing tool keeps its inputs. Fields the server stopped recognizing over the summer (`xbrush_video_generate.end_image_url` / `prompt_relevance`, `xbrush_image_edit.mode`, `xbrush_tts_generate.language`) are still accepted but marked deprecated (the server silently ignores them). Two limits moved to match the server: `xbrush_image_edit.image_urls` now allows at most 9 references (was 15), and `xbrush_image_upscale.upscale_factor` is a number 1.5-4 (was integer 2-4).

Full re-survey of `api.xbrush.run` (model catalog 128 entries; every endpoint's field inventory reverse-engineered from validation errors and confirmed with live calls). The platform grew a lot since July: 14 new endpoints, 9 new chat models, structured output, request filters, webhooks, and a whole media-processing family. This release exposes all of it — **23 → 37 tools**.

### Added

- **Image (7 new tools)**
  - `xbrush_image_outpaint` — dedicated `/v1/image/outpaint` (previously 404): `canvas_width`/`canvas_height` (64-4096, required), `scale` (0.05-4), `prompt`, `resolution` (1K/2K/4K). Output is exactly the canvas size (verified 1792×1408); charged 0 credits in testing.
  - `xbrush_image_inpaint` — `/v1/image/inpaint`: prompt-less content-aware fill/removal. `mask` accepts an https URL, a `data:image/png;base64` URL, or a raw base64 PNG (all three verified live); plus `resolution`, `num_inference_steps` (1-100), `seed`, `expand` (0-128).
  - `xbrush_image_enhance` — `/v1/image/enhance` (`mode`, `n` 1-4, `seed`). Both live test jobs timed out on the GPU worker after 600s without charge, so the tool description flags it as experimental.
  - `xbrush_image_layer_split` — `/v1/image/layer-split` (seedream-5.0-pro-layerize 0.55 credits @1K / 1.1 @2K, or qwen-image-layered): returns `layers[] {name, zIndex, boundingBox, description}` aligned with `imageUrls[]` (verified on a poster: background / product / text layers). Plain photos may be rejected by the vendor (refunded).
  - `xbrush_image_segment_detect` — **synchronous** open-vocabulary detection (`/v1/image/segment-detect`, 0.01 credits): pixel boxes + scores for a text prompt (1-120 chars).
  - `xbrush_image_vision` — **synchronous** OCR (`/v1/image/vision`, 0.003 credits): items with normalized bboxes, full text, locale; `mode` text/document; accepts data: URLs.
  - `xbrush_image_product_lookup` — **synchronous** brand/product identification (`/v1/image/product-lookup`, flat 0.05 credits): product name/category/specs, brand + domain, vision entities; `language` en/ko/ja/zh, `mode` fast/grounded.
  - `xbrush_image_generate` — new fields `idea` (non-English prompt, server-translated), `cfg` (0-20), `guidance_scale` (0-50), `scheduler`, `sampler`, `background` (auto/opaque/transparent), `trigger_word`.
  - `xbrush_image_edit` — new fields `idea`, `negative_prompt`, `background`, `guidance_scale`, `sampler`.
  - `xbrush_image_upscale` — `target_height` (256-8192; verified 1408px → 2048×2048) as an alternative to the factor.
- **Video (2 new tools)**
  - `xbrush_video_edit` — `/v1/video/edit` with gemini-omni-1.1-flash (0.143 credits/sec): prompt-driven whole-video transformation; `audio` source/model/none. Verified: 5s clip → 0.858 credits, ~2 min.
  - `xbrush_video_vision` — `/v1/video/vision` (0.003 credits/sec): whisper transcript with timed segments + on-screen text of sampled frames.
  - `xbrush_video_generate` — new fields `negative_prompt`, `seed`, `audio_url`, `width`/`height` (with `aspect_ratio:"custom"`), `fps` (24/25/48/50), `steps`, `acceleration` (none/regular/high); `duration` up to 30s (seedance-2.5 / wan-3.0); `resolution` gains `2k`. Validation is no longer model-aware (one superset for all models). 12 new video models in the catalog (seedance-2.5, kling-v3-omni, kling-o1/o3/o3-ref, minimax-h3/-ref, wan-3.0-video ×4, gemini-omni-1.1-flash, ltx-2.3, veo3.1/-fast).
  - `xbrush_video_extend` — `prompt`/`idea`, `negative_prompt`, `start_time`, `resolution` (360p-1080p), `generate_audio`, `style` (anime/3d_animation/clay/comic/cyberpunk), `seed`; new model gemini-omni-1.1-flash.
  - `xbrush_video_retake` — `start_time` (0-20), `prompt`/`idea`; `end_time` capped at 40.
- **Audio (1 new tool)**
  - `xbrush_stt_transcribe` — `/v1/stt/transcribe` (whisper-1, 0.00013 credits/sec, async). **WAV only** (the server checks the RIFF header; mp3 is rejected at submit) — convert with `xbrush_media_ffmpeg` extract-audio → wav. Output `{text, language, duration}` verified on a 28s clip.
  - `xbrush_tts_generate` — `with_timestamps:true` routes to the new `/v1/tts-wt/generate` and returns character-level alignment arrays (subtitles/karaoke); new knobs `pitch` (-12..12), `style` (0-1), `emotion` (9 MiniMax presets), `output_format`. New TTS models seed-tts-2.0 / seed-icl-2.0 (0.039 credits/1k chars) and speech-2.8-turbo; the tool explains which models need which `voice_id` (server messages: MiniMax → moss_audio_*, seed-icl-2.0 → cloned xbseed_*, seed-tts-2.0 → preset name).
  - `xbrush_music_generate` — `duration` range is now 5-300 and `image_url` (image-conditioned music) is accepted; lyria3 verified (~30s track for 0.052 credits).
- **Media utilities (4 new tools, category `utility`)**
  - `xbrush_media_ffmpeg` — `/v1/media/ffmpeg`: 1-10 inputs → 1-20 ops (trim, concat, transcode, scale, extract-audio, thumbnail, watermark, gif, speed, crop, rotate, fade, subtitle, merge-audio, still) → output format/fps/quality. Billed per output second (h264 0.0004 credits, floor 0.002); a 2s trim cost 0.002 and took ~2s.
  - `xbrush_media_image_process` — `/v1/media/image`: 37 deterministic ops (resize/crop/pad/composite/stack/text/adjust/blur/… /straighten_document) with server-validated ranges; ~0.0006 credits for a resize.
  - `xbrush_media_graph` — `/v1/media/graph`: ffmpeg filter-graph IR with ~60 ops (overlay, xfade, chromakey, lut3d, drawtext, zoompan, amix, loudnorm, set_audio, …). Ports and per-op params were enumerated from the server's error messages and are summarized in the tool description; `GET /v1/media/fonts` (206 fonts incl. Korean) and `GET /v1/media/luts` back drawtext/lut3d.
  - `xbrush_media_info` — `GET /v1/media/info?url=` (free, synchronous): video/image metadata probe.
- **Chat**
  - `response_format` — `{type:"json_object"}` or `{type:"json_schema", json_schema:{name, schema, strict}}`; honored on models with `constraints.structuredOutputHonored` (openai/*, gemini-3.5-flash-lite), ignored elsewhere with a `PARAM_DROPPED` warning (verified on gpt-4o-mini, seed-2.0-mini, glm-5.2).
  - `reasoning_effort` gains `low` and `medium` (server enum is now none/minimal/low/medium/high/max).
  - 9 new models documented: bytedance/seed-2.1-turbo, google/gemini-3.5-flash-lite, anthropic/claude-sonnet-5, anthropic/claude-opus-5, deepseek/deepseek-v4-flash, openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5.4, xai/grok-4.3 (all verified live). `xbrush_list_models` renders the new per-model quirk flags (structured output, temperature/top_p ignored, stop ignored, no reasoning, reasoning tier remaps, tools forcing reasoning none, image detail honored).
- **Voices**
  - `xbrush_voice_clone` — verified end to end (MiniMax and Seed): billing is a flat **2 credits** (eleven / speech-2.8-hd / speech-2.6-hd) or **2.6 credits** (seed-icl-2.0) — no longer 50; the tool now fetches the request record after the synchronous 202 and prints the `voice_id`, provider, demo audio and remaining retrain runs. New `model` value `seed-icl-2.0` and `voice_id` (xbseed_*) to retrain an existing Seed voice.
  - `xbrush_list_voices` — `voice_id` argument returns one voice's detail (`GET /v1/voice/{voiceId}`); TTS model ids (eleven-v3, speech-2.8-turbo) are mapped onto the server's provider enum (eleven / speech-2.8-hd / speech-2.6-hd / seed-icl-2.0) instead of 400ing.
- **Requests**
  - `xbrush_list_requests` — `domain`, `action`, `status` (pending/processing/completed/failed/timeout/aborted) filters; rows show `credits.refunded` and `createdAt`.
  - `xbrush_get_request` — renders every new output shape (layer-split layers, media job thumbnails/durations, STT text, video-vision transcript segments, tts-wt alignment, voice-clone data) and keeps unknown keys as compact JSON; shows refunds and the new timeout/aborted statuses.
- `xbrush_content_moderate` — `threshold` (0-1) and image `mode` (mosaic). `xbrush_watermark_add` — `strength` (low/medium/high).
- `xbrush_file_upload` — MIME map extended to the server's presign allowlist (svg, avif, heic, mov, mkv, avi, ts, m4a, aac, flac, ogg, txt, vtt, srt, safetensors, m3u8, zip).
- `XBrushModel` types — `output` contract metadata and the new `constraints` keys; `XBrushRequestDetail` — `credits`, `originalBody`, timing arrays; `XBrushAsyncResponse` — `pollUrl`, inline `completed`.

### Changed

- `xbrush_lora_train` — the worker's supported base list is now FLUX.1-dev, z-image-turbo, sdxl, animagine-xl-4.0, netayume-v4, anima, qwen-image, x-image-alpha (catalog: flux.1-dev, z-image-turbo, qwen-image, netayume-v4, anima-base).
- `xbrush_video_upscale` — `model` is server-validated against realesrgan / seedvr.
- Tool descriptions refreshed with measured prices and the current model lineups throughout.

### Not exposed (documented in CLAUDE.md)

- `webhookUrl` (accepted by every async endpoint) — no receiver in a stdio MCP context.
- `POST /v1/stream/chat/completions` (SSE) and the `/sync` variants.
- `DELETE /v1/voice/{voiceId}` — answers VOICE_NOT_FOUND for voices that GET returns (server bug as of 2026-09-06).
- `DELETE /v1/requests/{id}` — returns `{success:true}` but the record remains readable.

### Tests

- 411 → 524 unit + integration tests (new schema/tool files for media and the 2026-09 survey; refreshed snapshots for image_generate, image_edit, tts_generate, music_generate, chat).

## 2.9.0 — 2026-07-15

**Breaking changes:** None. Plain-string `content` keeps working; this release adds vision content parts and `stop` on top. One tightening: empty-string message content is now rejected client-side, matching the server ("content must not be empty").

The XBrush LLM lineup gained its first **vision-capable chat model** — `bytedance/seed-2.0-mini` (ByteDance, `constraints.vision: true`, max 10 images/request, ~1,298 tokens per image, and ~14x cheaper than GLM 5.2: input 0.13 / output 0.52 / cached 0.13 credits per 1M) — and `/v1/chat/completions` now understands OpenAI-style **multimodal content arrays**. Re-surveyed the endpoint live on `api.xbrush.run` (2026-07-15): recognized part types are exactly `text` and `image_url` ("unknown content part type" otherwise); `image_url.url` takes both https URLs **and** `data:` URLs (no host allowlist on this endpoint, unlike the media endpoints); the upstream vendor enforces a 14px minimum dimension and the per-request image cap with clear errors, and rejects image parts on non-vision models at submit time (400, not billed). `image_url.detail` (`low`/`high`/`auto`) is passed through to the vendor and is a real cost lever — measured ~98 prompt tokens with `low` vs ~1,390-1,396 with `high`/`auto`/omitted.

`stop` also graduated from silently-ignored to a **recognized, validated field**: a non-empty string or an array of 1-4 non-empty strings (verified end-to-end: `stop:["5"]` halts "1 2 3 4 " before the 5). Still ignored by the server and therefore still not exposed: `tools`, `n`, `seed`, `response_format`, `logprobs`, `logit_bias`, `tool_choice`, `stream_options`. Roles (`system/user/assistant`), `reasoning_effort` (`none/minimal/high/max`), `max_tokens` (1-65536), the ~30s gateway limit, and the absence of an async variant are all unchanged.

### Added

- `xbrush_chat` — message `content` now accepts an array of `{type:"text", text}` / `{type:"image_url", image_url:{url, detail?}}` parts (vision input) in any role, alongside the existing plain string. `detail` is a free-form string (server/vendor validates — same anti-false-rejection stance as `aspect_ratio`), documented with the measured low-vs-high token costs.
- `xbrush_chat` — `stop` parameter (string, or 1-4 strings).
- `xbrush_list_models` — text entries now render vision capability from the new model `constraints`: `vision (max 10 images, ~1298 tokens/image)` vs `text-only`.

### Fixed

- `xbrush_chat` — empty-string message content is rejected at the schema (the server 400s it anyway; previously it was submitted and failed server-side).

### Tests

- 351 → 365 unit + integration tests pass (stop validation, content part shapes, strictness of parts, vision body pass-through, models vision/duration constraint rendering; refreshed the chat input-schema snapshot).

## 2.8.0 — 2026-07-15

_Backfilled summary (this and the three entries below were released without a changelog entry)._

Added the **`xbrush_chat`** tool — the platform's first text-category model, `z-ai/glm-5.2` (perToken billing). OpenAI-compatible `POST /v1/chat/completions`, **synchronous by design** (the API has no async variant for it — the one exception to the async-only rule): `model`, `messages` (1-1000, string content), `max_tokens` (1-65536, server normalizes to `max_completion_tokens`), `temperature`, `top_p`, `frequency_penalty`/`presence_penalty`, `reasoning_effort` (`none/minimal/high/max`, default `none`). The edge gateway cuts connections at ~30s with an HTML 504 while the server keeps processing and billing — the client maps that to `GATEWAY_TIMEOUT` with recovery hints (`xbrush_list_requests` + `xbrush_get_request`; the chat response `id` doubles as the request id, and failed requests auto-refund), and `TIMEOUT_CHAT` is 35s so the 504 is actually received. `xbrush_get_request` learned to print chat output, and `xbrush_list_models` gained the text category. 21 tools total; 351 tests.

## 2.7.0 — 2026-06-26

_Backfilled summary._

`xbrush_video_generate` gained the `checkImageReferences` guard: `@ImageN` tokens in `prompt`/`idea` refer to the **1-based position** in `image_urls` (frames included), not "the Nth reference" — a common LLM mistake. Out-of-range references or references pointing at a `first_frame`/`last_frame` role are rejected before submission with the actual position→role mapping to correct against.

## 2.6.0 — 2026-06-26

_Backfilled summary._

Updated seedance 2.0 reference-to-video input to its final shape: `image_urls` elements are strings **or** `{url, role}` objects (`first_frame` / `last_frame` / `reference_image`), mixable, passed through verbatim to `imageUrls`. Verified live that objects echo unchanged into the model payload and that `image_url` (single) is not required alongside them. Also exposed `idea` (non-English prompt, server-translated), `resolution`, `aspect_ratio`, `generate_audio`, and `consistency_mode` on `xbrush_video_generate`.

## 2.5.0 — 2026-06-25

_Backfilled summary._

`xbrush_video_generate`: added seedance 2.0 multi-reference input (`image_urls`, then still a plain string array), made `image_url` optional (t2v needs none), and replaced the wrong `5|10` duration literals with `int 1-20` — per-model ranges come from `xbrush_list_models` `constraints` (`{min,max,step,default}`) and are validated server-side (anti-false-rejection stance).

## 2.4.0 — 2026-06-23

**Breaking changes:** None. Existing `resolution`/`aspect_ratio` sizing is unchanged; this only adds an escape hatch and relaxes the width/height guard for that one case.

`gpt-image-2`/`-edit` can now take an exact output size. The XBrush server gained a `custom` aspect ratio: sending `aspect_ratio:"custom"` **together with** `width`/`height` makes the model emit exactly those pixels (the resolution/aspect_ratio tiers are bypassed). Verified live on `api.xbrush.run`: `{width:1024,height:1152,aspect_ratio:"custom"}` → 1024×1152 and `{1536,864}` → 1536×864, with `width`/`height` passed straight through in the model payload. `width` **and** `height` are both required and each must be a multiple of 16, with longest edge ≤3840 and total pixels 655,360–8,294,400 — out-of-range or `"custom"` alone returns `400` at submit (no charge, with a precise constraint message). Cost is billed at the resolution tier (1K when unspecified).

Until now the runtime guard rejected any `width`/`height` sent to a resolution-based model; it now lets them through when `aspect_ratio:"custom"`. Exact-pixel `custom` is reliable only on `gpt-image-2`/`-edit`: `seedream-4.5` keeps only the ratio and rescales to ~2K (1024×1152 → 1824×2048), and `nano-banana-pro` ignores width/height entirely (→ 2048×2048, and pricier). So the guard passes `custom` through for any model, but the per-model difference is documented in the describe text rather than enforced (same anti-false-rejection stance as `aspect_ratio`).

### Added

- `xbrush_image_generate` / `xbrush_image_edit` — `aspect_ratio:"custom"` + `width`/`height` now requests an exact pixel size on `gpt-image-2`/`-edit` (e.g. `width:1024,height:1152,aspect_ratio:"custom"` → 1024×1152). The width/height guard (`rejectWidthHeightForResolutionModel`) skips its rejection when `aspect_ratio==="custom"`; the `width`/`height`/`aspect_ratio` describe text now documents the custom mode and the per-model caveats.

### Tests

- 295 → 297 unit + integration tests pass (added a `custom` pass-through case for generate and edit; refreshed the two description snapshots).

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
