# @lweight/xbrush-api-mcp

MCP server for the [XBrush](https://xbrush.ai) AI media generation API — images, video, speech, music, sound effects, lip-sync, video extend/retake, content moderation, and watermarks, directly from Claude Code.

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
```

## How results work

All generation tools submit **asynchronously** and return a `request_id`. Poll it with
`xbrush_get_request` until `status` is `completed`, then read the output URL(s).
The blocking `/sync` endpoints are intentionally never called (see `CLAUDE.md`).

## Available Tools (20)

### Image (4)

| Tool | Description |
|------|-------------|
| `xbrush_image_generate` | Generate images from text (e.g. nano-banana-pro, seedream-4.5, flux.2-pro, z-image-turbo) |
| `xbrush_image_edit` | Edit / inpaint (qwen-image-edit) or outpaint (flux-outpaint, qwen-outpaint) |
| `xbrush_image_upscale` | Upscale images (2x / 4x) |
| `xbrush_image_remove_bg` | Remove background |

### Video (5)

| Tool | Description |
|------|-------------|
| `xbrush_video_generate` | Image-to-video (e.g. kling-v3, veo3.1, seedance-2.0, hailuo-02, wan-2.5) |
| `xbrush_video_upscale` | Upscale videos (realesrgan, seedvr) |
| `xbrush_video_lip_sync` | Lip-sync a face video to an audio track |
| `xbrush_video_extend` | Extend an existing video by 1–20 seconds |
| `xbrush_video_retake` | Regenerate a video variation up to a timestamp |

### Audio (3)

| Tool | Description |
|------|-------------|
| `xbrush_tts_generate` | Text-to-speech (e.g. speech-2.8-hd, eleven-v3) |
| `xbrush_music_generate` | Music generation from text (lyria2) |
| `xbrush_sound_effect_generate` | Generate sound effects for a video |

### Utility (8)

| Tool | Description |
|------|-------------|
| `xbrush_content_moderate` | NSFW moderation + masking for an image or video |
| `xbrush_watermark_add` | Add the XBrush watermark to an image/video |
| `xbrush_list_models` | List available AI models with pricing |
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
