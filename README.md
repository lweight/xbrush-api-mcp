# @lweight/xbrush-api-mcp

MCP server for the [XBrush](https://xbrush.ai) AI media generation API — images, video, speech, music, sound effects, lip-sync, and watermarks, directly from Claude Code.

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
```

## Available Tools (16)

### Image (4)

| Tool | Description | Default mode |
|------|-------------|--------------|
| `xbrush_image_generate` | Generate images from text | sync |
| `xbrush_image_edit` | Edit / inpaint / outpaint images | async |
| `xbrush_image_upscale` | Upscale images (2x / 4x) | async |
| `xbrush_image_remove_bg` | Remove background | sync |

### Video (3)

| Tool | Description | Default mode |
|------|-------------|--------------|
| `xbrush_video_generate` | Image-to-video (e.g. kling, wan, veo3) | async |
| `xbrush_video_upscale` | Upscale videos | async |
| `xbrush_video_lip_sync` | Lip-sync a face video to an audio track | async |

### Audio (3)

| Tool | Description | Default mode |
|------|-------------|--------------|
| `xbrush_tts_generate` | Text-to-speech | async |
| `xbrush_music_generate` | Music generation from text | async |
| `xbrush_sound_effect_generate` | Sound effect generation | async |

### Utility (6)

| Tool | Description |
|------|-------------|
| `xbrush_watermark_add` | Add text or image watermark to image/video |
| `xbrush_list_models` | List available AI models with pricing |
| `xbrush_get_request` | Check status/result of async operations |
| `xbrush_list_requests` | List recent API requests |
| `xbrush_file_upload` | Upload local file to XBrush CDN (auto / direct / presign) |
| `xbrush_check_health` | Check API server status |

## Sync vs Async

- **Sync tools** return the result directly. Good for fast operations (text-to-image, background removal, watermarking).
- **Async tools** return a `request_id`. Use `xbrush_get_request` to poll, or call with `sync=true` to wait.

`image_generate`, `image_edit`, `image_upscale`, `video_generate`, `video_upscale`, `video_lip_sync`, all audio tools, and `watermark_add` accept a `sync` boolean to switch modes.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XBRUSH_API_KEY` | Yes | Your XBrush API key |
| `XBRUSH_BASE_URL` | No | API base URL. Defaults to `https://api.xbrush.run`. |
| `XBRUSH_DISABLED_TOOLS` | No | Comma-separated tool names to skip. Safety valve for selectively disabling a specific tool without uninstalling. Example: `xbrush_music_generate,xbrush_watermark_add` |

## License

MIT
