# @lweight/xbrush-api-mcp

## 프로젝트 개요
- **목적**: [XBrush](https://xbrush.ai) AI 미디어 생성 API용 MCP 서버
- **회사**: 라이트웨이트(주) (Lightweight Inc.)
- **npm**: `@lweight/xbrush-api-mcp` (public, MIT)
- **GitHub**: `lweight/xbrush-api-mcp`

## 구조

```
src/
├── index.ts              ← 서버 엔트리, 10개 도구 모듈 등록
├── constants.ts          ← API 베이스 URL, 타임아웃 상수, 응답 크기 한도
├── types.ts              ← 공통 타입 정의
├── tool-filter.ts        ← XBRUSH_DISABLED_TOOLS 환경변수 처리
├── schemas/              ← Zod 입력 스키마
│   ├── audio.ts          ← tts / music / sound-effect
│   ├── file-upload.ts
│   ├── image.ts
│   ├── lip-sync.ts
│   ├── models.ts
│   ├── moderation.ts     ← content_moderate (image/video)
│   ├── requests.ts
│   ├── video.ts          ← generate / upscale / extend / retake
│   ├── voice.ts          ← list_voices
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
    ├── moderation.ts     ← xbrush_content_moderate
    ├── requests.ts       ← get_request, list_requests, check_health
    ├── video.ts          ← video_generate, video_upscale, video_extend, video_retake
    ├── voice.ts          ← xbrush_list_voices
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

## 이미지 크기 지정 (모델 calType별, 중요)
- 이미지 모델은 `calType`에 따라 출력 크기 지정 방식이 다름:
  - **`perMegapixel` / `perImage`** (`flux.*`, `z-image-turbo`, `qwen-image-edit` 등) → `width`/`height` 사용.
  - **`byResolution` / `byResolutionAndQuality`** (`gpt-image-2`, `seedream-4.0/4.5`, `nano-banana-pro`, `nano-banana-2` + 각 `-edit`) → `resolution`(예: `"1K"`/`"2K"`/`"4K"`) + `aspect_ratio`(예: `"16:9"`) 사용. **`width`/`height`는 무시됨** (서버가 모델 전달 전 드롭 — 실측 확인).
  - `gpt-image-2`/`-edit`(byResolutionAndQuality)만 `quality`(low/medium/high) 추가 지원. 미지정 시 서버 기본은 `high`(최고가).
- `src/tools/image.ts`의 `RESOLUTION_BASED_MODELS`가 해상도 기반 모델에 `width`/`height`가 오면 제출 전 거부(런타임 가드). 새 byResolution 모델 추가 시 이 상수를 `xbrush_list_models`의 calType과 맞춰 갱신.
- **`gpt-image-2`/`-edit`가 받는 `aspect_ratio`** (2026-06 실측): `1K`/`2K`는 `1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1`(10종), `4K`는 `16:9, 9:16, 21:9, 1.91:1`(4종, wide만). 미지원 값 거부 방식이 해상도별로 다름 — `1K`/`2K`는 제출 `202` 후 처리 중 `failed`(과금되나 환불됨), `4K`는 제출 즉시 `400 VALIDATION_ERROR`. 서버 에러 메시지가 허용 목록을 그대로 반환하므로 새 비율은 미지원 값 1회 실호출로 역추적 가능. `aspect_ratio`/`resolution`은 free-form string으로 서버 미검증 통과(`quality`만 enum 검증)이고 모델·해상도·시점별로 목록이 달라 **클라이언트 화이트리스트 가드는 두지 않음**(false-rejection 위험) — describe로만 안내.

## 다중 레퍼런스 이미지 (image edit, 중요)
- `/v1/image/edit`는 **단일 `imageUrl`(필수, primary) + `imageUrls`(선택, 추가 레퍼런스 배열)** 을 받음. 서버가 `[imageUrl, ...imageUrls]`로 중복 제거 후 모델엔 `images` 배열로 전달 (실측 확인: `gpt-image-2-edit`에 노란 원 `imageUrl` + 초록 삼각형 `imageUrls` → 두 도형이 합쳐진 1장 반환).
- `xbrush_image_edit` 스키마의 `image_urls`가 `imageUrls`로 매핑됨. `imageUrls`만 보내고 `imageUrl`을 빠뜨리면 422(`imageUrl` 필수).
- 주의: 무과금 역추적 시 잘못된 모델명 게이트(`__nope__`)를 쓰면 이미지 처리 단계 전 `INVALID_MODEL`로 끊겨 `imageUrls` 소비 여부를 못 봄 — 다중 레퍼런스류는 유효 모델로 최저가 티어(예: `resolution:"1K", quality:"low"`) 실호출로 검증할 것.

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
5. `test/integration/server.test.ts` + `test/integration/disabled-tools.test.ts`의 도구 개수/이름 목록 업데이트

## 테스트
- **Vitest 4-tier**: `test/{schemas,services,tools,integration}/`
- 현재 v2.2.0 기준 **290 케이스** 통과
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
- 도구 20개 (Image 4, Video 5, Audio 3, Utility 8)
  - Image: generate, edit, upscale, remove_bg
  - Video: generate, upscale, lip_sync, extend, retake
  - Audio: tts_generate, music_generate, sound_effect_generate
  - Utility: content_moderate, watermark_add, list_models, list_voices, get_request, list_requests, file_upload, check_health
- 미구현(차기): `voice_clone`(/v1/voice/clone), `lora_train`(/v1/lora/train) — 소비측 스펙 확정 후
