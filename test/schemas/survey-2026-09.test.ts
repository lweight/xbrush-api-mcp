/**
 * Schema coverage for the 2026-09 API survey: new image endpoints, video
 * edit/vision, new generate fields, TTS knobs + STT, chat response_format,
 * request filters, voice detail/retrain, watermark strength, moderation
 * threshold.
 */
import { describe, it, expect } from "vitest";
import {
  ImageGenerateSchema,
  ImageEditSchema,
  ImageUpscaleSchema,
  ImageOutpaintSchema,
  ImageInpaintSchema,
  ImageEnhanceSchema,
  ImageLayerSplitSchema,
  ImageSegmentDetectSchema,
  ImageVisionSchema,
  ImageProductLookupSchema,
} from "../../src/schemas/image.js";
import { VideoGenerateSchema, VideoExtendSchema, VideoRetakeSchema, VideoEditSchema, VideoVisionSchema, VideoUpscaleSchema } from "../../src/schemas/video.js";
import { TtsGenerateSchema, MusicGenerateSchema, SttTranscribeSchema, TTS_EMOTIONS } from "../../src/schemas/audio.js";
import { ChatCompletionSchema } from "../../src/schemas/chat.js";
import { ListRequestsSchema } from "../../src/schemas/requests.js";
import { ListVoicesSchema, VoiceCloneSchema } from "../../src/schemas/voice.js";
import { WatermarkAddSchema } from "../../src/schemas/watermark.js";
import { ContentModerateSchema } from "../../src/schemas/moderation.js";

const IMG = "https://assets.xbrush.ai/20260904/a.png";
const VID = "https://assets.xbrush.ai/postprocess/a.mp4";
const WAV = "https://assets.xbrush.ai/pub-api/x/a.wav";

describe("ImageGenerateSchema — 2026-09 신규 필드", () => {
  const base = { model: "flux.2-pro", prompt: "a cat" };
  it("idea/cfg/guidance_scale/scheduler/sampler/background/trigger_word 수용", () => {
    const r = ImageGenerateSchema.parse({
      ...base,
      idea: "고양이",
      cfg: 7,
      guidance_scale: 3.5,
      scheduler: "simple",
      sampler: "euler",
      background: "transparent",
      trigger_word: "TOK",
    });
    expect(r.cfg).toBe(7);
    expect(r.background).toBe("transparent");
  });
  it("cfg 범위(0-20) / guidance_scale(0-50) / background enum", () => {
    expect(() => ImageGenerateSchema.parse({ ...base, cfg: 21 })).toThrow();
    expect(() => ImageGenerateSchema.parse({ ...base, guidance_scale: 51 })).toThrow();
    expect(() => ImageGenerateSchema.parse({ ...base, background: "blur" })).toThrow();
  });
});

describe("ImageEditSchema — 2026-09", () => {
  const base = { model: "gpt-image-2-edit", prompt: "add hat", image_url: IMG };
  it("image_urls 최대 9 (서버 상한)", () => {
    expect(ImageEditSchema.parse({ ...base, image_urls: Array(9).fill(IMG) }).image_urls).toHaveLength(9);
    expect(() => ImageEditSchema.parse({ ...base, image_urls: Array(10).fill(IMG) })).toThrow();
  });
  it("idea/negative_prompt/background/guidance_scale/sampler 수용, mode는 deprecated지만 수용", () => {
    const r = ImageEditSchema.parse({ ...base, idea: "모자", negative_prompt: "blur", background: "opaque", guidance_scale: 2, sampler: "x", mode: "inpaint" });
    expect(r.mode).toBe("inpaint");
    expect(r.negative_prompt).toBe("blur");
  });
});

describe("ImageUpscaleSchema — factor 1.5-4 실수 + target_height", () => {
  it("2.5 유효, 1.4/4.1 거부", () => {
    expect(ImageUpscaleSchema.parse({ image_url: IMG, upscale_factor: 2.5 }).upscale_factor).toBe(2.5);
    expect(() => ImageUpscaleSchema.parse({ image_url: IMG, upscale_factor: 1.4 })).toThrow();
    expect(() => ImageUpscaleSchema.parse({ image_url: IMG, upscale_factor: 4.1 })).toThrow();
  });
  it("target_height 256-8192 정수", () => {
    expect(ImageUpscaleSchema.parse({ image_url: IMG, target_height: 2048 }).target_height).toBe(2048);
    expect(() => ImageUpscaleSchema.parse({ image_url: IMG, target_height: 255 })).toThrow();
    expect(() => ImageUpscaleSchema.parse({ image_url: IMG, target_height: 8193 })).toThrow();
    expect(() => ImageUpscaleSchema.parse({ image_url: IMG, target_height: 1000.5 })).toThrow();
  });
});

describe("ImageOutpaintSchema", () => {
  it("canvas 필수, 64-4096 정수", () => {
    const r = ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 1792, canvas_height: 1408, scale: 0.8, prompt: "table", resolution: "2K" });
    expect(r.canvas_width).toBe(1792);
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG })).toThrow();
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 63, canvas_height: 64 })).toThrow();
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 4097, canvas_height: 64 })).toThrow();
  });
  it("scale 0.05-4, resolution enum", () => {
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 100, canvas_height: 100, scale: 0.04 })).toThrow();
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 100, canvas_height: 100, scale: 4.1 })).toThrow();
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 100, canvas_height: 100, resolution: "8K" })).toThrow();
  });
  it("sync/미정의 필드 거부", () => {
    expect(() => ImageOutpaintSchema.parse({ image_url: IMG, canvas_width: 100, canvas_height: 100, sync: true })).toThrow();
  });
});

describe("ImageInpaintSchema", () => {
  it("mask 필수 (URL / data URL / base64 모두 문자열)", () => {
    expect(ImageInpaintSchema.parse({ image_url: IMG, mask: "https://x/m.png" }).mask).toContain("http");
    expect(ImageInpaintSchema.parse({ image_url: IMG, mask: "data:image/png;base64,iVBORw0KGgo=" }).mask).toContain("data:");
    expect(ImageInpaintSchema.parse({ image_url: IMG, mask: "iVBORw0KGgoAAAANSUhEUg==" }).mask).toBeTruthy();
    expect(() => ImageInpaintSchema.parse({ image_url: IMG })).toThrow();
    expect(() => ImageInpaintSchema.parse({ image_url: IMG, mask: "short" })).toThrow();
  });
  it("num_inference_steps 1-100, expand 0-128, resolution enum", () => {
    const ok = { image_url: IMG, mask: "https://x/m.png" };
    expect(ImageInpaintSchema.parse({ ...ok, num_inference_steps: 30, expand: 16, resolution: "1K", seed: 1 }).expand).toBe(16);
    expect(() => ImageInpaintSchema.parse({ ...ok, num_inference_steps: 0 })).toThrow();
    expect(() => ImageInpaintSchema.parse({ ...ok, num_inference_steps: 101 })).toThrow();
    expect(() => ImageInpaintSchema.parse({ ...ok, expand: 129 })).toThrow();
    expect(() => ImageInpaintSchema.parse({ ...ok, resolution: "3K" })).toThrow();
  });
});

describe("ImageEnhanceSchema / ImageLayerSplitSchema", () => {
  it("enhance: n 1-4", () => {
    expect(ImageEnhanceSchema.parse({ image_url: IMG, mode: "auto", n: 4, seed: 3 }).n).toBe(4);
    expect(() => ImageEnhanceSchema.parse({ image_url: IMG, n: 5 })).toThrow();
    expect(() => ImageEnhanceSchema.parse({ image_url: IMG, n: 0 })).toThrow();
  });
  it("layer-split: size enum 1K/2K, prompt ≤1000, model free-form", () => {
    expect(ImageLayerSplitSchema.parse({ image_url: IMG, model: "qwen-image-layered", size: "2K", prompt: "split" }).size).toBe("2K");
    expect(() => ImageLayerSplitSchema.parse({ image_url: IMG, size: "4K" })).toThrow();
    expect(() => ImageLayerSplitSchema.parse({ image_url: IMG, prompt: "x".repeat(1001) })).toThrow();
  });
});

describe("Sync utility schemas (segment/vision/product)", () => {
  it("segment: prompt 필수 1-120", () => {
    expect(ImageSegmentDetectSchema.parse({ image_url: IMG, prompt: "lettuce" }).prompt).toBe("lettuce");
    expect(() => ImageSegmentDetectSchema.parse({ image_url: IMG })).toThrow();
    expect(() => ImageSegmentDetectSchema.parse({ image_url: IMG, prompt: "x".repeat(121) })).toThrow();
  });
  it("vision: data URL 허용 + mode enum", () => {
    expect(ImageVisionSchema.parse({ image_url: "data:image/png;base64,AAAA", mode: "document" }).mode).toBe("document");
    expect(() => ImageVisionSchema.parse({ image_url: IMG, mode: "ocr" })).toThrow();
    expect(() => ImageVisionSchema.parse({ image_url: "short" })).toThrow();
  });
  it("product: language / mode enum", () => {
    expect(ImageProductLookupSchema.parse({ image_url: IMG, language: "ko", mode: "grounded" }).mode).toBe("grounded");
    expect(() => ImageProductLookupSchema.parse({ image_url: IMG, language: "fr" })).toThrow();
    expect(() => ImageProductLookupSchema.parse({ image_url: IMG, mode: "deep" })).toThrow();
  });
});

describe("VideoGenerateSchema — 2026-09 신규 필드", () => {
  const base = { model: "seedance-2.5", prompt: "walk" };
  it("negative_prompt/audio_url/width/height/fps/steps/acceleration/seed 수용, duration 30 허용", () => {
    const r = VideoGenerateSchema.parse({ ...base, negative_prompt: "blur", audio_url: VID, width: 1280, height: 720, fps: 24, steps: 30, acceleration: "high", seed: 7, duration: 30, aspect_ratio: "custom" });
    expect(r.acceleration).toBe("high");
    expect(r.duration).toBe(30);
  });
  it("acceleration enum / width 범위", () => {
    expect(() => VideoGenerateSchema.parse({ ...base, acceleration: "turbo" })).toThrow();
    expect(() => VideoGenerateSchema.parse({ ...base, width: 32 })).toThrow();
  });
  it("deprecated end_image_url / prompt_relevance 는 여전히 수용 (서버 무시)", () => {
    const r = VideoGenerateSchema.parse({ ...base, end_image_url: IMG, prompt_relevance: 0.5 });
    expect(r.end_image_url).toBe(IMG);
  });
});

describe("VideoExtend/Retake/Upscale — 2026-09", () => {
  it("extend: prompt/idea/resolution/style/generate_audio/start_time/seed 수용 + enum", () => {
    const r = VideoExtendSchema.parse({ model: "pixverse-v6-extend", video_url: VID, duration: 5, prompt: "go", resolution: "1080p", style: "anime", generate_audio: true, start_time: 2, seed: 1, negative_prompt: "x" });
    expect(r.style).toBe("anime");
    expect(() => VideoExtendSchema.parse({ model: "m", video_url: VID, duration: 5, resolution: "4k" })).toThrow();
    expect(() => VideoExtendSchema.parse({ model: "m", video_url: VID, duration: 5, style: "noir" })).toThrow();
  });
  it("retake: end_time ≤40, start_time 0-20, prompt/idea", () => {
    expect(VideoRetakeSchema.parse({ model: "ltx-2.3-retake", video_url: VID, end_time: 40, start_time: 20, prompt: "p" }).start_time).toBe(20);
    expect(() => VideoRetakeSchema.parse({ model: "m", video_url: VID, end_time: 41 })).toThrow();
    expect(() => VideoRetakeSchema.parse({ model: "m", video_url: VID, end_time: 10, start_time: 21 })).toThrow();
  });
  it("upscale: model free-form (서버 enum realesrgan/seedvr)", () => {
    expect(VideoUpscaleSchema.parse({ video_url: VID, scale: 2, model: "seedvr" }).model).toBe("seedvr");
  });
});

describe("VideoEditSchema / VideoVisionSchema", () => {
  it("edit: prompt 또는 idea 중 하나 필수, audio enum, video_url ≤2048", () => {
    expect(VideoEditSchema.parse({ model: "gemini-omni-1.1-flash", video_url: VID, prompt: "bw", audio: "source" }).audio).toBe("source");
    expect(VideoEditSchema.parse({ model: "gemini-omni-1.1-flash", video_url: VID, idea: "흑백" }).idea).toBe("흑백");
    expect(() => VideoEditSchema.parse({ model: "gemini-omni-1.1-flash", video_url: VID })).toThrow();
    expect(() => VideoEditSchema.parse({ model: "m", video_url: VID, prompt: "x", audio: "mute" })).toThrow();
    expect(() => VideoEditSchema.parse({ model: "m", video_url: VID, prompt: "x".repeat(4001) })).toThrow();
    expect(() => VideoEditSchema.parse({ model: "m", video_url: "https://x/" + "a".repeat(2048), prompt: "x" })).toThrow();
  });
  it("vision: language 2글자", () => {
    expect(VideoVisionSchema.parse({ video_url: VID, language: "ko" }).language).toBe("ko");
    expect(() => VideoVisionSchema.parse({ video_url: VID, language: "kor" })).toThrow();
    expect(() => VideoVisionSchema.parse({ video_url: "nope" })).toThrow();
  });
});

describe("TtsGenerateSchema — 2026-09 knobs", () => {
  const base = { text: "hi" };
  it("pitch/style/emotion/output_format/with_timestamps 수용", () => {
    const r = TtsGenerateSchema.parse({ ...base, pitch: 2, style: 0.5, emotion: "happy", output_format: "wav", with_timestamps: true });
    expect(r.emotion).toBe("happy");
    expect(r.with_timestamps).toBe(true);
  });
  it("emotion enum 9종 / pitch ±12 / style 0-1 / text ≤10000", () => {
    expect(TTS_EMOTIONS).toHaveLength(9);
    expect(() => TtsGenerateSchema.parse({ ...base, emotion: "excited" })).toThrow();
    expect(() => TtsGenerateSchema.parse({ ...base, pitch: 13 })).toThrow();
    expect(() => TtsGenerateSchema.parse({ ...base, style: 1.1 })).toThrow();
    expect(() => TtsGenerateSchema.parse({ text: "x".repeat(10001) })).toThrow();
  });
  it("language 는 deprecated 지만 수용", () => {
    expect(TtsGenerateSchema.parse({ ...base, language: "ko" }).language).toBe("ko");
  });
});

describe("MusicGenerateSchema — image_url", () => {
  it("image_url URL 검증", () => {
    expect(MusicGenerateSchema.parse({ prompt: "p", image_url: IMG }).image_url).toBe(IMG);
    expect(() => MusicGenerateSchema.parse({ prompt: "p", image_url: "x" })).toThrow();
  });
});

describe("SttTranscribeSchema", () => {
  it("audio_url 필수, language ISO-639-1 소문자 2글자", () => {
    expect(SttTranscribeSchema.parse({ audio_url: WAV, language: "en" }).language).toBe("en");
    expect(() => SttTranscribeSchema.parse({})).toThrow();
    expect(() => SttTranscribeSchema.parse({ audio_url: WAV, language: "EN" })).toThrow();
    expect(() => SttTranscribeSchema.parse({ audio_url: WAV, language: "eng" })).toThrow();
    expect(() => SttTranscribeSchema.parse({ audio_url: WAV, sync: true })).toThrow();
  });
});

describe("ChatCompletionSchema — response_format + reasoning low/medium", () => {
  const MSG = { role: "user", content: "hi" };
  it("json_object / json_schema 수용", () => {
    expect(ChatCompletionSchema.parse({ model: "m", messages: [MSG], response_format: { type: "json_object" } }).response_format).toEqual({ type: "json_object" });
    const r = ChatCompletionSchema.parse({
      model: "m",
      messages: [MSG],
      response_format: { type: "json_schema", json_schema: { name: "city", schema: { type: "object" }, strict: true } },
    });
    expect(r.response_format?.type).toBe("json_schema");
  });
  it("잘못된 response_format 거부 (type 외 값, name 누락)", () => {
    expect(() => ChatCompletionSchema.parse({ model: "m", messages: [MSG], response_format: { type: "text" } })).toThrow();
    expect(() => ChatCompletionSchema.parse({ model: "m", messages: [MSG], response_format: { type: "json_schema" } })).toThrow();
    expect(() => ChatCompletionSchema.parse({ model: "m", messages: [MSG], response_format: { type: "json_schema", json_schema: { schema: {} } } })).toThrow();
  });
  it("reasoning_effort low/medium 수용 (2026-09 enum 확장)", () => {
    for (const e of ["none", "minimal", "low", "medium", "high", "max"]) {
      expect(ChatCompletionSchema.parse({ model: "m", messages: [MSG], reasoning_effort: e }).reasoning_effort).toBe(e);
    }
  });
});

describe("ListRequestsSchema — 필터", () => {
  it("domain/action/status 수용, status 는 대문자 정규화", () => {
    const r = ListRequestsSchema.parse({ domain: "media", action: "ffmpeg", status: "completed" });
    expect(r.status).toBe("COMPLETED");
    expect(ListRequestsSchema.parse({ status: "TIMEOUT" }).status).toBe("TIMEOUT");
  });
  it("status enum 외 거부", () => {
    expect(() => ListRequestsSchema.parse({ status: "done" })).toThrow();
  });
});

describe("Voice schemas — 2026-09", () => {
  it("list: voice_id 수용", () => {
    expect(ListVoicesSchema.parse({ voice_id: "xbseed_1" }).voice_id).toBe("xbseed_1");
  });
  it("clone: voice_id 는 xbseed_* 만", () => {
    const base = { name: "n", audio_urls: [WAV] };
    expect(VoiceCloneSchema.parse({ ...base, voice_id: "xbseed_abc", model: "seed-icl-2.0" }).voice_id).toBe("xbseed_abc");
    expect(() => VoiceCloneSchema.parse({ ...base, voice_id: "moss_audio_abc" })).toThrow();
  });
});

describe("Watermark strength / Moderation threshold", () => {
  it("watermark strength enum", () => {
    expect(WatermarkAddSchema.parse({ image_url: IMG, strength: "high" }).strength).toBe("high");
    expect(() => WatermarkAddSchema.parse({ image_url: IMG, strength: "max" })).toThrow();
  });
  it("moderation threshold 0-1, mode mosaic", () => {
    expect(ContentModerateSchema.parse({ image_url: IMG, threshold: 0.5, mode: "mosaic" }).threshold).toBe(0.5);
    expect(() => ContentModerateSchema.parse({ image_url: IMG, threshold: 1.5 })).toThrow();
    expect(() => ContentModerateSchema.parse({ image_url: IMG, mode: "blur" })).toThrow();
  });
});
