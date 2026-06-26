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
  - **`byResolution` / `byResolutionAndQuality`** (`gpt-image-2`, `seedream-4.0/4.5`, `nano-banana-pro`, `nano-banana-2` + 각 `-edit`) → `resolution`(예: `"1K"`/`"2K"`/`"4K"`) + `aspect_ratio`(예: `"16:9"`) 사용. **`width`/`height`는 무시됨** (서버가 모델 전달 전 드롭 — 실측 확인). **단 `aspect_ratio:"custom"`이면 예외** — 아래 "임의 픽셀 사이즈(custom)" 참고.
  - `gpt-image-2`/`-edit`(byResolutionAndQuality)만 `quality`(low/medium/high) 추가 지원. 미지정 시 서버 기본은 `high`(최고가).
- `src/tools/image.ts`의 `RESOLUTION_BASED_MODELS`가 해상도 기반 모델에 `width`/`height`가 오면 제출 전 거부(런타임 가드). **예외: `aspect_ratio==="custom"`이면 통과**(임의 픽셀 사이즈 모드). 새 byResolution 모델 추가 시 이 상수를 `xbrush_list_models`의 calType과 맞춰 갱신.
- **`gpt-image-2`/`-edit`가 받는 `aspect_ratio`** (2026-06 실측): `1K`/`2K`는 `1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1`(10종), `4K`는 `16:9, 9:16, 21:9, 1.91:1`(4종, wide만). 미지원 값 거부 방식이 해상도별로 다름 — `1K`/`2K`는 제출 `202` 후 처리 중 `failed`(과금되나 환불됨), `4K`는 제출 즉시 `400 VALIDATION_ERROR`. 서버 에러 메시지가 허용 목록을 그대로 반환하므로 새 비율은 미지원 값 1회 실호출로 역추적 가능. `aspect_ratio`/`resolution`은 free-form string으로 서버 미검증 통과(`quality`만 enum 검증)이고 모델·해상도·시점별로 목록이 달라 **클라이언트 화이트리스트 가드는 두지 않음**(false-rejection 위험) — describe로만 안내.
- **임의 픽셀 사이즈(`aspect_ratio:"custom"`)** (2026-06-23 실측): `gpt-image-2`/`-edit`에 `aspect_ratio:"custom"` + `width`/`height`를 주면 **정확히 그 픽셀로 출력**(예: `1024×1152`, `1536×864` 그대로 반환 — `width`/`height`가 모델 페이로드에 그대로 전달됨). `width`/`height` **둘 다 필수**이고 **각각 16의 배수·최장변 ≤3840·총픽셀 655,360~8,294,400** 제약(위반·누락 시 제출 즉시 `400` + 제약 메시지 반환, 무과금 — 새 제약은 위반 값 1회 실호출로 역추적 가능). 비용은 해상도 티어(미지정 시 1K급)대로 과금. **정확 픽셀은 `gpt-image-2`/`-edit` 한정** — `seedream-4.5`는 비율만 유지하고 ~2K로 리스케일(`1024×1152`→`1824×2048`), `nano-banana-pro`는 `width`/`height` 무시하고 `2048×2048` 반환(고가). 그래서 `rejectWidthHeightForResolutionModel`은 `custom`이면 모델 무관 통과시키고, 모델별 차이는 스키마/도구 description으로만 안내(가드 화이트리스트 지양 — 위 `aspect_ratio`와 동일 철학).

## 다중 레퍼런스 이미지 (image edit, 중요)
- `/v1/image/edit`는 **단일 `imageUrl`(필수, primary) + `imageUrls`(선택, 추가 레퍼런스 배열)** 을 받음. 서버가 `[imageUrl, ...imageUrls]`로 중복 제거 후 모델엔 `images` 배열로 전달 (실측 확인: `gpt-image-2-edit`에 노란 원 `imageUrl` + 초록 삼각형 `imageUrls` → 두 도형이 합쳐진 1장 반환).
- `xbrush_image_edit` 스키마의 `image_urls`가 `imageUrls`로 매핑됨. `imageUrls`만 보내고 `imageUrl`을 빠뜨리면 422(`imageUrl` 필수).
- 주의: 무과금 역추적 시 잘못된 모델명 게이트(`__nope__`)를 쓰면 이미지 처리 단계 전 `INVALID_MODEL`로 끊겨 `imageUrls` 소비 여부를 못 봄 — 다중 레퍼런스류는 유효 모델로 최저가 티어(예: `resolution:"1K", quality:"low"`) 실호출로 검증할 것.

## 비디오 generate — duration & reference-to-video (seedance 2.0, 중요)
- `/v1/video/generate`의 검증은 **모델 인지(model-aware)**. 빈 body/오류 타입 POST 시 해당 모델 기준으로 인식 필드를 `error.fields[]`에 모두 반환 → 무과금 역추적 가능(`{model, prompt, <후보필드>:잘못된값}` 식). seedance-2.0 인식 필드(2026-06-25, 2026-06-26 재확인): `imageUrl`, `imageUrls`(array of `string | {url, role}`), `prompt`, `idea`, `duration`, `resolution`(enum `512p/768p/480p/720p/1080p/1440p/2160p/4k`), `aspectRatio`(enum `auto/adaptive/16:9/9:16/1:1/4:3/3:4/21:9`), `generateAudio`(bool), `consistencyMode`(enum `overlay/advanced/auto`; 서버 기본 `overlay` → 모델엔 `face_mesh_mode`로 매핑). `endImageUrl`은 seedance-2.0엔 미인식(end-frame 입력 없는 모델 — 끝프레임은 `imageUrls`의 `last_frame` role로). 미인식 필드는 strict가 아니라 **그냥 무시**됨. **MCP 노출**: `xbrush_video_generate`가 `prompt/idea/image_url/image_urls/end_image_url/duration/resolution/aspect_ratio/generate_audio/consistency_mode/prompt_relevance`를 camelCase로 매핑(2026-06-26 `idea`·`resolution`·`aspect_ratio`·`generate_audio`·`consistency_mode` 추가; `image_urls`는 union으로 객체배열 지원).
- **`image_url`은 optional** — 과거 스키마가 필수로 강제했으나 오류. seedance-2.0는 t2v(prompt만)·reference-to-video(`image_urls`)에서 시작 프레임 불필요. 필요 입력은 모델이 결정(없으면 서버가 "prompt or idea required" 등으로 거부).
- **`prompt` vs `idea`** (사용자 확인): `prompt`=**영어** 직접 입력(모델에 그대로), `idea`=**비영어**(예: 한국어 — 서버가 번역 후 모델 전달; 실측 페이로드에 한국어 `idea` + `translation_policy.target:"zh"` 동반). seedance는 `prompt` 또는 `idea` 중 하나 필요(서버가 "prompt or idea required" 검증). 둘 다 `xbrush_video_generate` 스키마에 optional로 노출(`idea`는 2026-06-26 추가). 둘 다에서 `reference_image` 항목을 `@Image1`,`@Image2`로 지칭.
- **duration은 모델별 범위** (`xbrush_list_models`의 `constraints`로 노출: `{min,max,step,default}`). 과거 스키마 `5|10` 리터럴은 대부분 모델에서 오답(veo3 4–8, seedance-2.0/-fast 4–15 step1 default5, kling-v3/wan-2.7 ~15, wan-v2-2-14b min1). 스키마는 `int().min(1).max(20)`(generate 계열 관측 전 범위 커버)로 두고 모델별 정밀 범위는 **서버가 검증**(클라 화이트리스트 지양 — false-rejection 방지).
- **reference-to-video(멀티 레퍼런스) — `imageUrls` 원소는 두 형식** (2026-06-26 실측): (a) URL 문자열, 또는 (b) **`{url, role}` 객체**. `role`은 `first_frame`(시작프레임)·`last_frame`(끝프레임)·`reference_image`(피사체/스타일/캐릭터 레퍼런스). 한 번의 호출에서 한 배열로 시작·끝 프레임 + 레퍼런스를 **통합 지정**. `role`은 optional(생략 시 모델이 결정). seedance-2.0/-fast의 `imageUrls` → 모델 `video_params.image_urls`로 **객체 그대로 전달**(실측: 입력 `[{url,role},…]`가 `input.video_params.image_urls`에 동일 echo. `imageUrl`(단일)은 `video_params.image`로 감). 문자열 배열은 **하위호환 유지**(혼합도 허용). 과거(v2.5.0) 단순 문자열 배열 → 객체배열로 확장된 것이 이 변경의 핵심. **`imageUrl` 없이 단독 사용 가능**(image edit과 달리 primary 필수 아님; `first_frame`도 `image_urls`에 role로 넣음 — 사용자 실측 페이로드에서 `image:""`, first_frame이 `image_urls`에 존재). `xbrush_video_generate` 스키마 `image_urls`(union: `string | {url, role}`) → `imageUrls` 그대로 매핑.
- **`@ImageN` 넘버링 (오해 주의)**: prompt/idea의 `@Image1`,`@Image2`,…는 `image_urls`의 **1-based 배열 위치**(first_frame/last_frame 포함 전 항목)를 가리킴 — "N번째 reference"가 아님. 예: `[last_frame, reference_image]`면 reference는 `@Image2`(last_frame이 위치1). LLM이 reference를 무조건 `@Image1`로 쓰는 오해가 잦아(사용자 보고) `xbrush_video_generate`에 정합성 가드 추가(`src/tools/video.ts` `checkImageReferences`): prompt/idea의 `@Image(\d+)`를 파싱해 (a) 범위 초과, (b) frame role(first_frame/last_frame)을 가리키는 경우 **제출 전 에러로 차단**하고 실제 `위치→role` 매핑을 반환해 교정 유도. 올바른 위치(reference_image) 지칭·문자열 배열(role 없음, 범위만 체크)·`@` 없음은 통과. 스키마 description에도 동일 넘버링 규칙 명시.
- **role 검증 주의**: 잘못된 `role`(예: `"banana"`)은 서버가 거부하지만 응답 메시지가 `"Generation rejected: input text may contain sensitive content"`로 **오인 표시**(content-moderation 메시지로 새는 버그성 응답) → role enum은 메시지로 역추적 불가. 허용 role은 실페이로드(`first_frame/last_frame/reference_image`)로 확인. role은 free-form string으로 두고 서버 검증에 위임(클라 화이트리스트 지양 — 위 `aspect_ratio` 철학과 동일).
- **검증 방법(과금 주의)**: `imageUrls` 원소 URL은 잘못된 host/scheme면 제출 `202` 후 처리 중 `failed`(과금되나 **환불**됨, `credits.refunded` 확인). **단 video는 invalid host면 worker가 집기 전 폐기되어 `input.video_params` echo가 비어 있음** → 객체배열 전달 구조를 보려면 `assets.xbrush.ai`(host 허용목록 통과) URL로 **valid 실호출** 필요(과금됨). 최저가 = seedance-2.0-fast `480p`(0.0728 credit/sec, 예: 4s = 0.2912 credit). echo는 worker pickup 후 `pending` 상태에서도 채워짐.

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
- 현재 v2.5.0 기준 **306 케이스** 통과
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
