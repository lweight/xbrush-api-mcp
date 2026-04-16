# @lweight/xbrush-api-mcp

## 프로젝트 개요
- **목적**: [XBrush](https://xbrush.ai) AI 미디어 생성 API용 MCP 서버
- **회사**: 라이트웨이트(주) (Lightweight Inc.)
- **npm**: `@lweight/xbrush-api-mcp` (public, MIT)
- **GitHub**: `lweight/xbrush-api-mcp`

## 구조

```
src/
├── index.ts              ← 서버 엔트리, 8개 도구 모듈 등록
├── constants.ts          ← API 베이스 URL, 타임아웃 상수, 응답 크기 한도
├── types.ts              ← 공통 타입 정의
├── tool-filter.ts        ← XBRUSH_DISABLED_TOOLS 환경변수 처리
├── schemas/              ← Zod 입력 스키마
│   ├── audio.ts          ← tts / music / sound-effect
│   ├── file-upload.ts
│   ├── image.ts
│   ├── lip-sync.ts
│   ├── models.ts
│   ├── requests.ts
│   ├── video.ts
│   └── watermark.ts
├── services/
│   ├── dispatch.ts       ← submitAsync 헬퍼 (async 단일 경로)
│   ├── file-upload.ts    ← 파일 업로드 (presign / direct / auto)
│   └── xbrush-client.ts  ← HTTP 클라이언트 + 에러 매핑 + 기본 포맷터
└── tools/                ← MCP 도구 핸들러
    ├── audio.ts          ← tts_generate, music_generate, sound_effect_generate
    ├── file-upload.ts    ← xbrush_file_upload
    ├── image.ts          ← generate, edit, upscale, remove_bg
    ├── lip-sync.ts       ← xbrush_video_lip_sync
    ├── models.ts         ← xbrush_list_models
    ├── requests.ts       ← get_request, list_requests, check_health
    ├── video.ts          ← video_generate, video_upscale
    └── watermark.ts      ← xbrush_watermark_add
```

## 요구사항
- Node.js >= 18

## 개발

```bash
npm install          # 의존성 설치
npm run build        # TypeScript 컴파일 (tsc)
npm run dev          # watch 모드
npm test             # Vitest 전체 실행
```

## 환경변수
- `XBRUSH_API_KEY` (필수) — https://xbrush.run/api-keys 에서 발급
- `XBRUSH_BASE_URL` (선택) — 기본값 `https://api.xbrush.run`
- `XBRUSH_DISABLED_TOOLS` (선택) — 쉼표 구분 도구 이름. 해당 도구만 선택적으로 비활성화 (운영 안전장치).

## API 특성
- **인증**: `X-API-Key` 헤더
- **응답 truncation**: 25,000자 초과 시 자동 잘림
- **타임아웃**:
  - `TIMEOUT_ASYNC_POST`: 30초 (async POST 제출)
  - `TIMEOUT_GET`: 10초 (GET 요청)
  - `TIMEOUT_UPLOAD`: 180초 (파일 업로드 본문 전송)
- **입력 검증**: Zod strict mode (미정의 필드 거부)
- **Tool annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` 명시
- **생성 도구의 `idempotentHint`는 반드시 false** — 중복 과금 방지

## Async-only (중요)
- **모든 생성 도구는 async 단일 경로**. `/sync` 엔드포인트는 호출하지 않는다 (빠른 모델/느린 모델 무관).
- 사유: `/sync` 엔드포인트가 처리시간 초과 시 `{ syncCompleted: false, status: "pending", output: undefined }`를 HTTP 202로 반환하는 dual-shape contract여서 client 처리가 복잡해지고, MCP stdio 도구는 장시간 블록되면 client timeout 위험이 큼.
- 모든 도구 호출 → `request_id` 반환 → `xbrush_get_request(request_id)`로 폴링.
- 스키마에 `sync` 필드 없음. 전달 시 strict 모드로 거부됨.

## 파일 업로드 플로우
`xbrush_file_upload`에 `strategy` 파라미터로 경로 선택:

- **auto (기본)**: 10MB 미만 → direct, 이상 → presign
- **direct**: POST `/v1/files/upload` (multipart)
- **presign**: POST `/v1/files/presign` → S3 직접 업로드

반환된 CDN URL을 다른 도구의 `image_url`/`video_url`/`audio_url` 입력으로 사용.

## 도구 추가 패턴
1. `src/schemas/<domain>.ts` — Zod 입력 스키마 정의 (strict, **`sync` 필드 추가 금지**)
2. `src/tools/<domain>.ts` — `submitAsync` 헬퍼 사용 (async URL만 전달)
3. `src/index.ts` — 새 모듈이면 `registerXxxTools(server)` 등록
4. `test/schemas/<domain>.test.ts` + `test/tools/<domain>.test.ts` 추가
5. `test/integration/server.test.ts`의 도구 개수/이름 목록 업데이트

## 테스트
- **Vitest 4-tier**: `test/{schemas,services,tools,integration}/`
- 현재 v2.0.0 기준 **243 케이스** 통과
- `npm test` / `npm run test:watch`
- 통합 테스트는 axios mock 사용, 실 API 호출 없음
- MCP Inspector 또는 Claude Code에서 수동 E2E

## 배포

```bash
npm publish --access public
```

- `prepublishOnly`: build + test 자동 실행
- npm org: `@lweight` (계정: lightweightkr)

## 규칙
- 커밋 메시지: 한국어
- Transport: stdio 전용
- 도구 16개 (Image 4, Video 3, Audio 3, Utility 6)
  - Image: generate, edit, upscale, remove_bg
  - Video: generate, upscale, lip_sync
  - Audio: tts_generate, music_generate, sound_effect_generate
  - Utility: watermark_add, list_models, get_request, list_requests, file_upload, check_health
