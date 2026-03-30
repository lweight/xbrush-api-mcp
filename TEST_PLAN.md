# XBrush API MCP 테스트 기획서

## 1. 환경 설정

### 1.1 의존성 추가

```bash
npm install -D vitest
```

### 1.2 Vitest 설정

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 1.3 package.json 스크립트

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 1.4 디렉토리 구조

```
test/
├── schemas/                    # Tier 1: Zod 스키마 검증
│   ├── image.test.ts
│   ├── requests.test.ts
│   ├── models.test.ts
│   └── file-upload.test.ts
├── services/                   # Tier 2: 유틸리티 단위 테스트
│   └── xbrush-client.test.ts
├── tools/                      # Tier 3: 도구 핸들러 테스트
│   ├── image.test.ts
│   ├── requests.test.ts
│   ├── models.test.ts
│   └── file-upload.test.ts
└── integration/                # Tier 4: MCP 프로토콜 통합 테스트
    └── server.test.ts
```

---

## 2. Tier 1 — Zod 스키마 검증 (10개 파일, ~45 케이스)

API 키 불필요, 외부 의존성 없음. 가장 빠르고 안정적.

### 2.1 `test/schemas/image.test.ts`

대상: `src/schemas/image.ts` — `ImageGenerateSchema`, `ImageEditSchema`, `ImageUpscaleSchema`, `ImageRemoveBgSchema`

#### ImageGenerateSchema (8케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 필수 필드만으로 유효 | `{ model: "z-image-turbo", prompt: "a cat" }` | parse 성공, 옵션필드 undefined |
| 2 | 전체 필드 유효 | 모든 필드 포함 (n=4, width=1024 등) | parse 성공 |
| 3 | prompt 누락 | `{ model: "x" }` | ZodError (required) |
| 4 | model 누락 | `{ prompt: "x" }` | ZodError (required) |
| 5 | width 범위 미달 | `{ ..., width: 100 }` | ZodError (min 256) |
| 6 | width 범위 초과 | `{ ..., width: 5000 }` | ZodError (max 4096) |
| 7 | n 범위 초과 | `{ ..., n: 10 }` | ZodError (max 8) |
| 8 | 미정의 필드 거부 (strict) | `{ ..., unknown_field: true }` | ZodError (unrecognized_keys) |

#### ImageEditSchema (5케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 필수 필드 유효 | `{ model, prompt, image_url: "https://..." }` | parse 성공 |
| 2 | image_url이 URL 아님 | `{ ..., image_url: "not-a-url" }` | ZodError (invalid_string) |
| 3 | mask_url이 URL 아님 | `{ ..., mask_url: "bad" }` | ZodError |
| 4 | 옵션 전체 포함 유효 | mask_url, width, height, seed, n 포함 | parse 성공 |
| 5 | 미정의 필드 거부 | `{ ..., style: "anime" }` | ZodError |

#### ImageUpscaleSchema (4케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 필수 필드만 유효 | `{ image_url: "https://..." }` | parse 성공, upscale_factor undefined |
| 2 | upscale_factor=4 유효 | `{ image_url, upscale_factor: 4 }` | parse 성공 |
| 3 | upscale_factor=5 거부 | `{ image_url, upscale_factor: 5 }` | ZodError (max 4) |
| 4 | upscale_factor=1 거부 | `{ image_url, upscale_factor: 1 }` | ZodError (min 2) |

#### ImageRemoveBgSchema (3케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 유효한 URL | `{ image_url: "https://..." }` | parse 성공 |
| 2 | URL 아닌 문자열 | `{ image_url: "not-url" }` | ZodError |
| 3 | 미정의 필드 거부 | `{ image_url: "https://...", format: "png" }` | ZodError |

### 2.2 `test/schemas/requests.test.ts`

대상: `src/schemas/requests.ts` — `GetRequestSchema`, `ListRequestsSchema`, `CheckHealthSchema`

#### GetRequestSchema (4케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 유효한 request_id (24자) | `{ request_id: "req" + "a".repeat(21) }` | parse 성공 |
| 2 | 짧은 request_id | `{ request_id: "req123" }` | ZodError (min 24) |
| 3 | request_id 누락 | `{}` | ZodError (required) |
| 4 | 미정의 필드 거부 | `{ request_id: "...", verbose: true }` | ZodError |

#### ListRequestsSchema (4케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 빈 객체 유효 | `{}` | parse 성공 (모두 optional) |
| 2 | limit=50 유효 | `{ limit: 50 }` | parse 성공 |
| 3 | limit=0 거부 | `{ limit: 0 }` | ZodError (min 1) |
| 4 | limit=101 거부 | `{ limit: 101 }` | ZodError (max 100) |

#### CheckHealthSchema (2케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 빈 객체 유효 | `{}` | parse 성공 |
| 2 | 아무 필드나 거부 | `{ foo: "bar" }` | ZodError |

### 2.3 `test/schemas/models.test.ts`

대상: `src/schemas/models.ts` — `ListModelsSchema`

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 빈 객체 유효 | `{}` | parse 성공 |
| 2 | category="image" | `{ category: "image" }` | parse 성공 |
| 3 | category="video" | `{ category: "video" }` | parse 성공 |
| 4 | category="audio" | `{ category: "audio" }` | parse 성공 |
| 5 | 잘못된 category | `{ category: "text" }` | ZodError (invalid_enum_value) |
| 6 | 미정의 필드 거부 | `{ category: "image", page: 1 }` | ZodError |

### 2.4 `test/schemas/file-upload.test.ts`

대상: `src/schemas/file-upload.ts` — `FileUploadSchema`

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 유효한 경로 | `{ file_path: "/tmp/image.png" }` | parse 성공 |
| 2 | file_path 누락 | `{}` | ZodError (required) |
| 3 | 미정의 필드 거부 | `{ file_path: "/tmp/x.png", overwrite: true }` | ZodError |

---

## 3. Tier 2 — 서비스 유틸리티 단위 테스트 (~20 케이스)

### 3.1 `test/services/xbrush-client.test.ts`

대상: `src/services/xbrush-client.ts`의 내보낸 함수들

#### buildToolResult (4케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | 일반 텍스트 반환 | `buildToolResult("hello")` | `{ content: [{ type: "text", text: "hello" }], isError: false }` |
| 2 | isError=true 전달 | `buildToolResult("err", true)` | `isError: true` |
| 3 | CHARACTER_LIMIT 이하 미절삭 | 25,000자 문자열 | text.length === 25000, "truncated" 미포함 |
| 4 | CHARACTER_LIMIT 초과 절삭 | 30,000자 문자열 | text에 "truncated" 포함, "30000" 포함 |

#### handleApiError (6케이스)

`AxiosError`를 직접 생성하기 어려우므로, mock 객체로 테스트.

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | AxiosError + 구조화된 에러 응답 | `{ response: { status: 401, data: { error: { code: "INVALID_API_KEY", message: "Bad key" }}}}` | `XBrushApiError(401, "INVALID_API_KEY", ...)`, suggestion에 "xbrush.ai" 포함 |
| 2 | AxiosError + 비구조화 응답 | `{ response: { status: 500, data: "Internal error" }}` | `XBrushApiError(500, "HTTP_500", ...)` |
| 3 | AxiosError + 429 | `{ response: { status: 429, data: {} }}` | suggestion에 "Rate limit" 포함 |
| 4 | 타임아웃 에러 | `{ code: "ECONNABORTED", isAxiosError: true }` | `code === "TIMEOUT"` |
| 5 | 일반 Error | `new Error("network fail")` | `code === "UNKNOWN"`, message에 "network fail" |
| 6 | 문자열 에러 | `"something broke"` | `code === "UNKNOWN"` |

#### handleToolError (3케이스)

| # | 테스트 | 입력 | 기대 |
|---|--------|------|------|
| 1 | XBrushApiError 그대로 변환 | `new XBrushApiError(401, "INVALID_API_KEY", "msg", "suggestion")` | isError=true, text에 "msg"과 "suggestion" 포함 |
| 2 | 일반 Error 자동 변환 | `new Error("unexpected")` | isError=true, text에 "unexpected" 포함 |
| 3 | 문자열 에러 | `"oops"` | isError=true |

#### XBrushApiError 클래스 (2케이스)

| # | 테스트 | 기대 |
|---|--------|------|
| 1 | 속성 올바르게 설정됨 | `status`, `code`, `message`, `suggestion` 모두 일치 |
| 2 | name이 "XBrushApiError" | `error.name === "XBrushApiError"` |

#### getSuggestion 로직 검증 (handleApiError를 통해 간접 테스트)

| 에러 코드 | suggestion에 포함되어야 할 키워드 |
|-----------|-------------------------------|
| `INSUFFICIENT_CREDIT` | "credits", "Billing" |
| `INVALID_MODEL` | "xbrush_list_models" |
| `VALIDATION_ERROR` | "parameters" |
| `GENERATION_FAILED` | "Try again" |
| `POLLER_ERROR` | "xbrush_get_request" |

> 위 항목은 handleApiError 테스트 케이스에 포함시켜 검증

---

## 4. Tier 3 — 도구 핸들러 테스트 (~25 케이스)

`makeApiRequest`를 `vi.mock()`으로 대체하여 HTTP 없이 핸들러 로직 검증.

### Mock 전략

```ts
// 모든 도구 테스트 파일 공통
vi.mock("../../src/services/xbrush-client.js", async () => {
  const actual = await vi.importActual("../../src/services/xbrush-client.js");
  return {
    ...actual,
    makeApiRequest: vi.fn(),    // HTTP만 mock
    // buildToolResult, handleToolError 등은 실제 로직 사용
  };
});
```

### 핸들러 호출 방식

공식 `everything` 서버 패턴을 따라 mock 서버에서 핸들러를 추출:

```ts
function createMockServer() {
  const handlers = new Map<string, Function>();
  return {
    server: {
      registerTool: vi.fn((name, _config, handler) => {
        handlers.set(name, handler);
      }),
    } as unknown as McpServer,
    handlers,
  };
}
```

### 4.1 `test/tools/image.test.ts`

대상: `src/tools/image.ts` — `registerImageTools` 내 4개 핸들러

#### xbrush_image_generate 핸들러 (4케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 성공 — 이미지 1개 | `XBrushSyncResponse` (imageUrls 1개) | text에 "completed", URL 포함 |
| 2 | 성공 — 이미지 3개 | `XBrushSyncResponse` (imageUrls 3개) | 3개 URL 모두 포함 |
| 3 | optional 파라미터 → API body 매핑 | args에 negative_prompt, seed 등 | `makeApiRequest` 호출 시 `negativePrompt`, `seed`로 변환 확인 |
| 4 | API 에러 → 에러 결과 | `makeApiRequest` throw | `isError: true`, suggestion 포함 |

#### xbrush_image_edit 핸들러 (3케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 성공 — async 제출 | `XBrushAsyncResponse` | text에 "async", requestId, estimatedTimeout 포함 |
| 2 | snake_case → camelCase 매핑 | args에 `image_url`, `mask_url` | body에 `imageUrl`, `maskUrl`로 변환 확인 |
| 3 | API 에러 | throw | `isError: true` |

#### xbrush_image_upscale 핸들러 (2케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 성공 | `XBrushAsyncResponse` | text에 "async", "xbrush_get_request" 안내 포함 |
| 2 | upscale_factor → upscaleFactor 매핑 | `{ upscale_factor: 4 }` | body의 `upscaleFactor: 4` 확인 |

#### xbrush_image_remove_bg 핸들러 (2케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 성공 | `XBrushSyncResponse` | text에 "Background removal completed" |
| 2 | image_url → imageUrl 매핑 | - | body의 `imageUrl` 확인 |

### 4.2 `test/tools/requests.test.ts`

대상: `src/tools/requests.ts` — 3개 핸들러

#### xbrush_get_request (4케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | completed 상태 + output | imageUrls 포함 detail | text에 "completed", URL 포함 |
| 2 | pending 상태 | status: "pending" | text에 "pending", Output 섹션 없음 |
| 3 | failed 상태 + error | error code/message 포함 | text에 "Error", code, message 포함 |
| 4 | API 에러 | throw | `isError: true` |

#### xbrush_list_requests (3케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 목록 반환 (hasMore=false) | data 3건 | text에 "Requests (3)", 각 requestId 포함 |
| 2 | 페이지네이션 있음 | hasMore=true, nextCursor="abc" | text에 "Next cursor" 포함 |
| 3 | 빈 목록 | data: [] | "Requests (0)" |

#### xbrush_check_health (2케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 정상 | `{ status: "ok", timestamp: "..." }` | text에 "ok", timestamp 포함 |
| 2 | timestamp 없음 | `{ status: "ok" }` | text에 "ok", timestamp 미포함 |

### 4.3 `test/tools/models.test.ts`

대상: `src/tools/models.ts` — `registerModelTools`

#### xbrush_list_models (4케이스)

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 전체 모델 | image 2개 + audio 1개 | "Models (3 total)", 카테고리별 그룹핑 |
| 2 | category 필터 적용 | args.category="audio" | image 모델 제외, audio만 포함 |
| 3 | creditValue 포맷 | creditValue=10, calType="image" | "10 credits/image" |
| 4 | creditConfig 포맷 | creditConfig 객체 | key=value 형식 |

### 4.4 `test/tools/file-upload.test.ts`

대상: `src/tools/file-upload.ts` — `registerFileUploadTools`

`uploadFile`을 mock (makeApiRequest 대신 상위 레벨):

```ts
vi.mock("../../src/services/file-upload.js", () => ({
  uploadFile: vi.fn(),
}));
```

| # | 테스트 | mock 반환값 | 기대 |
|---|--------|------------|------|
| 1 | 성공 | `{ cdnUrl: "https://cdn.xbrush.ai/..." }` | text에 "uploaded successfully", CDN URL 포함 |
| 2 | 업로드 실패 | throw Error("S3 upload failed") | `isError: true` |

---

## 5. Tier 4 — MCP 프로토콜 통합 테스트 (~15 케이스)

SDK의 `InMemoryTransport` + `Client`로 실제 MCP 프로토콜 핸드셰이크를 거쳐 테스트.

### 5.1 `test/integration/server.test.ts`

#### 테스트 셋업

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

let client: Client;
let mcpServer: McpServer;

beforeAll(async () => {
  mcpServer = new McpServer(
    { name: "xbrush-test", version: "0.0.0" },
    { capabilities: { tools: {} } }
  );
  registerImageTools(mcpServer);
  registerRequestTools(mcpServer);
  registerModelTools(mcpServer);
  registerFileUploadTools(mcpServer);

  client = new Client({ name: "test-client", version: "1.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), mcpServer.connect(st)]);
});

afterAll(async () => {
  await client.close();
});
```

> `makeApiRequest`는 vi.mock()으로 대체.

#### 도구 등록 검증 (3케이스)

| # | 테스트 | 기대 |
|---|--------|------|
| 1 | 도구 9개 등록 | `listTools().tools.length === 9` |
| 2 | 도구 이름 목록 일치 | 정렬 후 정확한 9개 이름 배열 일치 |
| 3 | 각 도구에 annotations 존재 | 모든 도구의 `annotations`가 `readOnlyHint`, `destructiveHint` 등 포함 |

#### 도구 스키마 스냅샷 (4케이스)

| # | 테스트 | 기대 |
|---|--------|------|
| 1 | xbrush_image_generate inputSchema 스냅샷 | `toMatchSnapshot()` |
| 2 | xbrush_image_edit inputSchema 스냅샷 | `toMatchSnapshot()` |
| 3 | xbrush_list_models inputSchema 스냅샷 | `toMatchSnapshot()` |
| 4 | xbrush_get_request inputSchema 스냅샷 | `toMatchSnapshot()` |

> 스냅샷은 의도치 않은 스키마 변경을 잡아줌. 의도적 변경 시 `vitest -u`로 갱신.

#### MCP 프로토콜 동작 (4케이스)

| # | 테스트 | 방법 | 기대 |
|---|--------|------|------|
| 1 | 유효 입력 → 정상 응답 | `client.callTool("xbrush_image_generate", { model: "test", prompt: "hi" })` (mock 성공) | `isError` 없음, text에 결과 포함 |
| 2 | Zod 검증 실패 → 에러 | `client.callTool("xbrush_image_generate", { model: "x" })` (prompt 누락) | 에러 응답 (SDK가 Zod 에러 자동 처리) |
| 3 | 미정의 필드 → 에러 | `{ model: "x", prompt: "y", extra: 1 }` | strict mode에 의해 거부 |
| 4 | 존재하지 않는 도구 → 프로토콜 에러 | `client.callTool("nonexistent", {})` | McpError 발생 |

#### 도구 annotation 검증 (4케이스)

| # | 테스트 | 도구 | 기대 |
|---|--------|------|------|
| 1 | readOnly 도구 | `xbrush_check_health` | `readOnlyHint: true` |
| 2 | readOnly 도구 | `xbrush_list_models` | `readOnlyHint: true` |
| 3 | 비-readOnly 도구 | `xbrush_image_generate` | `readOnlyHint: false` |
| 4 | idempotent 도구 | `xbrush_get_request` | `idempotentHint: true` |

---

## 6. 범위 밖 (의도적으로 제외)

| 항목 | 이유 |
|------|------|
| 실제 API 호출 테스트 | 기존 `test.ts`가 이 역할. API 키 필요, CI 부적합 |
| stdio 전송 레이어 | SDK 내부 구현, 우리가 테스트할 영역 아님 |
| `getClient()` / `getApiKey()` | 환경변수 의존, .env 파일 의존 — mock이 과도 |
| `file-upload.ts` 서비스 | fs + fetch + S3 presign 복합 — mock 비용 대비 가치 낮음 |

---

## 7. 요약

| Tier | 테스트 파일 | 케이스 수 | 외부 의존 | 난이도 |
|------|-----------|----------|----------|-------|
| 1. 스키마 | 4개 | ~40 | 없음 | 낮음 |
| 2. 서비스 | 1개 | ~15 | 없음 | 낮음 |
| 3. 핸들러 | 4개 | ~25 | vi.mock | 중간 |
| 4. 통합 | 1개 | ~15 | InMemoryTransport + vi.mock | 중간 |
| **합계** | **10개** | **~95** | | |

### 구현 우선순위

1. **환경 설정** — vitest 설치, config, scripts
2. **Tier 1 스키마** — 즉시 작성 가능, 커버리지 큼
3. **Tier 2 서비스** — buildToolResult, handleApiError 핵심 로직
4. **Tier 4 통합** — 도구 등록 + 스냅샷 (Tier 3보다 가성비 높음)
5. **Tier 3 핸들러** — 나머지 커버리지 보강
