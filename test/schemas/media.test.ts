import { describe, it, expect } from "vitest";
import {
  MediaFfmpegSchema,
  MediaImageProcessSchema,
  MediaGraphSchema,
  MediaInfoSchema,
  FFMPEG_OPS,
  IMAGE_PROCESS_OPS,
} from "../../src/schemas/media.js";

const VID = "https://assets.xbrush.ai/postprocess/a.mp4";
const IMG = "https://assets.xbrush.ai/20260904/a.png";

describe("MediaFfmpegSchema", () => {
  it("trim + output 유효", () => {
    const r = MediaFfmpegSchema.parse({
      inputs: [VID],
      operations: [{ op: "trim", start: 0, end: 2 }],
      output: { format: "mp4", fps: 30 },
    });
    expect(r.operations[0].op).toBe("trim");
    expect(r.output?.format).toBe("mp4");
  });

  it("op enum 15종 모두 수용", () => {
    for (const op of FFMPEG_OPS) {
      expect(MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op }] }).operations[0].op).toBe(op);
    }
    expect(FFMPEG_OPS).toHaveLength(15);
  });

  it("미지의 op 거부", () => {
    expect(() => MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "explode" }] })).toThrow();
  });

  it("inputs 0개 / 11개 거부", () => {
    expect(() => MediaFfmpegSchema.parse({ inputs: [], operations: [{ op: "trim" }] })).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: Array(11).fill(VID), operations: [{ op: "trim" }] })
    ).toThrow();
  });

  it("operations 0개 / 21개 거부", () => {
    expect(() => MediaFfmpegSchema.parse({ inputs: [VID], operations: [] })).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: Array(21).fill({ op: "trim" }) })
    ).toThrow();
  });

  it("codec/position/degrees/type/style enum 검증", () => {
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "transcode", codec: "av1" }] })
    ).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "watermark", position: "middle" }] })
    ).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "rotate", degrees: 45 }] })
    ).toThrow();
    expect(
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "rotate", degrees: 90 }] }).operations[0]
        .degrees
    ).toBe(90);
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "fade", type: "cross" }] })
    ).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "subtitle", style: "fancy" }] })
    ).toThrow();
  });

  it("output.format enum / fps 범위", () => {
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "trim" }], output: { format: "avi" } })
    ).toThrow();
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "trim" }], output: { fps: 121 } })
    ).toThrow();
  });

  it("미정의 op 파라미터 거부 (strict)", () => {
    expect(() =>
      MediaFfmpegSchema.parse({ inputs: [VID], operations: [{ op: "trim", bogus: 1 }] })
    ).toThrow();
  });
});

describe("MediaImageProcessSchema", () => {
  it("resize + output 유효", () => {
    const r = MediaImageProcessSchema.parse({
      inputs: [IMG],
      operations: [{ op: "resize", width: 256, fit: "contain" }],
      output: { format: "webp", quality: 80 },
    });
    expect(r.operations[0].width).toBe(256);
  });

  it("op enum 37종 수용", () => {
    expect(IMAGE_PROCESS_OPS).toHaveLength(37);
    for (const op of IMAGE_PROCESS_OPS) {
      expect(MediaImageProcessSchema.parse({ inputs: [IMG], operations: [{ op }] }).operations[0].op).toBe(op);
    }
  });

  it("inputs 7개 / operations 11개 거부", () => {
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: Array(7).fill(IMG), operations: [{ op: "resize" }] })
    ).toThrow();
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: [IMG], operations: Array(11).fill({ op: "resize" }) })
    ).toThrow();
  });

  it("범위 검증 (width ≤12000, size 8-512, brightness ±100, sigma 0.1-10, quality 1-100)", () => {
    const bad = [
      { op: "resize", width: 12001 },
      { op: "text", size: 4 },
      { op: "adjust", brightness: 101 },
      { op: "blur", sigma: 11 },
      { op: "stack", columns: 7 },
      { op: "composite", opacity: 0 },
    ];
    for (const o of bad) {
      expect(() => MediaImageProcessSchema.parse({ inputs: [IMG], operations: [o] })).toThrow();
    }
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: [IMG], operations: [{ op: "resize" }], output: { quality: 0 } })
    ).toThrow();
  });

  it("gravity/fit/direction/mode/method enum", () => {
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: [IMG], operations: [{ op: "crop", gravity: "left" }] })
    ).toThrow();
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: [IMG], operations: [{ op: "resize", fit: "crop" }] })
    ).toThrow();
    expect(() =>
      MediaImageProcessSchema.parse({ inputs: [IMG], operations: [{ op: "straighten_document", method: "magic" }] })
    ).toThrow();
  });
});

describe("MediaGraphSchema", () => {
  const base = {
    inputs: [{ id: "a", url: VID }],
    nodes: [{ id: "n1", op: "trim", from: { in: "a" }, params: { start: 0, duration: 1 } }],
    output: { from: "n1", format: "mp4" },
  };

  it("기본 그래프 유효", () => {
    const r = MediaGraphSchema.parse(base);
    expect(r.nodes[0].from).toEqual({ in: "a" });
    expect(r.output.from).toBe("n1");
  });

  it("포트 배열(concat) + 다중 포트(overlay) 유효", () => {
    const r = MediaGraphSchema.parse({
      inputs: [
        { id: "a", url: VID },
        { id: "b", url: VID },
      ],
      nodes: [
        { id: "c", op: "concat", from: { in: ["a", "b"] } },
        { id: "o", op: "overlay", from: { base: "c", over: "a" }, params: { position: "top-right" } },
      ],
      output: { from: "o" },
    });
    expect(r.nodes[0].from).toEqual({ in: ["a", "b"] });
  });

  it("id 규칙 위반 거부 (대문자/공백/33자)", () => {
    expect(() => MediaGraphSchema.parse({ ...base, inputs: [{ id: "A", url: VID }] })).toThrow();
    expect(() =>
      MediaGraphSchema.parse({ ...base, nodes: [{ id: "n 1", op: "trim" }] })
    ).toThrow();
    expect(() =>
      MediaGraphSchema.parse({ ...base, nodes: [{ id: "a".repeat(33), op: "trim" }] })
    ).toThrow();
  });

  it("op는 free-form (서버 검증 위임)", () => {
    expect(MediaGraphSchema.parse({ ...base, nodes: [{ id: "n1", op: "zoompan" }] }).nodes[0].op).toBe("zoompan");
  });

  it("output.from 누락 / format enum 외 거부", () => {
    expect(() => MediaGraphSchema.parse({ ...base, output: { format: "mp4" } })).toThrow();
    expect(() => MediaGraphSchema.parse({ ...base, output: { from: "n1", format: "mov" } })).toThrow();
  });

  it("nodes 미정의 필드 거부 (strict — params 안에 넣어야 함)", () => {
    expect(() =>
      MediaGraphSchema.parse({ ...base, nodes: [{ id: "n1", op: "trim", start: 0 }] })
    ).toThrow();
  });
});

describe("MediaInfoSchema", () => {
  it("url 필수 + URL 검증", () => {
    expect(MediaInfoSchema.parse({ url: VID }).url).toBe(VID);
    expect(() => MediaInfoSchema.parse({})).toThrow();
    expect(() => MediaInfoSchema.parse({ url: "nope" })).toThrow();
  });
});
