import { z } from "zod";

/**
 * Media utility endpoints (2026-08/09, category "utility" in xbrush_list_models):
 *
 *   POST /v1/media/ffmpeg  — linear ffmpeg pipeline: inputs (1-10 URLs) → operations (1-20)
 *                            → output {format, fps, quality}. Async (202), domain media/ffmpeg,
 *                            billed per output second (h264 0.0004/s; h265 ×9, vp9 ×35, gif ×29;
 *                            floor 0.002) — a 2s trim cost 0.002 and finished in ~2s.
 *   POST /v1/media/image   — sharp/ImageMagick-style still-image pipeline: inputs (1-6) →
 *                            operations (≤10) → output {format jpg/png/webp/gif, quality 1-100}.
 *                            Async, domain media/image, ~0.0001 credits per megapixel-step
 *                            (floor 0.0004) — a 256px webp resize cost 0.0006.
 *   POST /v1/media/graph   — node graph (ffmpeg filter-graph IR): inputs [{id,url}] → nodes
 *                            [{id, op, from:{port: id|id[]}, params}] → output {from, format,
 *                            quality, fps}. Async, domain media/graph. ~60 ops (v1); the server
 *                            validates ports/params per op with precise messages ("unknown param
 *                            X — allowed: …", "unknown port X — ports: base, over").
 *   GET  /v1/media/info    — probe a media URL (no credits): video {width,height,fps,
 *                            durationInSeconds,hasAudio,videoCodec,sizeBytes} / image {kind,format,
 *                            width,height,frames,hasAlpha}. Unreadable URL → 200 with {error}.
 *   GET  /v1/media/fonts   — drawtext font registry (206 names, ko/ja/zh/en);
 *   GET  /v1/media/luts    — lut3d presets (cinematic_v1, golden_v1, monofilm_v1, …).
 *
 * All field inventories below were reverse-engineered live on 2026-09-06.
 */

const UrlList = (max: number, what: string) =>
  z
    .array(z.string().url().max(2048))
    .min(1)
    .max(max)
    .describe(`${what} (1-${max} http(s) URLs, referenced by 0-based index in operations).`);

export const FFMPEG_OPS = [
  "trim",
  "concat",
  "transcode",
  "scale",
  "extract-audio",
  "thumbnail",
  "watermark",
  "gif",
  "speed",
  "crop",
  "rotate",
  "fade",
  "subtitle",
  "merge-audio",
  "still",
] as const;

/**
 * One superset DTO covers every op server-side (a parameter that does not
 * apply to an op is ignored). Documented per op:
 *   trim: start, end | duration          concat: (joins all inputs)     transcode: codec, crf, bitrate
 *   scale: width, height, fit             extract-audio: —               thumbnail: at
 *   watermark: src (image URL), position, margin, scale, opacity        gif: fps, width, loop
 *   speed: factor                         crop: width, height, x, y, aspect   rotate: degrees
 *   fade: type (in/out), duration         subtitle: src (srt/vtt URL), style    merge-audio: src (audio URL)
 *   still: duration (turn an image input into a clip)
 */
export const FfmpegOperationSchema = z
  .object({
    op: z.enum(FFMPEG_OPS).describe("Operation name."),
    start: z.number().min(0).optional().describe("trim: start time in seconds."),
    end: z.number().min(0).optional().describe("trim: end time in seconds (alternative to duration)."),
    duration: z.number().min(0).optional().describe("trim/fade/still: length in seconds."),
    codec: z.enum(["h264", "h265", "vp9"]).optional().describe("transcode: video codec (h264 default; h265 ×9 and vp9 ×35 price)."),
    crf: z.number().int().optional().describe("transcode: constant rate factor (quality; lower = better/larger)."),
    bitrate: z.string().optional().describe("transcode: target bitrate string, e.g. '4M'."),
    width: z.number().int().optional().describe("scale/crop/gif: width in pixels."),
    height: z.number().int().optional().describe("scale/crop: height in pixels."),
    fit: z.enum(["crop", "contain", "pad"]).optional().describe("scale: how to fit when both dimensions are given."),
    at: z.number().min(0).optional().describe("thumbnail: timestamp in seconds to grab."),
    count: z.number().int().optional().describe("thumbnail: number of frames to extract."),
    src: z.string().url().optional().describe("watermark: overlay image URL; subtitle: .srt/.vtt URL; merge-audio: audio URL."),
    position: z
      .enum([
        "top-left",
        "top-center",
        "top-right",
        "center-left",
        "center",
        "center-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ])
      .optional()
      .describe("watermark: placement."),
    margin: z.number().int().optional().describe("watermark: margin from the edges in pixels."),
    scale: z.number().optional().describe("watermark: overlay scale relative to the frame (0-1)."),
    opacity: z.number().optional().describe("watermark: overlay opacity (0-1)."),
    fps: z.number().int().optional().describe("gif: frame rate."),
    loop: z.boolean().optional().describe("gif: loop forever."),
    factor: z.number().optional().describe("speed: playback multiplier (2 = twice as fast, 0.5 = slow motion)."),
    x: z.number().int().optional().describe("crop: left offset in pixels."),
    y: z.number().int().optional().describe("crop: top offset in pixels."),
    aspect: z.string().optional().describe("crop: target aspect ratio string (e.g. '9:16') instead of explicit width/height."),
    degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional().describe("rotate: clockwise degrees (90/180/270)."),
    type: z.enum(["in", "out"]).optional().describe("fade: direction."),
    style: z.enum(["default", "boxed", "large"]).optional().describe("subtitle: rendering style."),
  })
  .strict();

export const MediaFfmpegSchema = z
  .object({
    inputs: UrlList(10, "Source media URLs"),
    operations: z
      .array(FfmpegOperationSchema)
      .min(1)
      .max(20)
      .describe("Ordered pipeline of 1-20 operations applied to the input(s)."),
    output: z
      .object({
        format: z.enum(["mp4", "webm", "mov", "gif", "mp3", "m4a", "wav", "jpg", "png"]).optional().describe("Container/format of the result (default mp4; use wav to feed xbrush_stt_transcribe)."),
        fps: z.number().int().min(1).max(120).optional().describe("Output frame rate (1-120)."),
        quality: z.string().optional().describe("Quality preset string (free-form, server-validated)."),
      })
      .strict()
      .optional()
      .describe("Output encoding options."),
  })
  .strict();

export const IMAGE_PROCESS_OPS = [
  "resize",
  "crop",
  "rotate",
  "flip",
  "pad",
  "trim",
  "composite",
  "stack",
  "text",
  "border",
  "adjust",
  "blur",
  "sharpen",
  "sepia",
  "negate",
  "posterize",
  "solarize",
  "vignette",
  "emboss",
  "charcoal",
  "oil_paint",
  "swirl",
  "tint",
  "pixelate",
  "auto_contrast",
  "level",
  "noise",
  "glow",
  "hald_clut",
  "stylize",
  "pencil_sketch",
  "detail_enhance",
  "smooth",
  "denoise",
  "clahe",
  "white_balance",
  "straighten_document",
] as const;

/**
 * Superset DTO (server-validated ranges): resize: width/height (≤12000), fit
 * (contain/cover/fill); crop: width, height, x, y | aspect, gravity; rotate:
 * degrees (90/180/270); flip: direction; pad: width, height, background,
 * gravity; composite: (overlay input index) scale, opacity, gravity, x, y;
 * stack: direction (horizontal/vertical/grid), columns (≤6), gap (≤128),
 * background; text: text, fontFamily, size (8-512), color, gravity, x, y,
 * strokeWidth; border: width, color; adjust: brightness/contrast/saturation/hue
 * (-100..100); blur/sharpen: sigma (0.1-10), amount (0.1-3); level: mode
 * (normalize/level/equalize); denoise/smooth/stylize: strength (1-30);
 * straighten_document: method (auto/deskew/perspective); hald_clut: clut.
 */
export const ImageProcessOperationSchema = z
  .object({
    op: z.enum(IMAGE_PROCESS_OPS).describe("Operation name."),
    width: z.number().int().min(1).max(12000).optional(),
    height: z.number().int().min(1).max(12000).optional(),
    fit: z.enum(["contain", "cover", "fill"]).optional().describe("resize: fit mode when both dimensions are given."),
    x: z.number().int().min(0).optional(),
    y: z.number().int().min(0).optional(),
    aspect: z.string().max(16).optional().describe("crop: aspect ratio string, e.g. '1:1'."),
    gravity: z
      .enum(["center", "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"])
      .optional()
      .describe("Anchor for crop/pad/composite/text."),
    degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional().describe("rotate: clockwise degrees."),
    direction: z.enum(["horizontal", "vertical", "grid"]).optional().describe("flip: horizontal/vertical; stack: layout."),
    columns: z.number().int().min(1).max(6).optional().describe("stack (grid): columns."),
    gap: z.number().int().min(0).max(128).optional().describe("stack: gap between images in pixels."),
    background: z.string().max(16).optional().describe("pad/stack: background color (CSS hex like '#ffffff' or 'transparent')."),
    color: z.string().max(16).optional().describe("text/border/tint: color (CSS hex)."),
    scale: z.number().min(0.01).max(1).optional().describe("composite: overlay scale relative to the base (0.01-1)."),
    opacity: z.number().min(0.01).max(1).optional().describe("composite: overlay opacity (0.01-1)."),
    input: z.number().int().min(0).optional().describe("composite: index of the overlay in inputs (0-based). Server-validated."),
    text: z.string().optional().describe("text: the string to draw."),
    fontFamily: z.string().max(64).optional().describe("text: font family (see GET /v1/media/fonts via xbrush_media_graph description; Korean fonts available)."),
    size: z.number().int().min(8).max(512).optional().describe("text: font size in px (8-512)."),
    strokeWidth: z.number().int().min(0).max(16).optional().describe("text: outline width (0-16)."),
    brightness: z.number().min(-100).max(100).optional().describe("adjust: -100..100."),
    contrast: z.number().min(-100).max(100).optional().describe("adjust: -100..100."),
    saturation: z.number().min(-100).max(100).optional().describe("adjust: -100..100."),
    hue: z.number().min(-100).max(100).optional().describe("adjust: hue rotation -100..100."),
    sigma: z.number().min(0.1).max(10).optional().describe("blur/sharpen: radius (0.1-10)."),
    amount: z.number().min(0.1).max(3).optional().describe("sharpen/glow: strength (0.1-3)."),
    mode: z.enum(["normalize", "level", "equalize"]).optional().describe("level / auto_contrast: method."),
    strength: z.number().min(1).max(30).optional().describe("denoise/smooth/stylize/pixelate-like ops: 1-30."),
    method: z.enum(["auto", "deskew", "perspective"]).optional().describe("straighten_document: method."),
    clut: z.string().optional().describe("hald_clut: LUT key (see GET /v1/media/luts)."),
  })
  .strict();

export const MediaImageProcessSchema = z
  .object({
    inputs: UrlList(6, "Source image URLs"),
    operations: z
      .array(ImageProcessOperationSchema)
      .min(1)
      .max(10)
      .describe("Ordered pipeline of 1-10 operations. Multi-input ops (composite, stack) consume all inputs; single-input ops apply to input 0."),
    output: z
      .object({
        format: z.enum(["jpg", "png", "webp", "gif"]).optional().describe("Output format (default keeps a sensible format; png preserves alpha)."),
        quality: z.number().int().min(1).max(100).optional().describe("Lossy quality 1-100 (jpg/webp)."),
      })
      .strict()
      .optional(),
  })
  .strict();

const GraphId = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/, "ids are lowercase: ^[a-z][a-z0-9_]{0,31}$")
  .describe("Lowercase identifier ^[a-z][a-z0-9_]{0,31}$.");

/**
 * Graph node. `from` wires input ports: most ops have a single port "in";
 * overlay has {base, over}; alphamerge {base, alpha}; set_audio {video, audio};
 * multi-input ops (concat, xfade, blend, amix, aconcat) take an array on "in".
 * Params are op-specific (server lists the allowed ones on error).
 */
export const GraphNodeSchema = z
  .object({
    id: GraphId,
    op: z.string().trim().min(1).describe("Op name (v1): scale, crop, pad, rotate, hflip, vflip, setsar, zoompan, trim, still, fps, speed, freeze, reverse, loop, overlay, concat, xfade, blend, chromakey, colorkey, alphamerge, eq, hue, colorbalance, colortemperature, curves, lut3d, colorlevels, grayscale, negate, gblur, boxblur, unsharp, noise, chromashift, vignette, drawbox, drawgrid, yadif, deshake, mpdecimate, fade, drawtext, color, atrim, afade, atempo, volume, apad, aloop, pan, loudnorm, aeq, silenceremove, amix, aconcat, silence, set_audio."),
    from: z
      .record(z.union([GraphId, z.array(GraphId).min(1)]))
      .optional()
      .describe("Input wiring {port: sourceId | [sourceIds]} where sourceId is an input id or another node id. Ports: 'in' for most ops (array for concat/xfade/blend/amix/aconcat), {base, over} for overlay, {base, alpha} for alphamerge, {video, audio} for set_audio. Source ops (color, silence) take no inputs."),
    params: z
      .record(z.unknown())
      .optional()
      .describe("Op parameters, e.g. trim {start, duration}; scale {width, height, fit}; crop {width, height, x, y}; pad {width, height, color, position}; overlay {position, margin, scale, start, end}; fade/afade {type: in|out, duration}; speed/atempo/volume {factor}; loop/aloop {count}; xfade {transition, duration}; drawtext {text, font (GET /v1/media/fonts key), size, color, position, margin}; lut3d {lut}; eq {brightness, contrast, saturation, gamma}; color {color, width, height, duration, fps}; silence {duration, channels}; set_audio {mode, audioPlayCount}. Unknown params are rejected with the allowed list."),
  })
  .strict();

export const MediaGraphSchema = z
  .object({
    inputs: z
      .array(z.object({ id: GraphId, url: z.string().url().describe("Video or jpg/png/webp image URL.") }).strict())
      .min(1)
      .max(10)
      .describe("Named inputs (1-10). Videos and jpg/png/webp images are accepted (images become clips via the `still` op)."),
    nodes: z.array(GraphNodeSchema).min(1).max(50).describe("Processing nodes (1-50), any order — wiring is by id."),
    output: z
      .object({
        from: GraphId.describe("Id of the node (or input) whose result is rendered."),
        format: z.enum(["mp4", "webm", "gif", "mp3", "m4a", "wav"]).optional().describe("Output container (default mp4)."),
        quality: z.enum(["low", "medium", "high"]).optional(),
        fps: z.number().int().min(1).max(120).optional(),
      })
      .strict()
      .describe("Which node to render and how to encode it."),
  })
  .strict();

export const MediaInfoSchema = z
  .object({
    url: z.string().url().describe("http(s) URL of the video or image to probe (CDN URLs from other tools work)."),
  })
  .strict();
