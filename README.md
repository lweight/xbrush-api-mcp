# @lweight/xbrush-api-mcp

MCP server for the [XBrush](https://xbrush.ai) AI media generation API — images (generate / edit / outpaint / inpaint / layer-split / OCR / detection / product lookup), video (generate / edit / extend / retake / analysis), speech (TTS with timestamps, STT, voice cloning), music, sound effects, lip-sync & talking photos, LoRA training, LLM chat, deterministic ffmpeg / image / filter-graph media pipelines, content moderation, and watermarks — directly from Claude Code.

## Quick Start

### 1. Get an API Key

Get your key at [xbrush.run/api-keys](https://xbrush.run/api-keys).

### 2. Configure Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "xbrush": {
      "command": "npx",
      "args": ["-y", "@lweight/xbrush-api-mcp"],
      "env": {
        "XBRUSH_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### 3. Use It

```
"Generate an image of a cat sitting on a desk"
"Extend this poster to a 16:9 canvas"
"Remove the person on the left from this photo (inpaint)"
"Split this poster into background / product / text layers"
"What text is on this sign?"  /  "Which product and brand is this?"
"Read this script aloud with word timings"
"Transcribe this WAV"
"Turn this 5s clip black-and-white with the original audio"
"Trim the first 2 seconds and export as GIF"
"Ask Claude Sonnet 5 to summarize this paragraph as JSON"
```

## How results work

All generation and processing tools submit **asynchronously** and return a `request_id`. Poll it with
`xbrush_get_request` until `status` is `completed`, then read the output URL(s).
The blocking `/sync` endpoints are intentionally never called (see `CLAUDE.md`).

Exceptions that answer directly (the API has no async variant): `xbrush_chat` (LLM), `xbrush_voice_clone`,
the three image-analysis tools (`xbrush_image_vision`, `xbrush_image_segment_detect`, `xbrush_image_product_lookup`)
and the free `xbrush_media_info` probe. Responses must fit the platform's ~30s gateway limit; if a 504 cuts the
connection, the request keeps processing server-side and its outcome can be recovered via `xbrush_list_requests`
+ `xbrush_get_request` (failed requests are auto-refunded).

## Available Tools (37)

### Image (11)

| Tool | Description |
|------|-------------|
| `xbrush_image_generate` | Generate images from text (e.g. seedream-5.0-pro, nano-banana-2, flux.2-pro, gpt-image-2, z-image-turbo); `idea` for non-English prompts, cfg/guidance/scheduler knobs, transparent backgrounds, trained LoRAs via `loras: [{url, weight}]` |
| `xbrush_image_edit` | Instruct-edit / masked edit / multi-reference composition (up to 9 refs; qwen-image-edit, seedream-5.0-pro-edit, flux.2-pro-edit, gpt-image-2-edit, …) |
| `xbrush_image_outpaint` | Extend an image onto a larger canvas (`canvas_width` × `canvas_height`, optional `scale` / `prompt`) |
| `xbrush_image_inpaint` | Prompt-less content-aware fill / object removal from a mask (URL, data: URL or base64 PNG) |
| `xbrush_image_enhance` | AI enhancement pass (experimental — timed out in testing) |
| `xbrush_image_layer_split` | Decompose a poster / product shot into background / product / text layers (PNG per layer + bounding boxes) |
| `xbrush_image_segment_detect` | Synchronous open-vocabulary object detection → pixel boxes (0.01 credits) |
| `xbrush_image_vision` | Synchronous OCR → text items with bboxes, full text, locale (0.003 credits) |
| `xbrush_image_product_lookup` | Synchronous product / brand identification (0.05 credits) |
| `xbrush_image_upscale` | Upscale (factor 1.5-4 or `target_height`) |
| `xbrush_image_remove_bg` | Remove background |
| `xbrush_lora_train` | Train a LoRA (custom style/subject) on 1–80 images for LoRA-capable bases (flux.1-dev, qwen-image, z-image-turbo, netayume-v4, anima-base) — 2 credits per 1k steps |

### Video (7)

| Tool | Description |
|------|-------------|
| `xbrush_video_generate` | Image-/text-/reference-to-video (seedance-2.5/2.0, kling-v3/o3, veo3.1, wan-3.0, minimax-h3, ltx-2.3, gemini-omni …); multi-reference via `image_urls` + `@ImageN` prompts, per-model `duration` (up to 30s), resolution tiers, audio generation |
| `xbrush_video_edit` | Prompt-driven whole-video transformation (gemini-omni-1.1-flash), keep / regenerate / drop audio |
| `xbrush_video_vision` | Speech transcript with timed segments + on-screen text of sampled frames |
| `xbrush_video_upscale` | Upscale videos (realesrgan, seedvr) |
| `xbrush_video_lip_sync` | Lip-sync a face video (pixverse-lipsync, infinite-talk) or animate a still portrait as a talking photo (fabric-1.0) — speech from audio or built-in TTS (`text` + `voice_id`) |
| `xbrush_video_extend` | Extend a video by 1–20 seconds (ltx-2.3-extend, pixverse-v6-extend, gemini-omni) with optional prompt / style / resolution |
| `xbrush_video_retake` | Regenerate a segment (`start_time` → `end_time`) with optional prompt |

### Audio (5)

| Tool | Description |
|------|-------------|
| `xbrush_tts_generate` | Text-to-speech (eleven-v3, MiniMax speech-2.8-hd/-turbo/2.6-hd, ByteDance seed-tts-2.0 / seed-icl-2.0) with speed / pitch / style / emotion; `with_timestamps` returns character-level timing |
| `xbrush_stt_transcribe` | Speech-to-text (whisper-1; WAV input) |
| `xbrush_music_generate` | Music generation from text (lyria2, lyria3, lyria3-pro), optionally image-conditioned |
| `xbrush_sound_effect_generate` | Sound effects for a video — video-driven (pixverse) or prompt-driven (elevenlabs, stable-audio) |
| `xbrush_voice_clone` | Clone a voice from audio samples (seed-icl-2.0 2.6 credits; eleven / speech-2.8-hd / speech-2.6-hd 2 credits) — synchronous, returns the `voice_id` for TTS |

### Text (1)

| Tool | Description |
|------|-------------|
| `xbrush_chat` | LLM chat completions — 12 models (GLM 5.2, Seed 2.0 Mini / 2.1 Turbo, Gemini 3.1 / 3.5 Flash Lite, Claude Sonnet 5 / Opus 5, DeepSeek V4 Flash, GPT-4o / 4o-mini / 5.4, Grok 4.3) — synchronous, OpenAI-compatible, billed per token; vision content parts, function calling (`tools` / `tool_choice`), structured output (`response_format`), reasoning effort none…max; per-model param quirks reported as warnings |

### Media utilities (4)

| Tool | Description |
|------|-------------|
| `xbrush_media_ffmpeg` | Deterministic ffmpeg pipeline: trim, concat, transcode, scale, extract-audio, thumbnail, watermark, gif, speed, crop, rotate, fade, subtitle, merge-audio, still |
| `xbrush_media_image_process` | Deterministic image ops: resize, crop, pad, composite, stack, text, adjust, blur, sharpen, filters, straighten_document … |
| `xbrush_media_graph` | ffmpeg filter-graph composition: overlays, crossfades, chroma key, color grading / LUTs, drawtext, zoompan, audio mixing / normalizing |
| `xbrush_media_info` | Free metadata probe for a video or image URL |

### Utility (9)

| Tool | Description |
|------|-------------|
| `xbrush_content_moderate` | NSFW moderation + masking for an image or video (threshold) |
| `xbrush_watermark_add` | Add the XBrush watermark to an image/video (strength low/medium/high) |
| `xbrush_list_models` | List the 128 models with pricing, vendor, and per-model constraints (video durations, LLM vision / function-calling / structured-output flags) |
| `xbrush_list_voices` | List TTS voices per provider, or fetch one voice's detail by `voice_id` |
| `xbrush_get_request` | Check status/result of any request (renders every output shape) |
| `xbrush_list_requests` | List recent API requests, filterable by domain / action / status |
| `xbrush_file_upload` | Upload a local file to the XBrush CDN (auto / direct / presign; images, video, audio, subtitles, safetensors, zip) |
| `xbrush_check_health` | Check API server status |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XBRUSH_API_KEY` | Yes | Your XBrush API key |
| `XBRUSH_BASE_URL` | No | API base URL. Defaults to `https://api.xbrush.run`. |
| `XBRUSH_DISABLED_TOOLS` | No | Comma-separated tool names to skip. Safety valve for selectively disabling a specific tool without uninstalling. Example: `xbrush_music_generate,xbrush_content_moderate` |

## License

MIT
