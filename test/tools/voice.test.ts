import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockServer } from "./_helpers.js";
import type { XBrushVoiceListResponse } from "../../src/types.js";

vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/xbrush-client.js")>(
    "../../src/services/xbrush-client.js"
  );
  return { ...actual, makeApiRequest: vi.fn() };
});

import { makeApiRequest } from "../../src/services/xbrush-client.js";
import { registerVoiceTools } from "../../src/tools/voice.js";

const mockedApi = vi.mocked(makeApiRequest);
let handlers: Map<string, Function>;

beforeAll(() => {
  const mock = createMockServer();
  registerVoiceTools(mock.server);
  handlers = mock.handlers;
});

const resp: XBrushVoiceListResponse = {
  success: true,
  provider: "elevenlabs",
  model: "eleven_v3",
  data: {
    provider: "elevenlabs",
    voices: [
      { voice_id: "v1", name: "JP", category: "cloned", preview_url: "https://x/p.mp3" },
      { voice_id: "v2", name: "Aria", category: "premade" },
    ],
    pagination: { has_more: false, returned_count: 2 },
  },
};

describe("xbrush_list_voices", () => {
  it("voices 요약 렌더 (provider/voice_id/name/category)", async () => {
    mockedApi.mockResolvedValueOnce(resp);
    const result = await handlers.get("xbrush_list_voices")!({});
    const text = result.content[0].text;
    expect(text).toContain("provider: elevenlabs");
    expect(text).toContain("v1");
    expect(text).toContain("JP");
    expect(text).toContain("Aria");
    expect(text).toContain("preview");
  });

  it("model 파라미터 → params.model 전달", async () => {
    mockedApi.mockResolvedValueOnce(resp);
    await handlers.get("xbrush_list_voices")!({ model: "speech-2.8-hd" });
    const args = mockedApi.mock.calls.at(-1)![0] as any;
    expect(args.url).toBe("/v1/voice/list");
    expect(args.params.model).toBe("speech-2.8-hd");
  });

  it("voices 비어있으면 안내 문구", async () => {
    mockedApi.mockResolvedValueOnce({
      success: true,
      provider: "minimax",
      model: "x",
      data: { voices: [] },
    });
    const result = await handlers.get("xbrush_list_voices")!({ model: "x" });
    expect(result.content[0].text).toContain("No voices");
  });

  it("API 에러 → isError", async () => {
    mockedApi.mockRejectedValueOnce(new Error("voice service down"));
    const result = await handlers.get("xbrush_list_voices")!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("voice service down");
  });
});
