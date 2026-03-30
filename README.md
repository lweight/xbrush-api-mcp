# @lweight/xbrush-api-mcp

MCP server for the [XBrush](https://xbrush.ai) AI media generation API. Generate images, edit photos, upscale, remove backgrounds, and more — directly from Claude Code.

## Quick Start

### 1. Get an API Key

Sign up at [xbrush.ai](https://xbrush.ai) and create an API key in Dashboard > API Keys.

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
"Upscale this image to 2x"
```

## Available Tools

### Image

| Tool | Description |
|------|-------------|
| `xbrush_image_generate` | Generate images from text prompts (sync) |
| `xbrush_image_edit` | Edit images with text instructions (async) |
| `xbrush_image_upscale` | Upscale images to higher resolution (async) |
| `xbrush_image_remove_bg` | Remove background from images (sync) |

### Utility

| Tool | Description |
|------|-------------|
| `xbrush_list_models` | List available AI models with pricing |
| `xbrush_get_request` | Check status/result of async operations |
| `xbrush_list_requests` | List recent API requests |
| `xbrush_file_upload` | Upload local file to XBrush CDN |
| `xbrush_check_health` | Check API server status |

## Sync vs Async

- **Sync tools** (`image_generate`, `image_remove_bg`): Return results immediately.
- **Async tools** (`image_edit`, `image_upscale`): Return a request ID. Use `xbrush_get_request` to check the result.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XBRUSH_API_KEY` | Yes | Your XBrush API key |
| `XBRUSH_BASE_URL` | No | API base URL (defaults to `https://api.xbrush.run`) |

## License

MIT
