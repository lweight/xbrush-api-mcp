# @lweight/xbrush-api-mcp

## 프로젝트 개요
- **목적**: [XBrush](https://xbrush.ai) AI 미디어 생성 API용 MCP 서버
- **회사**: 라이트웨이트(주) (Lightweight Inc.)
- **npm**: `@lweight/xbrush-api-mcp` (public, MIT)
- **GitHub**: `lweight/xbrush-api-mcp`

## 구조

```
src/
├── index.ts              ← 서버 엔트리, 13개 도구 모듈 등록 (37 tools)
├── constants.ts          ← API 베이스 URL, 타임아웃 상수, 응답 크기 한도
├── types.ts              ← 공통 타입 정의 (output 형태·모델 constraints·동기 유틸 응답)
├── tool-filter.ts        ← XBRUSH_DISABLED_TOOLS 환경변수 처리
├── schemas/              ← Zod 입력 스키마
│   ├── audio.ts          ← tts(+timestamps) / music / sound-effect / stt
│   ├── chat.ts           ← chat completions (LLM) — response_format 포함
│   ├── file-upload.ts
│   ├── image.ts          ← generate/edit/upscale/remove-bg/outpaint/inpaint/enhance/layer-split + segment-detect/vision/product-lookup
│   ├── lip-sync.ts       ← 영상/사진(talking photo) lip-sync
│   ├── lora.ts           ← lora_train (LoRA 학습)
│   ├── media.ts          ← media ffmpeg / image-process / graph / info
│   ├── models.ts
│   ├── moderation.ts     ← content_moderate (image/video, threshold)
│   ├── requests.ts       ← get/list(domain·action·status 필터)
│   ├── video.ts          ← generate / upscale / extend / retake / edit / vision
│   ├── voice.ts          ← list_voices(+voice_id 상세) / voice_clone
│   └── watermark.ts      ← strength
├── services/
│   ├── dispatch.ts       ← submitAsync(async 단일 경로) + callSync(동기 유틸 전용)
│   ├── file-upload.ts    ← 파일 업로드 (presign / direct / auto) + MIME 맵
│   └── xbrush-client.ts  ← HTTP 클라이언트 + 에러 매핑 + 기본 포맷터
└── tools/                ← MCP 도구 핸들러
    ├── audio.ts          ← tts_generate(with_timestamps→/v1/tts-wt), music_generate, sound_effect_generate, stt_transcribe
    ├── chat.ts           ← xbrush_chat (동기 LLM)
    ├── file-upload.ts    ← xbrush_file_upload
    ├── image.ts          ← generate, edit, upscale, remove_bg, outpaint, inpaint, enhance, layer_split (async) + segment_detect, vision, product_lookup (동기)
    ├── lip-sync.ts       ← xbrush_video_lip_sync
    ├── lora.ts           ← xbrush_lora_train
    ├── media.ts          ← media_ffmpeg, media_image_process, media_graph (async) + media_info (동기, 무료)
    ├── models.ts         ← xbrush_list_models
    ├── moderation.ts     ← xbrush_content_moderate
    ├── requests.ts       ← get_request(범용 output 렌더), list_requests(필터), check_health
    ├── video.ts          ← video_generate, video_upscale, video_extend, video_retake, video_edit, video_vision
    ├── voice.ts          ← xbrush_list_voices, xbrush_voice_clone (동기)
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
  - `TIMEOUT_CHAT` / `TIMEOUT_VOICE_CLONE` / `TIMEOUT_SYNC_UTILITY`: 35초 (동기 엔드포인트 — 게이트웨이 30초 한계보다 약간 김)
- **입력 검증**: Zod strict mode (미정의 필드 거부). **서버는 strict가 아님** — 미인식 필드는 그냥 무시(2026-09-06 재확인). 필드 인벤토리 역추적은 "모든 후보 필드에 `{}`(잘못된 타입)를 넣은 POST" 1회로 가능: 인식 필드는 전부 `error.fields[]`에 타입 에러로 나열되고 미인식 필드는 침묵(무과금).
- **Tool annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` 명시
- **생성 도구의 `idempotentHint`는 반드시 false** — 중복 과금 방지. 과금되는 동기 분석 도구(vision/segment/product)도 false, 무료 프로브(media_info)만 true.
- **webhookUrl**: 모든 async 엔드포인트가 `webhookUrl`(URL) 필드를 인식(2026-09-06). MCP는 미노출(stdio 컨텍스트에 수신자 없음).
- **응답 봉투(2026-08~)**: async 제출은 `{requestId, status, domain, action, creditCharged, estimatedTimeout, pollUrl, urls:{get}}`. 일부 엔드포인트는 제출 중 완료되어 **202 + `status:"completed"`** 를 돌려줌(`/v1/tts-wt/generate`, `/v1/voice/clone`) — 결과는 request 기록에만 있음. 기록(`GET /v1/requests/{id}`)에는 `credits:{charged,refunded,balance_after}`, `originalBody`(제출 원본), `input`(워커 정규화 형태), `queueTimesMs/processingTimesMs` 추가. 상태값: pending/processing/completed/failed/timeout/aborted.
- **`GET /v1/requests` 필터**: `domain`, `action`, `status`(대문자 enum PENDING/PROCESSING/COMPLETED/FAILED/TIMEOUT/ABORTED — 클라가 대문자 정규화). `DELETE /v1/requests/{id}`는 `{success:true}` 반환하나 기록은 계속 조회됨(사실상 no-op) — 미노출.
- **도메인/액션 명** (list_requests 필터용): image/{generate,edit,outpaint,inpaint,enhance,layer-split,upscale,remove-bg,moderate,image_vision,segment_detect,product_lookup}, video/{generate,extend,retake,upscale,lip-sync,moderate,video_edit,video_vision}, tts/generate, tts-wt/generate, music/generate, sound-effect/generate, stt/transcribe, voice/clone, lora/train, text/chat, media/{ffmpeg,image,graph}.

## Async-only (중요)
- **모든 생성 도구는 async 단일 경로**. `/sync` 엔드포인트는 호출하지 않는다 (빠른 모델/느린 모델 무관). 2026-09 신규 엔드포인트도 대부분 `/sync` 변형이 존재하나(image/generate·edit·upscale·remove-background, video/*, tts, music, sound-effect, stt, tts-wt, watermark) 사용 금지.
- 사유: `/sync` 엔드포인트가 처리시간 초과 시 `{ syncCompleted: false, status: "pending", output: undefined }`를 HTTP 202로 반환하는 dual-shape contract여서 client 처리가 복잡해지고, MCP stdio 도구는 장시간 블록되면 client timeout 위험이 큼.
- 모든 도구 호출 → `request_id` 반환 → `xbrush_get_request(request_id)`로 폴링.
- 스키마에 `sync` 필드 없음. 전달 시 strict 모드로 거부됨.
- **예외(서버에 async 변형이 없는 동기 엔드포인트)**: `xbrush_chat`, `xbrush_voice_clone`, 그리고 2026-09 추가된 **동기 분석 3종** `xbrush_image_vision`(OCR)·`xbrush_image_segment_detect`·`xbrush_image_product_lookup`(각 ~1-7초, `/async`·`/sync` 변형 모두 404) + 무료 `xbrush_media_info`(GET). `services/dispatch.ts`의 `callSync` 사용.

## 2026-09-06 전수조사 요약 (v2.12.0)
- 모델 카탈로그 **128개**(image 40 / video 42 / audio 21 / text 12 / utility 13). `/v1/models/{category}`는 image/video/audio/utility/text만 유효(그 외 400에 목록). 모델 엔트리에 `vendor`, `output`(출력 크기 계약 메타: status/modes/axes/backend), `constraints` 확장.
- **신규 엔드포인트**: `/v1/image/outpaint`(과거 404 → 활성), `/v1/image/inpaint`, `/v1/image/enhance`, `/v1/image/layer-split`, `/v1/image/segment-detect`, `/v1/image/vision`, `/v1/image/product-lookup`, `/v1/video/edit`, `/v1/video/vision`, `/v1/stt/transcribe`, `/v1/tts-wt/generate`, `/v1/media/ffmpeg`, `/v1/media/image`, `/v1/media/graph`, `GET /v1/media/info`, `GET /v1/media/fonts`, `GET /v1/media/luts`, `GET /v1/voice/{id}`, `DELETE /v1/voice/{id}`(버그: 존재하는 voice도 VOICE_NOT_FOUND — 미노출), `POST /v1/stream/chat/completions`(SSE — 미노출).
- **미발견**: `seed-audio-1.0`(audio/featureType `seed-audio`, perSecond 0.00325)의 공개 엔드포인트 — 후보 40여 경로 전부 404(내부용 추정). `gpt-4.1-nano`(prompt_enhance/image_to_prompt)도 여전히 공개 엔드포인트 없음.
- **실측 과금 특이**: `/v1/image/outpaint`·`/v1/image/inpaint`·`/v1/image/enhance`는 제출·완료 모두 `creditCharged 0`(2026-09-06 시점 무과금). `media/*`는 초당/메가픽셀당 극소액(floor 0.002 / 0.0004).

### Image 신규 (역추적 + 실호출 확인)
- **outpaint** `POST /v1/image/outpaint`: `imageUrl`, `canvasWidth`/`canvasHeight`(64~4096 int, **필수**), `scale`(0.05~4), `prompt`, `resolution`(1K/2K/4K). 모델 필드 없음. 출력은 정확히 캔버스 크기(1792×1408 실측), ~40초.
- **inpaint** `POST /v1/image/inpaint`: `imageUrl`, `mask`(**필수** string — https URL / `data:image/png;base64,…` / raw base64 PNG **3형태 모두 성공 실측**; 잘못된 문자열은 워커가 "Invalid base64" 실패), `resolution`(1K/2K/4K), `numInferenceSteps`(1~100), `seed`, `expand`(0~128). prompt 없음(content-aware fill). 출력은 원본 크기.
- **enhance** `POST /v1/image/enhance`: `imageUrl`, `mode`(string, 제출 시 미검증), `n`(1~4), `seed`. **실측 2건 모두 `GENERATION_TIMEOUT` 600s**(무과금) — 도구 설명에 실험적 경고.
- **layer-split** `POST /v1/image/layer-split`: `imageUrl`, `model`(enum `qwen-image-layered`/`seedream-5.0-pro-layerize` — 후자만 카탈로그에 있음, 1K 0.55 / 2K 1.1), `prompt`(≤1000), `size`(1K/2K). 출력 `{layers:[{name,zIndex,boundingBox:{absolute,normalized},description}], imageUrls[], imageDimensions[]}`(index 정렬). 단순 음식 사진은 BytePlus가 거부(환불), 포스터는 background/product/text 3층 성공.
- **segment-detect** (동기 200): `imageUrl`, `prompt`(1~120 필수) → `{detected,count,imageWidth,imageHeight,boxes:[{x,y,width,height,score}]}`(픽셀). 0.01 credit. 기록 action `segment_detect`.
- **vision** (동기 200, OCR): `imageUrl`(https 또는 `data:image/…`), `mode`(text/document — 실측 동일 결과) → `{items:[{text,bbox[x0,y0,x1,y1] 0~1 정규화,confidence}], fullText, locale, imageWidth/Height, analyzedFrames, creditsCharged 0.003}`. 기록 action `image_vision`.
- **product-lookup** (동기 200, 0.05 flat): `imageUrl`, `language`(en/ko/ja/zh), `mode`(grounded/fast) → `{productPresent, brandPresent, brandStatus, brand{…}, product{productName,categoryLabel,keySpecs,confidence,…}, products[], visionEvidence{entities[]}, grounded, sources, searchQueries}`. 기록 action `product_lookup`. 내부 모델 gemini-3.1-flash-lite.
- **generate/edit 신규 필드**: `idea`(비영어 프롬프트, 서버 번역), `cfg`(0~20), `guidanceScale`(0~50), `scheduler`(enum `simple`), `sampler`(string), `background`(auto/opaque/transparent), `triggerWord`. edit: `imageUrls` 상한 **9**(과거 15로 두었던 것 수정), `negativePrompt`, `maskUrl`; **`mode`는 미인식**(deprecated 유지·무시). upscale: `upscaleFactor` **number 1.5~4**, `targetHeight`(256~8192; 1408px→targetHeight 2048 → 2048×2048 실측).

### Video 신규
- **`/v1/video/generate` 검증은 더 이상 모델 인지가 아님** — 모든 모델 동일 superset(2026-09-06 20개 모델 동일 결과): `model, prompt, idea, imageUrl, imageUrls(string|{url,role}), duration(1~30), resolution(512p/768p/480p/720p/1080p/1440p/2160p/2k/4k), aspectRatio(auto/adaptive/16:9/9:16/1:1/4:3/3:4/21:9/custom), generateAudio, consistencyMode(overlay/advanced/auto), negativePrompt, seed, audioUrl, width, height, fps(24/25/48/50), steps, acceleration(none/regular/high), webhookUrl`. **`endImageUrl`·`promptRelevance` 미인식**(무시) — 끝프레임은 `image_urls` role `last_frame`. MCP는 두 필드를 deprecated로 유지(전달해도 무해).
- 신규 i2v 모델: seedance-2.5(4~30s), kling-v3-omni, kling-o1/o3/o3-ref, minimax-h3/-ref(2k/768p), wan-3.0-video/-ref/-prime/-prime-ref(2~30s), gemini-omni-1.1-flash(3~10s), ltx-2.3(1~20s), veo3.1/-fast(4k 티어). `-ref` 모델 = reference-to-video(imageUrls). role 오류 메시지는 여전히 moderation 문구로 새는 버그(변화 없음).
- **video/edit** `POST /v1/video/edit` (async, action `video_edit`): `model`(gemini-omni-1.1-flash, 0.143/s·최소 1초 과금), `videoUrl`(≤2048), `prompt|idea`(1~4000), `audio`(source/model/none). 5초 클립 0.858 credit, 133초. 출력 `{videoUrl, thumbnailUrl, width, height, fps, duration, retimed, audioSource, usageTokens, nsfwDetected, fileSize}`.
- **video/vision** `POST /v1/video/vision` (async, action `video_vision`, 0.003/s): `videoUrl`, `language`(2글자). 출력 `{transcript:{text,language,duration,segments[{start,end,text}]}, fullText, frames[], analyzedFrames, frameWidth/Height, durationSec}`.
- extend: `prompt/idea/negativePrompt/startTime/resolution(360p/540p/720p/1080p)/generateAudio/style(anime/3d_animation/clay/comic/cyberpunk)/seed` 추가(모델 무관 superset); retake: `prompt/idea/startTime(0~20)/endTime(0~40)`; upscale `model` enum realesrgan/seedvr(대소문자 변형 수용).

### Audio 신규
- **TTS 경로**: `/v1/tts/generate`(도메인 `tts`), `/v1/music/generate`(`music`), `/v1/sound-effect/generate`(`sound-effect`) — 과거 `/v1/audio/*` 추측 경로는 404(원래부터 이 경로). 필드: `text`(≤10000), `model`, `voiceId`, `speed`(0.5~2), `pitch`(−12~12), `style`(0~1), `emotion`(happy/sad/angry/fearful/disgusted/surprised/calm/fluent/whisper), `outputFormat`(string — eleven-v3는 무시하고 mp3, Seed는 wav 반환). **`language` 미인식**(deprecated 유지).
- **voiceId 요구(서버 메시지)**: MiniMax speech-* → `moss_audio_*`(list_voices model=speech-2.8-hd); `seed-icl-2.0` → 클론된 `xbseed_*`; `seed-tts-2.0` → "preset voice name"(**목록 미공개** — `GET /v1/tts/voices`는 model 파라미터를 무시하고 항상 eleven-v3 21개 이름만 반환; 추측 3종 실패); eleven-v3는 voiceId 없이 동작(기본 Rachel, `GET /v1/tts/voices`의 name 사용 가능 — Aria 실측).
- **tts-wt** `POST /v1/tts-wt/generate`(도메인 `tts-wt`): `text, model, voiceId, speed, style` → **202 + status completed 즉시**(1~7초). 기록 output `{audioUrl, duration, voiceId, alignment:{characters[], character_start_times_seconds[], character_end_times_seconds[]}, normalizedAlignment}`. MCP는 `xbrush_tts_generate.with_timestamps:true`로 라우팅.
- **stt** `POST /v1/stt/transcribe`(도메인 `stt`, whisper-1 0.00013/s, async 202): `audioUrl`(**WAV만** — RIFF 헤더 제출 시 검사, mp3는 400), `language`(ISO-639-1 소문자). 출력 `{text, model, duration, language}`. WAV는 `media/ffmpeg extract-audio + output.format wav` 또는 로컬 변환 후 `xbrush_file_upload`.
- music: `duration` **5~300**, `imageUrl`(이미지 조건부), `negativePrompt`, `seed`; 모델 enum은 업스트림 메시지로 노출(lyria2/lyria3/lyria3-pro). sound-effect 모델 enum: pixverse-sound-effects/pixverse/elevenlabs-sound-effects/stable-audio-sfx. lyria3 5초 요청 → 30.8초 트랙 0.052.

### Voice clone (동기, 2026-09-06 성공 실측)
- 202 + `status:"completed"` (MiniMax 10초, Seed 6초). **과금 flat 2 credits**(eleven/speech-2.8-hd/speech-2.6-hd) / **2.6**(seed-icl-2.0) — 과거 "50 credits" 기록은 폐기. 실패 시 환불.
- 기록 output `{success, data:{voice_id, name, provider, demo_audio_url, requires_verification, stored_audio_urls?, audio_hashes?, vendor_status?, available_training_times?}}`; input에는 `display_name`(사용자 이름)과 서버 생성 `name`(`moss_audio_*`/`xbseed_*`). MCP 도구는 제출 직후 기록을 GET해 voice_id를 렌더.
- 필드: `name`, `audioUrls`, `model`(enum eleven/speech-2.8-hd/speech-2.6-hd/**seed-icl-2.0**), `voiceId`(**xbseed_* 전용** — 기존 Seed voice 재학습, `available_training_times` 15), `description`, `removeBackgroundNoise`, `webhookUrl`. 28초 TTS mp3 샘플로 MiniMax·Seed 모두 성공.
- `GET /v1/voice/list?model=` enum: eleven/speech-2.8-hd/speech-2.6-hd/seed-icl-2.0(TTS 모델 id는 400 → MCP가 매핑). seed는 `voices:[]` + note("vendor listing is not supported"). `GET /v1/voice/{voiceId}` → `{voiceId,name,model,provider,description,demoAudioUrl,status,retrainable,createdAt}`. `DELETE /v1/voice/{voiceId}`는 존재하는 voice에도 VOICE_NOT_FOUND(버그) — 테스트로 만든 voice 2개(`moss_audio_5e431c90…`, `xbseed_1d4a5c0b…`)는 삭제 불가로 잔존.

### Media utilities (category utility, 도메인 `media`)
- **ffmpeg** `POST /v1/media/ffmpeg`: `inputs`(1~10 URL), `operations`(1~20, op enum 15: trim/concat/transcode/scale/extract-audio/thumbnail/watermark/gif/speed/crop/rotate/fade/subtitle/merge-audio/still; op 파라미터는 단일 superset DTO — start,end,duration,codec(h264/h265/vp9),crf,bitrate,width,height,fit(crop/contain/pad),at,count,position(9방향),margin,scale,opacity,fps,loop,factor,x,y,aspect,degrees(90/180/270),type(in/out),src(URL),style(default/boxed/large)), `output{format(mp4/webm/mov/gif/mp3/m4a/wav/jpg/png),fps(1~120),quality}`. 제출 시 입력 메타를 읽음(못 읽으면 400 INVALID_INPUT, 무과금). 2초 trim: 0.002 credit, 2.3초. 출력 `{videoUrl, thumbnailUrl, width, height, durationSeconds, sizeBytes, format}`.
- **image** `POST /v1/media/image`: `inputs`(1~6), `operations`(≤10, op enum 37), `output{format jpg/png/webp/gif, quality 1~100}`. 범위: width/height ≤12000, fit contain/cover/fill, gravity 9방향, degrees 90/180/270, direction horizontal/vertical/grid, columns ≤6, gap ≤128, scale/opacity 0.01~1, size 8~512, strokeWidth ≤16, brightness/contrast/saturation/hue ±100, sigma 0.1~10, amount 0.1~3, mode normalize/level/equalize, strength 1~30, method auto/deskew/perspective. 256px webp resize 0.0006 credit. 출력 `{imageUrls[], width, height, format, sizeBytes}`.
- **graph** `POST /v1/media/graph`: `inputs:[{id,url}]`(id `^[a-z][a-z0-9_]{0,31}$`), `nodes:[{id, op, from:{port: id|id[]}, params:{…}}]`, `output:{from, format(mp4/webm/gif/mp3/m4a/wav), quality(low/medium/high), fps}`. **params는 반드시 `params` 객체 안**(노드 최상위 키는 무시됨 — trim start 최상위에 두면 자르지 않고 통과, 실측). 포트: 대부분 `in`(concat/xfade/blend/amix/aconcat은 배열), overlay `{base,over}`, alphamerge `{base,alpha}`, set_audio `{video,audio}`, 소스 op(color/silence) 없음. op 목록·op별 허용 params는 서버 에러 메시지("unknown param X — allowed: …", "unknown port X — ports: …")로 전부 역추적해 `src/schemas/media.ts`/도구 설명에 요약. drawtext `font`는 `GET /v1/media/fonts`(406 엔트리·206 고유, ko/ja/zh/en), lut3d `lut`는 `GET /v1/media/luts`(cinematic_v1, citypop_v1, digicam_v1, golden_v1, monofilm_v1, moody_v1, retrofilm_v1, …). 출력은 ffmpeg와 동일.
- **info** `GET /v1/media/info?url=`: 무과금 동기. video `{width,height,fps,durationInSeconds,hasVideo,hasAudio,sizeBytes,videoCodec}` / image `{kind,format,width,height,frames,hasAlpha,hasIccProfile,exifOrientation,sizeBytes}`; 못 읽으면 **HTTP 200 + `{error, url}`**(s3 객체 기준 — assets.xbrush.ai CDN URL만 사실상 가능).

### 파일 업로드
- `POST /v1/files/upload`(multipart `file`) 응답 `{success, url, fileKey, fileSize, mimeType, hash, deduplicated}`(content-hash 중복 제거). presign `mimeType` 허용목록 확장(svg/avif/heic/heif, mov/webm/mp2t/avi/mkv, mp3/wav/mp4/aac/flac/ogg/webm, text/plain·vtt·srt, safetensors, m3u8, zip) → `services/file-upload.ts` MIME 맵 동기화.

## LLM chat — `xbrush_chat` (동기 예외, 중요)
- **엔드포인트**: `POST /v1/chat/completions` (OpenAI 호환). **동기 전용** — async 변형 없음. 스트리밍은 별도 `POST /v1/stream/chat/completions`(SSE, 2026-09 신설 — 동기 경로에 `stream:true`를 주면 400으로 안내). MCP 미노출.
- **모델 12종 (2026-09-06)**: `z-ai/glm-5.2`, `bytedance/seed-2.0-mini`, `bytedance/seed-2.1-turbo`, `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`, `anthropic/claude-sonnet-5`, `anthropic/claude-opus-5`, `deepseek/deepseek-v4-flash`, `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/gpt-5.4`, `xai/grok-4.3` — 전부 실호출 확인. vision은 glm-5.2·deepseek 제외 전부(`maxImages 10`, tokensPerImage 1200~50000). function calling 전 모델(toolsFixedTokens 50~500; forcedChoiceHonored는 glm만 false).
- **요청 필드** (2026-09-06 재역추적): `model`, `messages`(1~1000, role system|user|assistant|tool — `developer` 거부), `content`(string 또는 `text`/`image_url` 파트 배열 — `input_audio`/`video_url`/`file`은 "unknown content part type"), `max_tokens`/`max_completion_tokens`(1~65536), `temperature`(0~2), `top_p`(0~1), `frequency_penalty`/`presence_penalty`(−2~2), `stop`, `reasoning_effort`(**enum `none/minimal/low/medium/high/max`** — low/medium 신규), `tools`, `tool_choice`, `parallel_tool_calls`(false → 400), `stream`(true → 400), **`response_format`(신규 — `{type:"json_object"}` | `{type:"json_schema", json_schema:{name, schema, strict}}`; type 외 값·json_schema 누락은 400, OpenAI는 name 필수(업스트림 400))**. 여전히 미인식: `n`, `seed`, `logprobs`, `top_logprobs`, `logit_bias`, `user`, `metadata`, `stream_options`.
- **모델별 warnings 체계** (`constraints` 플래그 ↔ 응답 top-level `warnings[]`): `samplingHonored:false`(anthropic/*, gemini-3.5, gpt-5.4 — temperature/top_p PARAM_DROPPED), `penaltiesHonored:false`(gemini, anthropic, grok), `stopHonored:false`(grok-4.3 — stop 무시 실측), `structuredOutputHonored:true`(openai/*, gemini-3.5 — 그 외 모델은 response_format PARAM_DROPPED; seed-2.0-mini·glm-5.2 실측), `imageDetailHonored:true`(openai — detail low로 과금 차이), `reasoningUnsupported`(gpt-4o/-mini), `reasoningMaxClampsToHigh`(gemini, grok), `reasoningMinimalMapsToLow`(gpt-5.4), `reasoningNoneMapsToMinimal`(gemini-3.5 — none 요청 시 PARAM_ADJUSTED), `reasoningMidTiersPromoteToHigh`(glm-5.2 — medium 요청 시 147 reasoning 토큰 실측), `toolsRequireReasoningNone`(gpt-5.4 — tools+reasoning 시 none으로 조정 PARAM_ADJUSTED 실측), `forcedChoiceHonored:false`(glm — PARAM_NOT_HONORED). `xbrush_list_models` 포맷터가 전부 렌더.
- **Vision / Function calling / 게이트웨이 30초 / 과금 / 플랫폼 system 프롬프트**: 2026-07 조사 내용 유지 — content 파트는 `text`/`image_url`만, `detail` 패스스루(seed-2.0-mini low ≈ 98 vs high ≈ 1,390 토큰), tool_calls `arguments`는 JSON 문자열, 미응답 tool_call 있으면 400, 함수 ≤32·이름 `^[a-zA-Z0-9_-]{1,64}$`·32KB, 엣지 게이트웨이 ~30초 HTML 504(`GATEWAY_TIMEOUT` 매핑, 기록으로 회수·실패 시 환불), 응답 `id`가 request_id(domain text/action chat), 서버가 system 메시지(~280자 adult platform 고지)를 앞에 삽입(baseTokens 100). 가격(1M당 input/output/cached): glm 1.82/5.72/0.338, seed-2.0-mini 0.13/0.52/0.13, seed-2.1-turbo 0.65/3.25/0.13, gemini-3.1 0.325/1.95/0.325, gemini-3.5 0.39/3.25/0.039, sonnet-5 3.9/19.5/0.39, opus-5 6.5/32.5/0.65, deepseek 0.182/0.364/0.0364, gpt-4o 3.25/13/1.625, gpt-4o-mini 0.195/0.78/0.0975, gpt-5.4 3.25/19.5/0.325, grok-4.3 1.625/3.25/0.26.

## LoRA 학습/적용
- **`xbrush_lora_train`** → `POST /v1/lora/train` (async, domain `lora` / action `train`, estimatedTimeout ~2400s). 인식 필드: `name`(필수), `imageUrls`(필수 1~80 HTTPS), `model`, `triggerWord`(서버 기본 `"TOK"`), `steps`(500~8000, 기본 1000), `image`(URL — 용도 미확인), `webhookUrl`. **과금 per1kStep 2 credits**(steps 500 → 1 credit), 실패 시 전액 환불(2026-09-06 재확인).
- **`model`은 제출 시점 미검증** — `__nope__`도 202 수용 후 failed(환불). worker 지원 목록(2026-09-06 에러 메시지): `FLUX.1-dev, z-image-turbo, sdxl, animagine-xl-4.0, netayume-v4, anima, qwen-image, x-image-alpha`. registry의 lora_train 모델: flux.1-dev, z-image-turbo, qwen-image, netayume-v4, anima-base(5개). 백엔드 FAL(이미지 zip).
- **적용**: `/v1/image/generate`·`/v1/image/edit`가 `loras` 배열 인식 — 원소 `{url, weight}`(weight 0~2). `triggerWord` 필드도 인식(프롬프트에 직접 써도 됨).

## Lip-sync — fabric-1.0 talking photo (2026-07, 변화 없음)
- `/v1/video/lip-sync` 검증은 **모델 무관 필드 superset**: `videoUrl`, `imageUrl`, `audioUrl`, `text`, `voiceId`, `duration`(1~60), `resolution`(480p/720p), `webhookUrl`. 모델별 필수 조합은 후단 `INVALID_INPUT`(예: "videoUrl is required for pixverse-lipsync model").
- **fabric-1.0 / fabric-1.0-fast** (VEED): 정지 사진(`imageUrl`) talking photo. 음성은 `audioUrl` 또는 내장 TTS(`text`+`voiceId`). 영상 기반은 pixverse-lipsync / infinite-talk(`videoUrl`, infinite-talk는 byResolution 480p 0.325 / 720p 0.65).

## Sound effect — 텍스트 기반 모델 (2026-07, 변화 없음)
- featureType `soundeffect-text`: `elevenlabs-sound-effects`, `stable-audio-sfx` — prompt가 주 입력. 단 **`videoUrl`은 모델 무관 endpoint 필수**(prompt-only는 400 REQUIRED). 인식 필드: `model`, `videoUrl`, `prompt`, `duration`(1~30), `webhookUrl`.

## 이미지 크기 지정 (모델 calType별, 중요)
- 이미지 모델은 `calType`에 따라 출력 크기 지정 방식이 다름:
  - **`perMegapixel` / `perImage`** (`flux.*`, `z-image-turbo`, `qwen-image`, `wan-2.7`, `anima-base`, `netayume-v4`, `x-image-alpha` 등) → `width`/`height` 사용.
  - **`byResolution` / `byResolutionAndQuality`** (`gpt-image-2`, `seedream-4.0/4.5/5.0-pro`, `nano-banana-pro`, `nano-banana-2` + 각 `-edit`) → `resolution`(`"1K"`/`"2K"`/`"4K"`, nano-banana-2는 `"0.5K"`도) + `aspect_ratio` 사용. **`width`/`height`는 무시됨**. **단 `aspect_ratio:"custom"`이면 예외**.
  - `gpt-image-2`/`-edit`(byResolutionAndQuality)만 `quality`(low/medium/high) 추가 지원. 미지정 시 서버 기본은 `high`(최고가).
- `src/tools/image.ts`의 `RESOLUTION_BASED_MODELS`(2026-09-06 카탈로그 기준 변화 없음)가 해상도 기반 모델에 `width`/`height`가 오면 제출 전 거부(런타임 가드). **예외: `aspect_ratio==="custom"`이면 통과**.
- **`gpt-image-2`/`-edit`가 받는 `aspect_ratio`** (2026-06 실측): `1K`/`2K`는 `1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 16:9, 9:16, 21:9, 1.91:1`(10종), `4K`는 `16:9, 9:16, 21:9, 1.91:1`(4종). `aspect_ratio`/`resolution`은 free-form string(서버 미검증 통과)이라 **클라이언트 화이트리스트 가드는 두지 않음** — describe로만 안내.
- **임의 픽셀 사이즈(`aspect_ratio:"custom"`)** (2026-06-23 실측): `gpt-image-2`/`-edit`에 `custom` + `width`/`height`(둘 다 필수, 16의 배수, 최장변 ≤3840, 총픽셀 655,360~8,294,400) → 정확히 그 픽셀. 정확 픽셀은 gpt-image-2 한정(seedream-4.5는 비율만 유지 ~2K, nano-banana-pro는 무시).

## 다중 레퍼런스 이미지 (image edit)
- `/v1/image/edit`는 **단일 `imageUrl`(필수) + `imageUrls`(선택, 최대 9)**. 서버가 `[imageUrl, ...imageUrls]`로 중복 제거 후 모델엔 `images` 배열로 전달. `imageUrls`만 보내면 400(`imageUrl` 필수).

## 비디오 generate — reference-to-video (seedance 2.x, 중요)
- **`image_url`은 optional** — t2v(prompt만)·reference-to-video(`image_urls`)에서 시작 프레임 불필요.
- **`prompt` vs `idea`**: `prompt`=**영어**(모델에 그대로), `idea`=**비영어**(서버 번역 후 전달). 이제 image generate/edit, video edit/extend/retake도 동일하게 `idea`를 받음.
- **`imageUrls` 원소는 두 형식**: URL 문자열 또는 **`{url, role}`**(`first_frame`/`last_frame`/`reference_image`). 한 배열로 시작·끝 프레임 + 레퍼런스 통합. 문자열 배열 하위호환·혼합 허용. `imageUrl` 없이 단독 사용 가능.
- **`@ImageN` 넘버링 (오해 주의)**: `image_urls`의 **1-based 배열 위치**(frame role 포함). `src/tools/video.ts` `checkImageReferences` 가드가 범위 초과·frame 지칭을 제출 전에 차단(변화 없음).
- **role 검증 주의**: 잘못된 `role`은 서버가 거부하지만 메시지가 `MODERATION_INPUT_TEXT`("sensitive content")로 새는 버그(2026-09-06 재확인). role은 free-form 유지.

## 도구 추가 패턴
1. `src/schemas/<domain>.ts` — Zod 입력 스키마 정의 (strict, **`sync` 필드 추가 금지**)
2. `src/tools/<domain>.ts` — async면 `submitAsync`, 서버에 async 변형이 없는 동기 엔드포인트만 `callSync`(`services/dispatch.ts`)
3. `src/index.ts` — 새 모듈이면 `registerXxxTools(server)` 등록
4. `test/schemas/<domain>.test.ts` + `test/tools/<domain>.test.ts` 추가
5. `test/integration/server.test.ts` + `test/integration/disabled-tools.test.ts`의 도구 개수/이름 목록 업데이트 (스냅샷은 `npx vitest run -u`)

## 테스트
- **Vitest 4-tier**: `test/{schemas,services,tools,integration}/` (+ `test/schemas/survey-2026-09.test.ts`, `test/tools/survey-2026-09.test.ts`, `test/{schemas,tools}/media.test.ts`)
- 현재 v2.12.0 기준 **524 케이스** 통과
- `npm test` / `npm run test:watch`
- 통합 테스트는 axios mock 사용, 실 API 호출 없음
- e2e(`npm run test:e2e`, `XBRUSH_E2E_PAID=1`로 유료 파이프라인) — MCP Inspector 또는 Claude Code에서 수동 E2E

## 배포

```bash
npm publish --access public
```

- `prepublishOnly`: build + test 자동 실행
- npm org: `@lweight` (계정: lightweightkr)

## 규칙
- 커밋 메시지: 한국어
- Transport: stdio 전용
- 도구 37개 (Image 12, Video 7, Audio 5, Text 1, Media 4, Utility 8)
  - Image: generate, edit, outpaint, inpaint, enhance, layer_split, segment_detect(동기), vision(동기), product_lookup(동기), upscale, remove_bg, lora_train
  - Video: generate, edit, vision, upscale, lip_sync, extend, retake
  - Audio: tts_generate(+with_timestamps), stt_transcribe, music_generate, sound_effect_generate, voice_clone(동기)
  - Text: chat(동기 LLM)
  - Media: media_ffmpeg, media_image_process, media_graph, media_info(동기·무료)
  - Utility: content_moderate, watermark_add, list_models, list_voices, get_request, list_requests, file_upload, check_health
- utility 모델 `gpt-4.1-nano`(prompt_enhance/image_to_prompt)와 audio `seed-audio-1.0`은 **공개 엔드포인트 미발견**(2026-09-06 재확인) — 도구화 대상 아님
