import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerMediaTools, formatMediaInfo } from "../../src/tools/media.js";
import { TIMEOUT_ASYNC_POST, TIMEOUT_SYNC_UTILITY } from "../../src/constants.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;
let configs: Map<string, any>;

const VID = "https://assets.xbrush.ai/postprocess/a.mp4";
const IMG = "https://assets.xbrush.ai/20260904/a.png";
const ASYNC = {
  requestId: "req" + "m".repeat(21),
  status: "pending",
  domain: "media",
  action: "ffmpeg",
  creditCharged: 0.002,
  estimatedTimeout: 900,
  pollUrl: "/v1/requests/req" + "m".repeat(21),
};

beforeAll(() => {
  const mock = createMockServer();
  registerMediaTools(mock.server);
  handlers = mock.handlers;
  configs = mock.configs;
});

describe("media tools 등록", () => {
  it("4개 도구 (ffmpeg / image_process / graph 는 생성형, media_info 는 read-only)", () => {
    expect([...handlers.keys()].sort()).toEqual([
      "xbrush_media_ffmpeg",
      "xbrush_media_graph",
      "xbrush_media_image_process",
      "xbrush_media_info",
    ]);
    for (const n of ["xbrush_media_ffmpeg", "xbrush_media_graph", "xbrush_media_image_process"]) {
      expect(configs.get(n).annotations.idempotentHint).toBe(false);
      expect(configs.get(n).annotations.readOnlyHint).toBe(false);
    }
    expect(configs.get("xbrush_media_info").annotations.readOnlyHint).toBe(true);
    expect(configs.get("xbrush_media_info").annotations.idempotentHint).toBe(true);
  });
});

describe("xbrush_media_ffmpeg", () => {
  it("POST /v1/media/ffmpeg — operations 그대로(undefined 제거) + async 결과", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC);
    const result = await handlers.get("xbrush_media_ffmpeg")!({
      inputs: [VID],
      operations: [{ op: "trim", start: 0, end: 2 }, { op: "extract-audio" }],
      output: { format: "wav" },
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.method).toBe("POST");
    expect(args.url).toBe("/v1/media/ffmpeg");
    expect(args.timeout).toBe(TIMEOUT_ASYNC_POST);
    expect(args.data).toEqual({
      inputs: [VID],
      operations: [{ op: "trim", start: 0, end: 2 }, { op: "extract-audio" }],
      output: { format: "wav" },
    });
    expect(result.content[0].text).toContain("submitted (async)");
    expect(result.content[0].text).toContain(ASYNC.requestId);
  });

  it("output 생략 시 body 에 output 키 없음", async () => {
    mockedApi.mockResolvedValueOnce(ASYNC);
    await handlers.get("xbrush_media_ffmpeg")!({ inputs: [VID], operations: [{ op: "gif", fps: 10 }] });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.data).not.toHaveProperty("output");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("입력 0의 메타데이터를 확인할 수 없습니다"));
    const result = await handlers.get("xbrush_media_ffmpeg")!({ inputs: [VID], operations: [{ op: "trim" }] });
    expect(result.isError).toBe(true);
  });
});

describe("xbrush_media_image_process", () => {
  it("POST /v1/media/image", async () => {
    mockedApi.mockResolvedValueOnce({ ...ASYNC, action: "image" });
    await handlers.get("xbrush_media_image_process")!({
      inputs: [IMG],
      operations: [{ op: "resize", width: 256 }],
      output: { format: "webp", quality: 80 },
    });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/media/image");
    expect(args.data).toEqual({
      inputs: [IMG],
      operations: [{ op: "resize", width: 256 }],
      output: { format: "webp", quality: 80 },
    });
  });
});

describe("xbrush_media_graph", () => {
  it("POST /v1/media/graph — inputs/nodes/output 그대로", async () => {
    mockedApi.mockResolvedValueOnce({ ...ASYNC, action: "graph" });
    const body = {
      inputs: [{ id: "a", url: VID }],
      nodes: [{ id: "n1", op: "trim", from: { in: "a" }, params: { start: 0, duration: 1 } }],
      output: { from: "n1", format: "mp4" },
    };
    await handlers.get("xbrush_media_graph")!(body);
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/media/graph");
    expect(args.data).toEqual(body);
  });
});

describe("xbrush_media_info (동기 GET, 무과금)", () => {
  it("GET /v1/media/info?url= + 비디오 메타 렌더", async () => {
    mockedApi.mockResolvedValueOnce({
      width: 1280,
      height: 720,
      fps: 24,
      durationInSeconds: 5.041666,
      hasVideo: true,
      hasAudio: true,
      sizeBytes: 1567347,
      videoCodec: "avc",
    });
    const result = await handlers.get("xbrush_media_info")!({ url: VID });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.method).toBe("GET");
    expect(args.url).toBe("/v1/media/info");
    expect(args.params).toEqual({ url: VID });
    expect(args.timeout).toBe(TIMEOUT_SYNC_UTILITY);
    const text = result.content[0].text as string;
    expect(text).toContain("video");
    expect(text).toContain("1280×720");
    expect(text).toContain("5.042s");
    expect(text).toContain("avc");
    expect(text).toContain("audio yes");
  });

  it("이미지 메타 렌더", () => {
    const text = formatMediaInfo(
      { kind: "image", format: "png", width: 1408, height: 1408, frames: 1, hasAlpha: false, sizeBytes: 3893653 },
      IMG
    );
    expect(text).toContain("image");
    expect(text).toContain("png");
    expect(text).toContain("1408×1408");
    expect(text).toContain("Alpha**: no");
  });

  it("읽기 실패(200 + error) → 안내", () => {
    const text = formatMediaInfo({ error: "metadata를 확인할 수 없습니다", url: VID }, VID);
    expect(text).toContain("unreadable");
    expect(text).toContain("metadata를 확인할 수 없습니다");
  });
});
