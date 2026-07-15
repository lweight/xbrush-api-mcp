# @lweight/xbrush-api-mcp

## 프로젝트 개요
- **목적**: [XBrush](https://xbrush.ai) AI 미디어 생성 API용 MCP 서버
- **회사**: 라이트웨이트(주) (Lightweight Inc.)
- **npm**: `@lweight/xbrush-api-mcp` (public, MIT)
- **GitHub**: `lweight/xbrush-api-mcp`

## 구조

```
src/
├── index.ts              ← 서버 엔트리, 11개 도구 모듈 등록
├── constants.ts          ← API 베이스 URL, 타임아웃 상수, 응답 크기 한도
├── types.ts              ← 공통 타입 정의
├── tool-filter.ts        ← XBRUSH_DISABLED_TOOLS 환경변수 처리
├── schemas/              ← Zod 입력 스키마
│   ├── audio.ts          ← tts / music / sound-effect
│   ├── chat.ts           ← chat completions (LLM)
│   ├── file-upload.ts
│   ├── image.ts
│   ├── lip-sync.ts       ← 영상/사진(talking photo) lip-sync
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
    ├── chat.ts           ← xbrush_chat (동기 LLM — async-only 규칙의 유일한 예외)
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
  - `TIMEOUT_CHAT`: 35초 (동기 chat completions — 아래 "LLM chat" 참고)
- **입력 검증**: Zod strict mode (미정의 필드 거부)
- **Tool annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` 명시
- **생성 도구의 `idempotentHint`는 반드시 false** — 중복 과금 방지

## Async-only (중요)
- **모든 생성 도구는 async 단일 경로**. `/sync` 엔드포인트는 호출하지 않는다 (빠른 모델/느린 모델 무관).
- 사유: `/sync` 엔드포인트가 처리시간 초과 시 `{ syncCompleted: false, status: "pending", output: undefined }`를 HTTP 202로 반환하는 dual-shape contract여서 client 처리가 복잡해지고, MCP stdio 도구는 장시간 블록되면 client timeout 위험이 큼.
- 모든 도구 호출 → `request_id` 반환 → `xbrush_get_request(request_id)`로 폴링.
- 스키마에 `sync` 필드 없음. 전달 시 strict 모드로 거부됨.
- **유일한 예외: `xbrush_chat`** — `/v1/chat/completions`는 서버에 async 변형이 없어(`/async` 404) 동기 호출. 아래 "LLM chat" 참고.

## LLM chat — `xbrush_chat` (동기 예외, 중요)
- **엔드포인트**: `POST /v1/chat/completions` (OpenAI 호환). **동기 전용** — async 변형 없음(2026-07-15 재확인 404). 2026-07 `text` 카테고리(`z-ai/glm-5.2`, featureType `chat`, calType `perToken`)와 함께 추가됨. `/v1/embeddings`/`/v1/completions`/`/v1/responses`는 없음(404).
- **요청 필드** (2026-07-15 역추적 + 동일자 vision 업데이트 재조사): `model`(필수), `messages`(필수, 1~1000개, `{role: system|user|assistant, content}`), `content`는 **string(비어있으면 400 "content must not be empty") 또는 파트 배열**(아래 vision), `max_tokens`/`max_completion_tokens`(1~65536; 서버가 `max_tokens`→`max_completion_tokens`로 정규화), `temperature`(0~2), `top_p`(0~1), `frequency_penalty`/`presence_penalty`(−2~2), `stop`(**2026-07 중순 신규 인식** — 비어있지 않은 string 또는 1~4개 배열, 위반 시 400), `reasoning_effort`(enum `none/minimal/high/max`, 서버 기본 `none`), `stream`(bool — MCP는 미노출). **서버는 strict가 아님**: `tools`/`n`/`seed`/`response_format`/`logprobs`/`logit_bias`/`tool_choice`/`stream_options` 등 미인식 필드는 그냥 무시됨(에러 없이 기능도 안 함 — 2026-07-15 재확인).
- **Vision (2026-07 중순, 중요)**: content 파트 배열 지원 — 인식 타입은 **`text`와 `image_url` 뿐**(그 외 "unknown content part type" 400). 형태: `{type:"text", text:"…"}`(비어있으면 400) / `{type:"image_url", image_url:{url, detail?}}`. 빈 배열은 400. **모든 role에서 배열 허용**(system/assistant도 text 파트 OK). `url`은 **https URL과 `data:` URL 둘 다 허용**(chat은 미디어 엔드포인트와 달리 host 허용목록 없음 — 실측). 이미지는 **vision 모델 한정**(`bytedance/seed-2.0-mini`, constraints `{vision:true, maxImages:10, tokensPerImage:1298, baseTokens:100}`): 비전 아닌 모델(glm-5.2, `vision:false`)에 이미지 주면 업스트림이 제출 시점 400 거부(무과금, `provider.upstreamMessage`에 "Model do not support image input"). 서버측 검증: 요청당 이미지 ≤ maxImages("at most 10 images per request"), 업스트림 최소 변 14px. **`detail`은 업스트림 패스스루**(`low`/`high`/`auto` — 잘못된 값은 업스트림 400이 허용값 나열): 토큰 실측 seed-2.0-mini 기준 `low` ≈ prompt 98, `high`/`auto`/미지정 ≈ 1,390~1,396 → **이미지당 ~14배 비용 차이**. MCP는 detail을 free-form string으로 노출(벤더 검증 위임 — `aspect_ratio` 철학과 동일).
- **플랫폼 주입 system 프롬프트**: 서버가 모든 chat 요청 앞에 자체 system 메시지(~280자, adult platform 고지)를 삽입 — request 기록의 `input.messages[0]`에 보이고(원본은 `originalBody`에 보존) prompt_tokens에 포함됨. 모델 constraints의 `baseTokens: 100`이 이 오버헤드(최소 프롬프트 실측 ~88-101 토큰).
- **응답**: OpenAI 형식 `{id, object:"chat.completion", choices:[{message:{content,...}, finish_reason}], usage:{prompt_tokens, completion_tokens, total_tokens, credits_charged, completion_tokens_details.reasoning_tokens, prompt_tokens_details.cached_tokens}}`. **응답 `id`가 곧 request_id** — `/v1/requests`에 `domain:"text", action:"chat"`으로 기록되고 input echo + 전체 output이 남아 `xbrush_get_request`로 사후 회수 가능.
- **게이트웨이 30초 한계 (중요)**: 엣지 게이트웨이(CloudFront)가 ~30초에 연결을 끊고 **HTML 504**를 반환(실측). 서버는 계속 처리·과금하며 결과는 request 기록으로 회수(`completed`면 output 존재, `failed`면 **자동 전액 환불** — `credits.refunded` 실측 확인). 클라이언트 처리: `TIMEOUT_CHAT` 35초(504를 수신하도록 30초보다 약간 김) + `handleApiError`가 JSON 아닌 504를 `GATEWAY_TIMEOUT`으로 매핑해 `list_requests`/`get_request` 복구 힌트 제공. 따라서 **reasoning_effort는 none/minimal 권장** — high/max는 30초를 쉽게 초과(minimal도 간헐 초과 실측).
- **과금**: perToken (GLM 5.2: input 1.82 / output 5.72 / cached input 0.338 credits per 1M; seed-2.0-mini: 0.13 / 0.52 / 0.13 — GLM 대비 ~14배 저렴). 사소한 호출은 ~0.0001 credit.
- `GET /v1/models/text` 같은 **카테고리별 models 엔드포인트 존재** — `/v1/models`(전체)에도 text 모델 포함이라 `xbrush_list_models`는 기존 전체 조회 + 클라 필터 유지. text 모델 `constraints`(`vision`/`maxImages`/`tokensPerImage`/`baseTokens`)는 `xbrush_list_models` 포맷터가 `vision (max 10 images, ~1298 tokens/image)` / `text-only`로 표시.

## Lip-sync — fabric-1.0 talking photo (2026-07)
- `/v1/video/lip-sync` 검증은 **모델 무관 필드 superset** (model-aware 아님, 실측): `videoUrl`, `imageUrl`, `audioUrl`, `text`, `voiceId`, `duration`(1~60), `resolution`(enum `480p/720p`). 모델별 필수 조합은 후단에서 `INVALID_INPUT`으로 검사(예: "imageUrl is required for fabric-1.0 model").
- **fabric-1.0 / fabric-1.0-fast** (VEED): **정지 사진(`imageUrl`)을 말하는 얼굴로 애니메이션**(talking photo). 음성은 `audioUrl` 또는 **내장 TTS**(`text`+`voiceId`). 기존 영상 기반은 pixverse-lipsync / infinite-talk(`videoUrl`).
- MCP 스키마는 전 필드 optional + 핸들러에서 모델 무관 최소치만 가드(얼굴 입력 video_url|image_url 중 1개, 음성 입력 audio_url|text 중 1개). 모델별 요구는 서버 위임(클라 화이트리스트 지양).
- fabric은 audio 카테고리에도 lipsync로 중복 등재되어 있으나 엔드포인트는 동일 `/v1/video/lip-sync`.

## Sound effect — 텍스트 기반 모델 (2026-07)
- 신규 featureType `soundeffect-text`: `elevenlabs-sound-effects`, `stable-audio-sfx` — prompt가 주 입력. 단 **`videoUrl`은 모델 무관 endpoint 필수**(prompt-only는 400 REQUIRED, 실측 — 조건부 아님).
- 인식 필드: `model`, `videoUrl`(필수), `prompt`, `duration`(1~30). `seed`/`text`는 미인식.

## 이미지 크기 지정 (모델 calType별, 중요)
- 이미지 모델은 `calType`에 따라 출력 크기 지정 방식이 다름:
  - **`perMegapixel` / `perImage`** (`flux.*`, `z-image-turbo`, `qwen-image-edit` 등) → `width`/`height` 사용.
  - **`byResolution` / `byResolutionAndQuality`** (`gpt-image-2`, `seedream-4.0/4.5/5.0-pro`, `nano-banana-pro`, `nano-banana-2` + 각 `-edit`) → `resolution`(예: `"1K"`/`"2K"`/`"4K"`) + `aspect_ratio`(예: `"16:9"`) 사용. **`width`/`height`는 무시됨** (서버가 모델 전달 전 드롭 — 실측 확인). **단 `aspect_ratio:"custom"`이면 예외** — 아래 "임의 픽셀 사이즈(custom)" 참고.
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
- 현재 v2.9.0 기준 **365 케이스** 통과
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
- 도구 21개 (Image 4, Video 5, Audio 3, Text 1, Utility 8)
  - Image: generate, edit, upscale, remove_bg
  - Video: generate, upscale, lip_sync, extend, retake
  - Audio: tts_generate, music_generate, sound_effect_generate
  - Text: chat (동기 LLM)
  - Utility: content_moderate, watermark_add, list_models, list_voices, get_request, list_requests, file_upload, check_health
- 미구현(차기): `voice_clone`(/v1/voice/clone), `lora_train`(/v1/lora/train) — 소비측 스펙 확정 후
- utility 모델 `gpt-4.1-nano`(featureType `prompt_enhance`/`image_to_prompt`)는 **공개 엔드포인트 미발견** (2026-07-15: /v1/prompt/enhance, /v1/utility/*, /v1/image/describe 등 후보 전부 404) — 내부 기능(예: idea 번역/프롬프트 보강)으로 추정, 도구화 대상 아님
