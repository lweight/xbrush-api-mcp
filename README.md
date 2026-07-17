# @lweight/xbrush-api-mcp

MCP server for the [XBrush](https://xbrush.ai) AI media generation API — images, video, speech, music, sound effects, lip-sync (incl. talking photos), video extend/retake, LLM chat, content moderation, and watermarks, directly from Claude Code.

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
"Remove the background from this image"
"Read this script aloud in Korean"
"Create a 30-second upbeat synth track"
"Extend this video by another 5 seconds"
"Make this portrait photo say the following line"
"Ask GLM 5.2 to summarize this paragraph"
"Ask Seed 2.0 Mini what is in this photo"
```

## How results work

All generation tools submit **asynchronously** and return a `request_id`. Poll it with
`xbrush_get_request` until `status` is `completed`, then read the output URL(s).
The blocking `/sync` endpoints are intentionally never called (see `CLAUDE.md`).

The exceptions are `xbrush_chat` (LLM chat completions) and `xbrush_voice_clone`: both are
**synchronous** and return their result directly — the API has no async variant for them.
Responses must fit the platform's ~30s gateway limit; if a 504 cuts the connection, the request
keeps processing server-side and its outcome can be recovered via `xbrush_list_requests` +
`xbrush_get_request`.

## Available Tools (23)

### Image (5)

| Tool | Description |
|------|-------------|
| `xbrush_image_generate` | Generate images from text (e.g. seedream-5.0-pro, nano-banana-pro, flux.2-pro, gpt-image-2, z-image-turbo); apply trained LoRAs via `loras: [{url, weight}]` |
| `xbrush_image_edit` | Edit / inpaint (qwen-image-edit, seedream-5.0-pro-edit, flux.2-pro-edit) or outpaint (flux-outpaint, qwen-outpaint); supports `loras` too |
| `xbrush_lora_train` | Train a LoRA (custom style/subject) on 1–80 images for LoRA-capable bases (flux.1-dev, qwen-image, z-image-turbo, netayume-v4) — 2 credits per 1k steps |
| `xbrush_image_upscale` | Upscale images (2x / 4x) |
| `xbrush_image_remove_bg` | Remove background |

### Video (5)

| Tool | Description |
|------|-------------|
| `xbrush_video_generate` | Image-/text-/reference-to-video (e.g. kling-v3/o3, veo3.1, seedance-2.0, hailuo-02, wan-2.7). seedance-2.0 supports multi-reference via `image_urls` + `@ImageN` prompts and model-specific `duration` (4–15s) |
| `xbrush_video_upscale` | Upscale videos (realesrgan, seedvr) |
| `xbrush_video_lip_sync` | Lip-sync a face video (pixverse-lipsync, infinite-talk) or animate a still portrait as a talking photo (fabric-1.0) — speech from audio or built-in TTS (`text` + `voice_id`) |
| `xbrush_video_extend` | Extend an existing video by 1–20 seconds |
| `xbrush_video_retake` | Regenerate a video variation up to a timestamp |

### Audio (4)

| Tool | Description |
|------|-------------|
| `xbrush_tts_generate` | Text-to-speech (e.g. speech-2.8-hd, eleven-v3) |
| `xbrush_music_generate` | Music generation from text (lyria2, lyria3, lyria3-pro) |
| `xbrush_sound_effect_generate` | Generate sound effects for a video — video-driven (pixverse) or prompt-driven (elevenlabs, stable-audio) |
| `xbrush_voice_clone` | Clone a voice from audio samples (eleven / speech-2.8-hd / speech-2.6-hd) for use as a `voice_id` in TTS — synchronous, flat 50 credits (failures auto-refund) |

### Text (1)

| Tool | Description |
|------|-------------|
| `xbrush_chat` | LLM chat completions (GLM 5.2, Seed 2.0 Mini, Gemini 3.1 Flash Lite) — synchronous, OpenAI-compatible, billed per token; vision models take image inputs via content parts (https or data: URL, `detail: low` for cheap image tokens); function calling via OpenAI-style `tools`/`tool_choice` (answer every `tool_call` with a `role:"tool"` message; forced tool_choice is honored by Seed 2.0 Mini and Gemini but not GLM 5.2 — see `constraints.forcedChoiceHonored` in `xbrush_list_models`) |

### Utility (8)

| Tool | Description |
|------|-------------|
| `xbrush_content_moderate` | NSFW moderation + masking for an image or video |
| `xbrush_watermark_add` | Add the XBrush watermark to an image/video |
| `xbrush_list_models` | List available AI models with pricing, vendor, and per-model constraints (video durations, LLM vision / function-calling support) |
| `xbrush_list_voices` | List TTS voices (use a `voice_id` with `tts_generate`) |
| `xbrush_get_request` | Check status/result of an async operation |
| `xbrush_list_requests` | List recent API requests |
| `xbrush_file_upload` | Upload a local file to the XBrush CDN (auto / direct / presign) |
| `xbrush_check_health` | Check API server status |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XBRUSH_API_KEY` | Yes | Your XBrush API key |
| `XBRUSH_BASE_URL` | No | API base URL. Defaults to `https://api.xbrush.run`. |
| `XBRUSH_DISABLED_TOOLS` | No | Comma-separated tool names to skip. Safety valve for selectively disabling a specific tool without uninstalling. Example: `xbrush_music_generate,xbrush_content_moderate` |

## License

MIT
