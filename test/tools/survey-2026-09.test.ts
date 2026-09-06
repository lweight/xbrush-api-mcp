/**
 * Tool-handler coverage for the 2026-09 API survey: new image tools (async +
 * sync formatters), video edit/vision, STT + timestamped TTS routing,
 * request output rendering for the new shapes, model constraint rendering,
 * voice list alias/detail, moderation/watermark pass-through.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerImageTools, formatImageVision, formatSegmentDetect, formatProductLookup } from "../../src/tools/image.js";
import { registerVideoTools } from "../../src/tools/video.js";
import { registerAudioTools } from "../../src/tools/audio.js";
import { registerRequestTools, formatRequestDetail, formatOutput } from "../../src/tools/requests.js";
import { registerModelTools } from "../../src/tools/models.js";
import { registerVoiceTools, normalizeVoiceListModel } from "../../src/tools/voice.js";
import { registerModerationTools } from "../../src/tools/moderation.js";
import { registerWatermarkTools } from "../../src/tools/watermark.js";
import { getMimeType } from "../../src/services/file-upload.js";
import { TIMEOUT_ASYNC_POST, TIMEOUT_SYNC_UTILITY, TIMEOUT_GET } from "../../src/constants.js";
import type { XBrushModel } from "../../src/types.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;
let configs: Map<string, any>;

const IMG = "https://assets.xbrush.ai/20260904/a.png";
const VID = "https://assets.xbrush.ai/postprocess/a.mp4";
const WAV = "https://assets.xbrush.ai/pub-api/x/a.wav";
const ASYNC = (domain: string, action: string) => ({
  requestId: "req" + "s".repeat(21),
  status: "pending",
  domain,
  action,
  creditCharged: 0,
  estimatedTimeout: 180,
  pollUrl: "/v1/requests/req" + "s".repeat(21),
});

beforeAll(() => {
  const mock = createMockServer();
  registerImageTools(mock.server);
  registerVideoTools(mock.server);
  registerAudioTools(mock.server);
  registerRequestTools(mock.server);
  registerModelTools(mock.server);
  registerVoiceTools(mock.server);
  registerModerationTools(mock.server);
  registerWatermarkTools(mock.server);
  handlers = mock.handlers;
  configs = mock.configs;
});

async function lastCall() {
  return mockedApi.mock.calls.at(-1)![0] as any;
}

// ── image: existing tools, new fields ────────────────────────────────

describe("xbrush_image_generate / edit / upscale — 2026-09 필드 매핑", () => {
  it("generate: idea/cfg/guidanceScale/scheduler/sampler/background/triggerWord camelCase", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "generate"));
    await handlers.get("xbrush_image_generate")!({
      model: "flux.2-pro",
      prompt: "cat",
      idea: "고양이",
      cfg: 7,
      guidance_scale: 3,
      scheduler: "simple",
      sampler: "euler",
      background: "transparent",
      trigger_word: "TOK",
    });
    const a = await lastCall();
    expect(a.data).toEqual({
      model: "flux.2-pro",
      prompt: "cat",
      idea: "고양이",
      cfg: 7,
      guidanceScale: 3,
      scheduler: "simple",
      sampler: "euler",
      background: "transparent",
      triggerWord: "TOK",
    });
  });

  it("edit: idea/negativePrompt/background/guidanceScale/sampler 매핑", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "edit"));
    await handlers.get("xbrush_image_edit")!({
      model: "qwen-image-edit",
      prompt: "hat",
      image_url: IMG,
      idea: "모자",
      negative_prompt: "blur",
      background: "opaque",
      guidance_scale: 2,
      sampler: "x",
    });
    const a = await lastCall();
    expect(a.data.idea).toBe("모자");
    expect(a.data.negativePrompt).toBe("blur");
    expect(a.data.background).toBe("opaque");
    expect(a.data.guidanceScale).toBe(2);
    expect(a.data.sampler).toBe("x");
  });

  it("upscale: targetHeight 매핑 + 실수 factor", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "upscale"));
    await handlers.get("xbrush_image_upscale")!({ image_url: IMG, upscale_factor: 2.5, target_height: 2048 });
    const a = await lastCall();
    expect(a.data).toEqual({ imageUrl: IMG, upscaleFactor: 2.5, targetHeight: 2048 });
  });
});

// ── image: new async tools ───────────────────────────────────────────

describe("신규 이미지 async 도구", () => {
  it("outpaint → POST /v1/image/outpaint (canvasWidth/Height/scale/prompt/resolution)", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "outpaint"));
    const r = await handlers.get("xbrush_image_outpaint")!({
      image_url: IMG,
      canvas_width: 1792,
      canvas_height: 1408,
      scale: 0.9,
      prompt: "table",
      resolution: "1K",
    });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/outpaint");
    expect(a.timeout).toBe(TIMEOUT_ASYNC_POST);
    expect(a.data).toEqual({ imageUrl: IMG, canvasWidth: 1792, canvasHeight: 1408, scale: 0.9, prompt: "table", resolution: "1K" });
    expect(r.content[0].text).toContain("submitted (async)");
  });

  it("inpaint → POST /v1/image/inpaint (mask 문자열 그대로, numInferenceSteps/expand)", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "inpaint"));
    await handlers.get("xbrush_image_inpaint")!({
      image_url: IMG,
      mask: "data:image/png;base64,iVBORw0KGgo=",
      num_inference_steps: 30,
      expand: 8,
      seed: 1,
      resolution: "2K",
    });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/inpaint");
    expect(a.data).toEqual({ imageUrl: IMG, mask: "data:image/png;base64,iVBORw0KGgo=", resolution: "2K", numInferenceSteps: 30, seed: 1, expand: 8 });
  });

  it("enhance → POST /v1/image/enhance", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "enhance"));
    await handlers.get("xbrush_image_enhance")!({ image_url: IMG, mode: "auto", n: 2 });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/enhance");
    expect(a.data).toEqual({ imageUrl: IMG, mode: "auto", n: 2 });
  });

  it("layer_split → POST /v1/image/layer-split (model/prompt/size)", async () => {
    mockedApi.mockResolvedValueOnce({ ...ASYNC("image", "layer-split"), creditCharged: 0.55 });
    const r = await handlers.get("xbrush_image_layer_split")!({ image_url: IMG, model: "seedream-5.0-pro-layerize", size: "1K", prompt: "split" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/layer-split");
    expect(a.data).toEqual({ imageUrl: IMG, model: "seedream-5.0-pro-layerize", prompt: "split", size: "1K" });
    expect(r.content[0].text).toContain("0.55");
  });

  it("신규 async 도구 annotations: idempotentHint false", () => {
    for (const n of ["xbrush_image_outpaint", "xbrush_image_inpaint", "xbrush_image_enhance", "xbrush_image_layer_split"]) {
      expect(configs.get(n).annotations.idempotentHint).toBe(false);
      expect(configs.get(n).annotations.readOnlyHint).toBe(false);
    }
  });
});

// ── image: sync tools ────────────────────────────────────────────────

describe("동기 이미지 분석 도구", () => {
  it("segment_detect → POST /v1/image/segment-detect, 동기 결과 렌더 (박스 px)", async () => {
    mockedApi.mockResolvedValueOnce({
      requestId: "reqADW",
      detected: true,
      count: 1,
      imageWidth: 1408,
      imageHeight: 1408,
      boxes: [{ x: 231, y: 111, width: 788, height: 497, score: 0.8524 }],
    });
    const r = await handlers.get("xbrush_image_segment_detect")!({ image_url: IMG, prompt: "lettuce" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/segment-detect");
    expect(a.method).toBe("POST");
    expect(a.timeout).toBe(TIMEOUT_SYNC_UTILITY);
    expect(a.data).toEqual({ imageUrl: IMG, prompt: "lettuce" });
    const text = r.content[0].text as string;
    expect(text).toContain('"lettuce"');
    expect(text).toContain("1 match");
    expect(text).toContain("x=231 y=111 w=788 h=497");
    expect(text).toContain("0.852");
    expect(text).not.toContain("submitted (async)");
  });

  it("segment_detect: 미검출 렌더", () => {
    const text = formatSegmentDetect({ detected: false, count: 0, boxes: [] }, "unicorn");
    expect(text).toContain("not found");
    expect(text).toContain("No boxes");
  });

  it("vision → POST /v1/image/vision (mode) + OCR 렌더", async () => {
    mockedApi.mockResolvedValueOnce({
      requestId: "reqOCR",
      items: [
        { text: "가을", bbox: [0.0868, 0.1102, 0.3102, 0.2092], confidence: null },
        { text: "신메뉴", bbox: [0.3495, 0.1102, 0.6898, 0.2092], confidence: 0.9 },
      ],
      fullText: "가을 신메뉴 출시",
      imageWidth: 864,
      imageHeight: 1152,
      locale: "ko",
      analyzedFrames: 1,
      creditsCharged: 0.003,
    });
    const r = await handlers.get("xbrush_image_vision")!({ image_url: IMG, mode: "document" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/vision");
    expect(a.data).toEqual({ imageUrl: IMG, mode: "document" });
    const text = r.content[0].text as string;
    expect(text).toContain("2 text items");
    expect(text).toContain("가을 신메뉴 출시");
    expect(text).toContain("locale ko");
    expect(text).toContain("[0.087, 0.110, 0.310, 0.209]");
    expect(text).toContain("(0.90)");
    expect(text).toContain("Credits charged**: 0.003");
  });

  it("vision: 텍스트 없음 렌더", () => {
    const text = formatImageVision({ items: [], fullText: "", imageWidth: 10, imageHeight: 10 });
    expect(text).toContain("No text detected");
  });

  it("product_lookup → POST /v1/image/product-lookup (language/mode) + 렌더", async () => {
    mockedApi.mockResolvedValueOnce({
      requestId: "reqP",
      productPresent: true,
      brandPresent: true,
      brandStatus: "suspected",
      brandStatusReason: "model_only_no_match",
      brand: { brandId: "cafesoso", brandNameEn: "Cafe Soso", brandDomain: "cafesoso.com" },
      products: [
        { brand: "카페 소소", brandNameEn: "Cafe Soso", productName: "단호박 케이크", categoryLabel: "케이크", confidence: 0.9, keySpecs: ["단호박 조각 토핑"], unconfirmed: ["priceEstimate"] },
        { brand: "카페 소소", brandNameEn: "Cafe Soso", productName: "아이스 라떼", categoryLabel: "커피 음료", confidence: 0.8 },
      ],
      visionEvidence: { entities: [{ name: "Sugar cake", score: 0.882 }] },
      mode: "grounded",
      grounded: false,
      creditsCharged: 0.05,
    });
    const r = await handlers.get("xbrush_image_product_lookup")!({ image_url: IMG, language: "ko", mode: "grounded" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/image/product-lookup");
    expect(a.data).toEqual({ imageUrl: IMG, language: "ko", mode: "grounded" });
    const text = r.content[0].text as string;
    expect(text).toContain("Products (2)");
    expect(text).toContain("단호박 케이크");
    expect(text).toContain("카페 소소 (Cafe Soso)");
    expect(text).toContain("cafesoso.com");
    expect(text).toContain("specs: 단호박 조각 토핑");
    expect(text).toContain("Sugar cake (0.88)");
    expect(text).toContain("Credits charged**: 0.05");
  });

  it("product_lookup: 단일 product 폴백 + 미검출", () => {
    const text = formatProductLookup({ productPresent: false, noProductReason: "no_product", product: { productName: "X" } });
    expect(text).toContain("Product present**: no (no_product)");
    expect(text).toContain("Products (1)");
  });

  it("동기 도구 annotations: readOnlyHint true / idempotentHint false (과금)", () => {
    for (const n of ["xbrush_image_segment_detect", "xbrush_image_vision", "xbrush_image_product_lookup"]) {
      expect(configs.get(n).annotations.readOnlyHint).toBe(true);
      expect(configs.get(n).annotations.idempotentHint).toBe(false);
    }
  });

  it("동기 도구 API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("imageUrl must be an https URL"));
    const r = await handlers.get("xbrush_image_vision")!({ image_url: "https://x/y.png" });
    expect(r.isError).toBe(true);
  });
});

// ── video ────────────────────────────────────────────────────────────

describe("video 도구 — 2026-09", () => {
  it("generate: 신규 필드 camelCase 매핑", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("video", "generate"));
    await handlers.get("xbrush_video_generate")!({
      model: "seedance-2.5",
      prompt: "walk",
      negative_prompt: "blur",
      audio_url: VID,
      width: 1280,
      height: 720,
      fps: 24,
      steps: 30,
      acceleration: "regular",
      seed: 3,
      aspect_ratio: "custom",
      duration: 30,
    });
    const a = await lastCall();
    expect(a.data).toMatchObject({ negativePrompt: "blur", audioUrl: VID, width: 1280, height: 720, fps: 24, steps: 30, acceleration: "regular", seed: 3, aspectRatio: "custom", duration: 30 });
  });

  it("extend: prompt/idea/resolution/style/generateAudio/startTime/seed 매핑", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("video", "extend"));
    await handlers.get("xbrush_video_extend")!({
      model: "pixverse-v6-extend",
      video_url: VID,
      duration: 5,
      prompt: "go",
      idea: "가",
      negative_prompt: "n",
      resolution: "720p",
      style: "clay",
      generate_audio: true,
      start_time: 2,
      seed: 9,
    });
    const a = await lastCall();
    expect(a.data).toEqual({ model: "pixverse-v6-extend", videoUrl: VID, duration: 5, prompt: "go", idea: "가", negativePrompt: "n", startTime: 2, resolution: "720p", generateAudio: true, style: "clay", seed: 9 });
  });

  it("retake: startTime/prompt/idea 매핑", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("video", "retake"));
    await handlers.get("xbrush_video_retake")!({ model: "ltx-2.3-retake", video_url: VID, end_time: 10, start_time: 2, prompt: "p" });
    const a = await lastCall();
    expect(a.data).toEqual({ model: "ltx-2.3-retake", videoUrl: VID, endTime: 10, startTime: 2, prompt: "p" });
  });

  it("video_edit → POST /v1/video/edit (audio)", async () => {
    mockedApi.mockResolvedValueOnce({ ...ASYNC("video", "video_edit"), creditCharged: 0.858 });
    const r = await handlers.get("xbrush_video_edit")!({ model: "gemini-omni-1.1-flash", video_url: VID, prompt: "bw", audio: "source" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/video/edit");
    expect(a.data).toEqual({ model: "gemini-omni-1.1-flash", videoUrl: VID, prompt: "bw", audio: "source" });
    expect(r.content[0].text).toContain("submitted (async)");
  });

  it("video_vision → POST /v1/video/vision (language)", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("video", "video_vision"));
    await handlers.get("xbrush_video_vision")!({ video_url: VID, language: "en" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/video/vision");
    expect(a.data).toEqual({ videoUrl: VID, language: "en" });
  });
});

// ── audio ────────────────────────────────────────────────────────────

describe("audio 도구 — 2026-09", () => {
  it("tts: pitch/style/emotion/outputFormat 매핑 → /v1/tts/generate", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("tts", "generate"));
    await handlers.get("xbrush_tts_generate")!({ text: "hi", model: "speech-2.8-hd", voice_id: "moss_audio_x", pitch: 2, style: 0.5, emotion: "happy", output_format: "mp3", speed: 1.1 });
    const a = await lastCall();
    expect(a.url).toBe("/v1/tts/generate");
    expect(a.data).toEqual({ text: "hi", model: "speech-2.8-hd", voiceId: "moss_audio_x", speed: 1.1, style: 0.5, pitch: 2, emotion: "happy", outputFormat: "mp3" });
  });

  it("tts with_timestamps → /v1/tts-wt/generate (pitch/emotion/outputFormat 제외) + inline completed 안내", async () => {
    mockedApi.mockResolvedValueOnce({ requestId: "req" + "w".repeat(21), status: "completed", domain: "tts-wt", action: "generate", creditCharged: 0.005, pollUrl: "/v1/requests/x" });
    const r = await handlers.get("xbrush_tts_generate")!({ text: "hi", model: "eleven-v3", voice_id: "Aria", speed: 1, style: 0.2, pitch: 2, emotion: "happy", with_timestamps: true });
    const a = await lastCall();
    expect(a.url).toBe("/v1/tts-wt/generate");
    expect(a.data).toEqual({ text: "hi", model: "eleven-v3", voiceId: "Aria", speed: 1, style: 0.2 });
    const text = r.content[0].text as string;
    expect(text).toContain("completed inline");
    expect(text).toContain("xbrush_get_request");
    expect(text).toContain("req" + "w".repeat(21));
  });

  it("tts with_timestamps pending 응답 → 기본 async 포맷", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("tts-wt", "generate"));
    const r = await handlers.get("xbrush_tts_generate")!({ text: "hi", with_timestamps: true });
    expect(r.content[0].text).toContain("submitted (async)");
  });

  it("music: imageUrl 매핑", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("music", "generate"));
    await handlers.get("xbrush_music_generate")!({ prompt: "p", image_url: IMG, duration: 30 });
    const a = await lastCall();
    expect(a.data).toEqual({ prompt: "p", duration: 30, imageUrl: IMG });
  });

  it("stt_transcribe → POST /v1/stt/transcribe (audioUrl/language)", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("stt", "transcribe"));
    const r = await handlers.get("xbrush_stt_transcribe")!({ audio_url: WAV, language: "en" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/stt/transcribe");
    expect(a.data).toEqual({ audioUrl: WAV, language: "en" });
    expect(r.content[0].text).toContain("submitted (async)");
    expect(configs.get("xbrush_stt_transcribe").annotations.idempotentHint).toBe(false);
  });
});

// ── requests: output rendering for the new shapes ────────────────────

describe("xbrush_get_request — 신규 output 형태 렌더", () => {
  const base = { requestId: "req" + "r".repeat(21), status: "completed", domain: "x", action: "y", creditCharged: 0.01 };

  it("layer-split: imageUrls + layers 정렬 렌더", () => {
    const text = formatRequestDetail({
      ...base,
      output: {
        imageUrls: ["https://a/0.png", "https://a/1.png"],
        imageDimensions: [{ width: 864, height: 1152 }, { width: 864, height: 906 }],
        layers: [{ name: null, zIndex: 0 }, { name: "background layer", zIndex: 1, boundingBox: { absolute: [0, 246, 864, 1152] }, description: "bg" }],
      },
    });
    expect(text).toContain("Image 1 (864×1152): https://a/0.png");
    expect(text).toContain('Image 2 (864×906) — layer "background layer" z1');
    expect(text).toContain("bbox [x0,y0,x1,y1]: 0, 246, 864, 1152");
  });

  it("media ffmpeg/graph: videoUrl + thumbnail + durationSeconds/sizeBytes", () => {
    const text = formatRequestDetail({
      ...base,
      output: { width: 1280, format: "mp4", height: 720, videoUrl: "https://a/out.mp4", sizeBytes: 425323, thumbnailUrl: "https://a/t.jpg", durationSeconds: 2 },
    });
    expect(text).toContain("Video (1280×720, 2s, 0.41 MB, mp4): https://a/out.mp4");
    expect(text).toContain("Thumbnail: https://a/t.jpg");
    expect(text).not.toContain("Other output fields");
  });

  it("media image: imageUrls + top-level width/height/format/sizeBytes (imageDimensions 없음)", () => {
    const text = formatRequestDetail({
      ...base,
      output: { width: 256, format: "webp", height: 256, imageUrls: ["https://a/out.webp"], sizeBytes: 2526 },
    });
    expect(text).toContain("Image 1 (256×256, webp, 2.5 KB): https://a/out.webp");
    expect(text).not.toContain("Other output fields");
  });

  it("stt: text/language/duration", () => {
    const text = formatRequestDetail({ ...base, output: { text: "hello world", model: "whisper-1", duration: 28.68, language: "en" } });
    expect(text).toContain("Transcript (en, 28.68s, whisper-1)");
    expect(text).toContain("hello world");
  });

  it("video vision: transcript segments + on-screen text", () => {
    const text = formatRequestDetail({
      ...base,
      output: { model: "media-vision", frames: [], fullText: "", transcript: { text: "Thanks!", duration: 5.05, language: "en", segments: [{ start: 0, end: 5, text: "Thanks!" }] }, analyzedFrames: 6 },
    });
    expect(text).toContain("Speech transcript (en, 5.05s): Thanks!");
    expect(text).toContain("[0s → 5s] Thanks!");
    expect(text).toContain("On-screen text: _(none)_ (6 frames analyzed)");
  });

  it("tts-wt: audioUrl + alignment 요약", () => {
    const text = formatRequestDetail({
      ...base,
      output: { model: "eleven_v3", voiceId: "v", audioUrl: "https://a/a.mp3", duration: 3.2, alignment: { characters: ["H", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.3] } },
    });
    expect(text).toContain("Audio (3.2s, eleven_v3, voice v): https://a/a.mp3");
    expect(text).toContain("Character alignment: 2 characters, 0s → 0.3s");
  });

  it("voice clone record: data.voice_id", () => {
    const text = formatRequestDetail({ ...base, output: { success: true, data: { voice_id: "xbseed_1", provider: "byteplus", demo_audio_url: "https://a/d.mp3" } } });
    expect(text).toContain("Voice ID: `xbseed_1` (byteplus)");
    expect(text).toContain("Demo audio");
  });

  it("미지의 output 키는 JSON 으로 보존", () => {
    const lines = formatOutput({ weirdKey: { a: 1 } });
    expect(lines.join("\n")).toContain('"weirdKey"');
  });

  it("credits.charged/refunded 표시 + timeout 상태 에러", () => {
    const text = formatRequestDetail({ ...base, status: "timeout", credits: { charged: 1, refunded: 1 }, error: { code: "GENERATION_TIMEOUT", message: "GPU task timed out" } });
    expect(text).toContain("Credits charged**: 1 (refunded 1)");
    expect(text).toContain("GENERATION_TIMEOUT");
    expect(text).toContain("Refunded**: 1 credits");
  });

  it("list_requests: domain/action/status 필터 params + credits 표시", async () => {
    mockedApi.mockResolvedValueOnce({
      data: [{ requestId: "req" + "l".repeat(21), status: "failed", domain: "lora", action: "train", creditCharged: 1, credits: { charged: 1, refunded: 1 }, createdAt: "2026-09-06T01:50:03.000Z" }],
      nextCursor: null,
      hasMore: false,
    });
    const r = await handlers.get("xbrush_list_requests")!({ domain: "lora", action: "train", status: "failed", limit: 5 });
    const a = await lastCall();
    expect(a.params).toEqual({ limit: 5, domain: "lora", action: "train", status: "FAILED" });
    expect(r.content[0].text).toContain("credit: 1 (refunded 1) | 2026-09-06");
  });
});

// ── models: new constraint flags ─────────────────────────────────────

describe("xbrush_list_models — 2026-09 constraints 렌더", () => {
  function model(overrides: Partial<XBrushModel>): XBrushModel {
    return { id: "m", modelType: "m", name: "M", category: "text", featureType: "chat", calType: "perToken", creditInfo: { creditConfig: { inputPer1M: 1, outputPer1M: 2 } }, ...overrides };
  }
  it("text 모델 플래그 (structured output / sampling / stop / reasoning quirks)", async () => {
    mockedApi.mockResolvedValueOnce({
      models: [
        model({ id: "openai/gpt-5.4", constraints: { vision: true, maxImages: 10, tokensPerImage: 3000, functionCalling: true, samplingHonored: false, toolsFixedTokens: 150, forcedChoiceHonored: true, structuredOutputHonored: true, reasoningMinimalMapsToLow: true, toolsRequireReasoningNone: true } }),
        model({ id: "xai/grok-4.3", constraints: { vision: true, stopHonored: false, penaltiesHonored: false, functionCalling: true, reasoningMaxClampsToHigh: true } }),
        model({ id: "openai/gpt-4o", constraints: { vision: true, imageDetailHonored: true, reasoningUnsupported: true, functionCalling: true } }),
        model({ id: "google/gemini-3.5-flash-lite", constraints: { vision: true, reasoningNoneMapsToMinimal: true, functionCalling: true } }),
        model({ id: "z-ai/glm-5.2", constraints: { vision: false, functionCalling: true, forcedChoiceHonored: false, reasoningMidTiersPromoteToHigh: true } }),
      ],
    });
    const r = await handlers.get("xbrush_list_models")!({ category: "text" });
    const text = r.content[0].text as string;
    expect(text).toContain("structured output (response_format)");
    expect(text).toContain("temperature/top_p ignored");
    expect(text).toContain("tools force reasoning none");
    expect(text).toContain("reasoning minimal→low");
    expect(text).toContain("stop ignored");
    expect(text).toContain("penalties ignored");
    expect(text).toContain("reasoning max→high");
    expect(text).toContain("detail honored");
    expect(text).toContain("no reasoning");
    expect(text).toContain("reasoning none→minimal");
    expect(text).toContain("reasoning low/medium→high");
    expect(text).toContain("forced choice NOT honored");
  });

  it("defaultResolution / STT input 제약 / creditConfig boolean 값 렌더", async () => {
    mockedApi.mockResolvedValueOnce({
      models: [
        model({ id: "seedream-5.0-pro", category: "image", featureType: "generate", calType: "byResolution", creditInfo: { creditConfig: { "1K": 0.059, "2K": 0.117 } }, constraints: { defaultResolution: "2K" } }),
        model({ id: "whisper-1", category: "audio", featureType: "stt", calType: "perSecond", creditInfo: { creditValue: 0.00013 }, constraints: { inputFormats: ["wav"], maxAudioBytes: 26214400, returns: ["text"] } }),
        model({ id: "seedream-5.0-pro-edit", category: "image", featureType: "edit", calType: "byResolution", creditInfo: { creditConfig: { "1K": 0.059, freeFirst: true, perInputImage: 0.004 } } }),
      ],
    });
    const r = await handlers.get("xbrush_list_models")!({});
    const text = r.content[0].text as string;
    expect(text).toContain("default 2K");
    expect(text).toContain("input wav");
    expect(text).toContain("max 25 MB");
    expect(text).toContain("freeFirst=true");
  });
});

// ── voice: alias + detail ────────────────────────────────────────────

describe("xbrush_list_voices — 2026-09", () => {
  it("TTS 모델 id → provider 키 매핑", () => {
    expect(normalizeVoiceListModel("eleven-v3")).toBe("eleven");
    expect(normalizeVoiceListModel("speech-2.8-turbo")).toBe("speech-2.8-hd");
    expect(normalizeVoiceListModel("speech-2.8-hd")).toBe("speech-2.8-hd");
    expect(normalizeVoiceListModel("seed-icl-2.0")).toBe("seed-icl-2.0");
  });

  it("model 'eleven-v3' 호출 시 params.model = 'eleven'", async () => {
    mockedApi.mockResolvedValueOnce({ success: true, provider: "elevenlabs", model: "eleven", data: { provider: "elevenlabs", voices: [] } });
    await handlers.get("xbrush_list_voices")!({ model: "eleven-v3" });
    const a = await lastCall();
    expect(a.params.model).toBe("eleven");
  });

  it("seed 제공자 빈 목록 → note + 안내", async () => {
    mockedApi.mockResolvedValueOnce({ success: true, provider: "byteplus", model: "seed-icl-2.0", data: { provider: "byteplus", voices: [], note: "BytePlus Seed voices are tracked in the xbrush ledger; vendor listing is not supported." } });
    const r = await handlers.get("xbrush_list_voices")!({ model: "seed-icl-2.0" });
    const text = r.content[0].text as string;
    expect(text).toContain("vendor listing is not supported");
    expect(text).toContain("xbseed_");
  });

  it("voice_id → GET /v1/voice/{id} 상세 렌더", async () => {
    mockedApi.mockResolvedValueOnce({ voiceId: "xbseed_1", name: "mcp", model: "seed-icl-2.0", provider: "byteplus", demoAudioUrl: "https://a/d.mp3", status: 2, retrainable: true, createdAt: "2026-09-06T01:52:43.275Z" });
    const r = await handlers.get("xbrush_list_voices")!({ voice_id: "xbseed_1" });
    const a = await lastCall();
    expect(a.url).toBe("/v1/voice/xbseed_1");
    expect(a.method).toBe("GET");
    expect(a.timeout).toBe(TIMEOUT_GET);
    const text = r.content[0].text as string;
    expect(text).toContain("Voice `xbseed_1`");
    expect(text).toContain("seed-icl-2.0");
    expect(text).toContain("Retrainable**: yes");
    expect(text).toContain("https://a/d.mp3");
  });
});

// ── moderation / watermark pass-through ──────────────────────────────

describe("moderation threshold/mode, watermark strength", () => {
  it("image moderate: threshold + mode", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "moderate"));
    await handlers.get("xbrush_content_moderate")!({ image_url: IMG, threshold: 0.4, mode: "mosaic" });
    const a = await lastCall();
    expect(a.data).toEqual({ imageUrl: IMG, threshold: 0.4, mode: "mosaic" });
  });
  it("video moderate: threshold 만 (mode 제외)", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("video", "moderate"));
    await handlers.get("xbrush_content_moderate")!({ video_url: VID, threshold: 0.4, mode: "mosaic" });
    const a = await lastCall();
    expect(a.data).toEqual({ videoUrl: VID, threshold: 0.4 });
  });
  it("watermark strength", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC("image", "watermark"));
    await handlers.get("xbrush_watermark_add")!({ image_url: IMG, strength: "low" });
    const a = await lastCall();
    expect(a.data).toEqual({ imageUrl: IMG, strength: "low" });
  });
});

// ── file upload MIME map ─────────────────────────────────────────────

describe("file-upload MIME map — presign allowlist 반영", () => {
  it("신규 확장자 매핑", () => {
    expect(getMimeType("a.svg")).toBe("image/svg+xml");
    expect(getMimeType("a.heic")).toBe("image/heic");
    expect(getMimeType("a.mov")).toBe("video/quicktime");
    expect(getMimeType("a.mkv")).toBe("video/x-matroska");
    expect(getMimeType("a.m4a")).toBe("audio/mp4");
    expect(getMimeType("a.flac")).toBe("audio/flac");
    expect(getMimeType("a.srt")).toBe("application/x-subrip");
    expect(getMimeType("a.vtt")).toBe("text/vtt");
    expect(getMimeType("a.safetensors")).toBe("application/x-safetensors");
    expect(getMimeType("a.zip")).toBe("application/zip");
    expect(getMimeType("a.xyz")).toBe("application/octet-stream");
  });
});
