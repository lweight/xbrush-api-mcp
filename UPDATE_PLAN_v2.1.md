# @lweight/xbrush-api-mcp 업데이트 계획서 (v2.1)

> 작성일: 2026-05-25
> 현재 버전: **v2.0.0** → 목표: **v2.1.0** (additive, breaking 없음)
> 근거: prod API(`api.xbrush.run`) 실데이터 전수조사 — `GET /v1/models` 덤프(67개 모델), 엔드포인트 60+종 probe(404/401/405 판별), 빈 body POST `{}` → 422 검증 에러로 신규 엔드포인트 요청 스키마 역추적. 유효 API 키로 인증 호출 수행(읽기·검증만, 과금 0).

---

## 0. 한눈에 보는 요약

- **API가 크게 확장됨.** 모델 11종(추정) → **67종**, 카테고리 3 → **4(image/video/audio/utility)**, featureType **17종**.
- **현재 MCP(16도구)가 호출하지 않는 신규 엔드포인트 6종 확정** (probe 401 + 422 스키마 확보): `video/extend`, `video/retake`, `image/moderate`, `video/moderate`, `voice/clone`, `voice/list`(GET) + `lora/train`.
- **명백한 버그 1건(High):** `list_models`의 `formatCredit`가 신규 중첩 `creditConfig`(예: `{"720p":{"audio":..}}`)를 `[object Object]`로 렌더. 프리미엄 모델 대부분(veo3/kling-v3/seedream/nano-banana 등)에서 가격이 깨져 보임. **모델 디스커버리 도구의 핵심 가치 훼손.**
- **모델 ID는 `z.string()`이라 신규 모델 67종은 코드 수정 없이 이미 호출 가능** (설계가 잘 버팀). 단 `list_models category` enum에 `utility` 누락, e2e 테스트의 모델 ID 3건 stale.
- **공개 OpenAPI/Swagger/docs 없음**(전 경로 404). 요청 스키마는 **422 probing으로 1차 확보**했고, 옵션 필드는 staged validation 한계상 백엔드 확인 또는 추가 probing 필요.
- **권장 범위:** Tier 1(저위험·스펙 확정) 먼저 → Tier 2(voice_clone/lora_train, 추가 스펙 필요)는 분리. **§4에서 범위 결정 필요.**

---

## 1. 조사 방법 & 증거

### 1.1 조사 경로 (재현 가능)

```bash
# 1) 모델 전수 덤프 (인증, 무과금)
curl -s https://api.xbrush.run/v1/models -H "X-API-Key: $KEY" | jq .

# 2) 엔드포인트 존재 판별 (무인증 POST): 404=없음, 401=존재(인증필요)
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.xbrush.run/v1/<path> -d '{}'

# 3) 요청 스키마 역추적 (인증 + 빈 body): 400/422 응답의 fields[]가 필수 필드 노출. 과금 0.
curl -s -X POST https://api.xbrush.run/v1/<path> -H "X-API-Key: $KEY" -H 'content-type: application/json' -d '{}'
```

- OpenAPI/Swagger/Redoc/`/docs`/`/openapi.json` **전부 404** → 자동 스펙 생성 불가. probing이 유일한 1차 출처.
- `GET /v1/health`는 무인증 200. `GET /v1/models`는 무인증 401.

### 1.2 모델 카탈로그 (`GET /v1/models`, 67종)

| category | 개수 | featureType (개수) |
|---|---|---|
| **image** | 32 | generate(15), edit(9), outpaint(2), upscale(1), remove_bg(1), moderate(1), lora_train(3) |
| **video** | 27 | i2v(19), extend(2), lipsync(2), upscale(2), retake(1), moderate(1) |
| **audio** | 6 | tts(4), music(1), soundeffect(1) |
| **utility** | 2 | image_to_prompt(1), prompt_enhance(1) — 둘 다 `gpt-4.1-nano` |

**모델 객체 스키마(현행):**
```json
{
  "id": "veo3.1", "modelType": "...", "name": "...",
  "category": "video", "featureType": "i2v", "calType": "perSecond",
  "creditInfo": { "creditValue": 0.13 }            // 평면형
  // 또는
  "creditInfo": { "creditConfig": { "720p": { "audio": 0.52, "noAudio": 0.26 } } }  // 중첩형 ← 현 formatter가 못 다룸
}
```

- **calType 9종:** perSecond, perMegapixel, byResolution, bySizeAndQuality, per1kCharacter, per1kStep, perImage, perRequest, perMegapixelFrame.
- 비디오 생성은 전부 `i2v`(image-to-video) — **text-to-video 없음**(`/v1/video/text-to-video` 404). 현 `video_generate`가 `image_url` 필수로 둔 것은 정확.
- outpaint는 **전용 모델**(flux-outpaint, qwen-outpaint)이 있으나 `/v1/image/outpaint`는 404 → `/v1/image/edit`에 outpaint 모델을 넘기는 방식으로 추정(§3.5).

### 1.3 엔드포인트 인벤토리 (probe 확정)

**존재(401/200):**
```
image:  generate, edit, upscale, remove-background, moderate★
video:  generate, upscale, lip-sync, extend★, retake★, moderate★
audio:  tts/generate, music/generate, sound-effect/generate
lora:   train★
voice:  clone★(POST), list★(GET)
util:   files/upload, files/presign, requests, requests/{id}, models, health
```
★ = 현재 MCP에 도구 없음.

**부재(404, 참고 — 향후 오인 방지):** `image/outpaint`, `image/inpaint`, `image/face-swap`, `image/describe`, `audio/generate`, `audio/transcribe`, `stt/*`, `dubbing/*`, `avatar/*`, `3d/*`, `video/text-to-video`, `video/interpolate`, `video/effects`, `watermark/remove`, `voice/create`. utility의 `image_to_prompt`/`prompt_enhance`는 **공개 엔드포인트 없음**(13종 후보 전부 404) → 다른 엔드포인트의 내부 옵션으로 추정, 이번 범위 제외.

### 1.4 신규 엔드포인트 요청 스키마 (422 역추적으로 확정)

빈 body `{}` 전송 시 반환된 `error.fields[]` 기준. **필드명은 camelCase, 제약 포함.**

| 엔드포인트 | 필수 필드(확정) | 옵션/미확정 |
|---|---|---|
| `POST /v1/video/extend` | `model`(string), `videoUrl`(url), `duration`(number, 1–20) | prompt? resolution? (staged) |
| `POST /v1/video/retake` | `model`(string), `videoUrl`(url), `endTime`(number, ≥0) | prompt? startTime? (staged) |
| `POST /v1/image/moderate` | `imageUrl`(url) | — (단일 필드, 확정) |
| `POST /v1/video/moderate` | `videoUrl`(url) | — (단일 필드, 확정) |
| `POST /v1/lora/train` | `name`(string), `imageUrls`(array, 1–80, HTTPS) | model? steps? triggerWord? (staged) |
| `POST /v1/voice/clone` | `name`(string), `audioUrls`(array, ≥1, url) | description? language? (staged) |

> **Staged validation 주의:** API가 단계별 검증(model 먼저 → 모델별 필드)을 하므로, 빈 body 1회로 *모든* 필드가 드러나지 않을 수 있다. 위 표의 **필수 필드는 신뢰**하되, 옵션 필드는 §2.1 게이트에서 확정한다. 검증 통과 body를 보내면 과금되므로 무작정 채우지 않는다.

기존 엔드포인트 재확인: `video/generate`→`model` 필수, `tts/generate`→`text` 필수(model 옵션 ✓ 현 스키마 일치), `image/edit`→`model`+`imageUrl` 필수(`prompt`는 빈 body에서 미노출 → outpaint 모델에선 옵션일 가능성, §3.5).

### 1.5 `GET /v1/voice/list` 구조

```json
{ "success": true, "provider": "elevenlabs", "model": "eleven_v3",
  "data": { "provider": "...", "voices": [ ... ], "pagination": { ... } } }
```
- `?model=<tts 모델 id>`로 필터(예: `?model=speech-2.8-hd` → provider=minimax). 무필터 기본 응답 **≈158 KB** → 25KB 한도 초과. 도구는 `model` 권장 + voices 요약 + pagination 통과 필요.

### 1.6 요청 상세/목록 구조 (현 코드와 일치 확인)

`GET /v1/requests` → `{ data:[], hasMore, nextCursor }`. 항목: `{ requestId, status, domain, action, creditCharged, createdAt, credits:{charged,refunded,balance_after}, input:{...}, output?:{...} }`. 현 `list_requests`/`get_request` 처리와 일치(✓).

---

## 2. 갭 분석 (현재 16도구 vs 현행 API)

### 2.1 신규 기능 — 도구 없음 (구현 후보)

| # | 엔드포인트 | 제안 도구 | Tier | 비고 |
|---|---|---|---|---|
| 1 | `POST /v1/video/extend` | `xbrush_video_extend` | **1** | 스키마 확정. i2v 결과 영상 연장 |
| 2 | `POST /v1/video/retake` | `xbrush_video_retake` | **1** | 스키마 확정. endTime 기준 재생성(ltx-2.3-retake) |
| 3 | `POST /v1/image/moderate` + `POST /v1/video/moderate` | `xbrush_content_moderate` (통합) | **1** | url 종류로 분기(watermark_add 선례). NSFW 필터 |
| 4 | `GET /v1/voice/list` | `xbrush_list_voices` | **1** | tts `voice_id` 디스커버리. 요약/페이지네이션 필수 |
| 5 | `POST /v1/voice/clone` | `xbrush_voice_clone` | **2** | 스키마 1차 확정. **동의/법적 고지 + 클론 voice 사용법(→tts) 확인 필요** |
| 6 | `POST /v1/lora/train` | `xbrush_lora_train` | **2** | 장시간 학습. **소비측 미해결**: 학습된 LoRA를 generate에서 쓰는 경로(파라미터/조회 엔드포인트)가 불명(`GET /v1/lora` 404). 스펙 확인 전 보류 권장 |

### 2.2 버그 / 정합성 (수정 대상)

| # | 위치 | 문제 | 심각도 |
|---|---|---|---|
| B1 | `tools/models.ts:20-24` `formatCredit` + `types.ts:69-72` `creditInfo.creditConfig` 타입 | 타입이 `Record<string,number>`인데 실제는 **중첩 객체**. `${k}=${v}`가 `1:1=[object Object]`/`720p=[object Object]` 출력. veo3/kling-v3/seedream/nano-banana/gpt-image-2/hailuo 등 다수 영향 | **High** |
| B2 | `schemas/models.ts:8` `MODEL_CATEGORIES` | `["image","video","audio"]` — 실제 `utility` 카테고리 누락 → `category:"utility"` 필터가 Zod strict로 거부 | Medium |
| B3 | `tools/models.ts:62-67` description | "category: 'image','video','audio'" 안내 — utility 및 신규 featureType(extend/retake/moderate/lora_train) 미반영 | Low |
| B4 | `test/e2e/xbrush-api.e2e.test.ts` | stale 모델 ID: `qwen-image-edit-re`(→`qwen-image-edit`), `pixverse`(→`pixverse-lipsync`), `RealESRGAN`(→`realesrgan`). 또한 L228 `sync:false` 전달 — v2.0 strict에서 거부됨. 12-path 목록에 extend/retake/moderate 미포함 | Medium |
| B5 | `schemas/image.ts` edit `mode`, `tools/image.ts:104` | `/v1/image/outpaint` 404 확인. outpaint는 전용 모델(flux-outpaint/qwen-outpaint)로 추정 → `mode` 파라미터가 실제 서버에서 의미 있는지 미검증. 잘못된 필드 전송 리스크 | Medium(확인) |

### 2.3 기존 도구 파라미터 보강 (선택, additive)

신규 모델이 지원하나 현 스키마에 없는 옵션 — **모두 §2.1 게이트 확정 후에만**:
- `video_generate`: `resolution`(480p/720p/1080p/4k — byResolution·creditConfig 다수), `audio`/`generateAudio`(veo3·kling-v3 audio/noAudio 가격), `duration`을 5|10 고정 → 모델별 가변 검토.
- `image_generate`: `aspect_ratio`+`quality`(gpt-image-2 bySizeAndQuality: 1:1/2:3/3:2 × low/medium/high), 해상도 tier(byResolution: 0.5K/1K/2K/4K) — 현 `width/height`(256–4096)가 이들 모델엔 부적합할 수 있음.

> 위는 **잘못 보내면 422**. 이번 릴리스 필수 아님. 별도 minor로 분리 가능.

---

## 3. 목표 변경점 (v2.1.0)

### 3.1 신규 도구 (Tier 1: 4종) — 16 → 20

모든 생성성 도구는 **async + `xbrush_get_request` 폴링**(프로젝트 불변 규칙, `/sync` 금지). `idempotentHint: false` 강제(중복 과금 방지).

```
xbrush_video_extend     → POST /v1/video/extend
  in:  model(req), video_url(req,url), duration(req,int 1-20), prompt?(추정)
  body: { model, videoUrl, duration, prompt? }

xbrush_video_retake     → POST /v1/video/retake
  in:  model(req), video_url(req,url), end_time(req,number ≥0), prompt?(추정)
  body: { model, videoUrl, endTime, prompt? }

xbrush_content_moderate → POST /v1/image/moderate | /v1/video/moderate
  in:  image_url XOR video_url (정확히 하나)
  분기: image_url → /v1/image/moderate {imageUrl}; video_url → /v1/video/moderate {videoUrl}
  annotations: readOnlyHint=false(과금·산출물 생성), idempotentHint=false

xbrush_list_voices      → GET /v1/voice/list
  in:  model?(권장, tts 모델 id), cursor?
  out: voices 요약(id/name/언어/성별 등 가용 필드) + pagination. 25KB 한도 위해 필드 축약.
  annotations: readOnlyHint=true, idempotentHint=true
```

### 3.2 신규 도구 (Tier 2: 2종, 범위 결정 필요) — +2 → 22

```
xbrush_voice_clone  → POST /v1/voice/clone
  in: name(req), audio_urls(req, array ≥1), description?/language?(미확정)
  ★ 확인: 반환 voice_id를 tts_generate.voice_id로 쓰는가? 동의/저작권 고지 문구 필요?

xbrush_lora_train   → POST /v1/lora/train
  in: name(req), image_urls(req, array 1-80 HTTPS), model?/steps?/trigger_word?(미확정)
  ★ 미해결(보류 권장): 학습 결과 LoRA를 image_generate에서 참조하는 경로 불명.
    GET /v1/lora 404 → 목록/사용 API 확인 전엔 "학습만 되고 못 쓰는" 반쪽 도구 위험.
```

### 3.3 버그 수정

- **B1 (High):** `types.ts` `creditInfo` 타입을 중첩 허용으로 정정 + `formatCredit`를 재귀/요약 렌더로 교체. 예: 평면 `0.13 credits/perSecond`, 중첩 `720p: audio 0.52 / noAudio 0.26` 식 1줄 요약. truncation 안전.
- **B2:** `MODEL_CATEGORIES`에 `"utility"` 추가.
- **B3:** `list_models` description에 utility + 신규 featureType 반영.
- **B4:** e2e 모델 ID 갱신, `sync:false` 제거, probe path 목록에 `video/extend`·`video/retake`·`image/moderate`·`video/moderate`·`lora/train`·`voice/clone` 추가, `voice/list` GET 추가.
- **B5:** image_edit outpaint 동작 확정. `mode` 파라미터 유지/제거 결정 + outpaint 모델 사용법을 description에 명시.

### 3.4 변경하지 않는 것 (검증됨)

- 모델 ID는 `z.string()` 유지 — 67종 신규 모델이 코드 수정 없이 동작. 화이트리스트 enum 금지(서버 모델 추가마다 강제 업그레이드 = UX 악화).
- 기존 16도구 시그니처/응답 포맷 불변 → **breaking 없음 → v2.1.0(minor)**.
- async 단일 경로, `/sync` 미호출, Zod strict 유지.

### 3.5 outpaint 확정 절차 (B5)

1. `/v1/image/edit`에 `model:"qwen-outpaint"` + `imageUrl` + (target 크기?) 1회 실호출(최저가, 과금 소액) → 동작·필수필드 확인.
2. `mode` 필드가 무시되는지/거부되는지 확인. 거부면 스키마에서 제거(breaking 아님, optional이라 무방).
3. 결과를 image_edit description에 "outpaint는 outpaint 계열 모델 선택으로 수행" 명시.

---

## 4. 범위 결정 (사용자 확인 필요)

이 두 가지가 Phase 구성과 일정을 가른다:

- **(A) 릴리스 범위**
  - 옵션 1 — **Tier 1만**(video_extend, video_retake, content_moderate, list_voices) + 버그 B1–B5. → 빠르고 안전, 전부 스펙 확정.
  - 옵션 2 — **Tier 1 + voice_clone**. lora_train만 보류.
  - 옵션 3 — **전부(Tier 1+2)**. lora_train 소비측 스펙 확보 전제.
- **(B) 스펙 확정 방식** (옵션 필드/outpaint/lora 소비측)
  - 사내 백엔드 DTO·프론트 호출부 확보 가능?
  - 아니면 인증 422 staged probing + 최저가 모델 실호출 1회씩으로 MCP 측에서 자체 확정?

> 권장: **(A) 옵션 1로 v2.1.0 우선 출시**, voice_clone/lora_train은 스펙 확정 후 v2.2.0. moderation은 통합 도구.

---

## 5. 리스크 & 전제

| 리스크 | 완화 |
|---|---|
| 옵션 필드 추측 → 422 | 필수 필드만으로 우선 구현, 옵션은 게이트 확정 후 추가. probe는 빈 body(무과금)만. |
| `idempotentHint` 오설정 → 중복 과금 | 신규 생성 도구 전부 `false`. 통합 moderate도 false. |
| voice_clone 오남용(타인 음성) | description에 동의/적법성 고지. Tier 2로 분리. |
| lora_train 반쪽 기능 | 소비측 경로 확정 전 미구현(보류). |
| voice/list 158KB → truncation | 요약 렌더 + `model` 권장 + pagination 통과. |
| moderate가 sync/async 중 무엇인지 미확정 | 실호출 1회로 응답 형태 확인. requestId 반환 시 폴링 경로 사용. |

---

## 6. 구현 작업 계획 (Phase)

### Phase 0 — 스펙 확정 게이트 (≤0.5일)
- [ ] §4-B 결정. 사내 DTO 또는 최저가 실호출로 다음 확정:
  - extend/retake 옵션 필드(prompt 등), moderate 응답 형태(sync? output 키), voice/list voices 항목 필드.
  - (Tier 2 채택 시) voice_clone 반환·사용법, lora_train 소비측.
  - outpaint 동작(B5).
- [ ] 결과를 본 문서 §1.4/§3에 반영.

### Phase 1 — 버그 수정 (신규 도구와 독립, 먼저 머지 가능)
- [ ] B1 `creditInfo` 타입 + `formatCredit` (중첩 렌더). 테스트: 평면/중첩/누락 3케이스.
- [ ] B2 `utility` enum 추가. B3 description.
- [ ] B4 e2e 갱신(모델 ID, sync 제거, path 목록).
- [ ] `npm test` 회귀(현 243케이스 유지).

### Phase 2 — Tier 1 신규 도구 (도구당 동일 패턴)
- [ ] `schemas/<domain>.ts` 추가/확장: video extend·retake(video.ts), moderate(신규 `moderation.ts` 또는 watermark.ts 옆), voices(신규 `voice.ts`).
- [ ] `tools/<domain>.ts`: extend/retake는 `submitAsync`, moderate는 url 분기 후 submitAsync, list_voices는 `makeApiRequest` GET + 요약 포맷터.
- [ ] `index.ts`에 register 추가(DISABLED 필터 뒤).
- [ ] 테스트: 스키마 ~8케이스/도구, 도구 happy+error+camelCase 매핑 ~4케이스/도구.
- [ ] `test/integration/server.test.ts` 도구 개수 16→20, 이름 목록 갱신.

### Phase 3 — B5 outpaint 확정 반영
- [ ] §3.5 절차 결과로 image_edit 스키마/description 조정.

### Phase 4 — (범위 채택 시) Tier 2
- [ ] voice_clone(+동의 고지), lora_train(소비측 확정 후).

### Phase 5 — 문서 & 릴리스
- [ ] README/CLAUDE.md: 도구 16→20(또는 22), 신규 모델 예시(nano-banana, seedream-4.5, veo3.1, kling-v3 등)로 갱신, 카테고리 4종.
- [ ] CHANGELOG v2.1.0: Added(도구), Fixed(B1–B4), 호환성(Breaking: None).
- [ ] `package.json` version 2.1.0, description에 extend/moderate/voice 반영.
- [ ] `npm pack --dry-run` 포함 파일 확인 → `npm publish --access public`.
- [ ] git tag, 24h 모니터링. 문제 시 `XBRUSH_DISABLED_TOOLS`로 즉시 차단.

---

## 7. 테스트 전략

- 기존 4-tier 유지. 현 243케이스 회귀 보장.
- 신규 스키마: 공통 팩토리로 도구당 ~8케이스(필수 누락/타입/범위/strict 거부/정상).
- 신규 도구: happy 1 + error 1 + snake→camel 매핑 1 + (moderate) url 분기 2.
- integration: 등록 도구 개수/이름/annotation 스냅샷 갱신(특히 `idempotentHint:false` 확인).
- e2e(B4): 무인증 path probe + 인증 무과금(health/list_models/list_voices/list_requests). 유료 파이프라인에 extend/retake/moderate 추가(최저가, opt-in `XBRUSH_E2E_PAID=1`).
- **모델 ID 하드코딩 회피**: 테스트 입력은 `test-model` placeholder. 실모델은 e2e에서만.

예상: 243 → ~300케이스.

---

## 8. 범위 밖 (이번에 하지 않음)

- utility `image_to_prompt`/`prompt_enhance` 도구화 — 공개 엔드포인트 없음(확인됨).
- text-to-video, face-swap, transcribe, avatar, 3d — API에 없음(404 확인).
- 모델 ID enum 화이트리스트, OpenAPI 자동생성, contract test — §3.4 사유로 계속 배제.
- 기존 도구 파라미터 대확장(§2.3) — 별도 minor 후보. 이번엔 버그 수정 우선.

---

## 9. 의사결정 표

| 항목 | 결정 |
|---|---|
| 버전 | **v2.1.0** (additive, breaking 없음) |
| 도구 수 | 16 → **20**(Tier 1) [선택: +2 = 22] |
| moderation | **통합 `xbrush_content_moderate`** (image_url XOR video_url) |
| lora_train | **소비측 스펙 확정 전 보류** 권장 |
| 모델 ID 검증 | `z.string()` 유지 |
| 신규 생성 도구 `idempotentHint` | **전부 false** |
| `formatCredit` | **중첩 creditConfig 렌더 수정 (B1, High)** |
| `list_models` category | `utility` 추가 |
| async 규칙 | 유지(`/sync` 금지) |
| 스펙 확정 | **Phase 0 게이트**: 사내 DTO 또는 무과금 422 + 최저가 실호출 |

---

## 10. 미해결 질문 (Phase 0에서 답)

1. extend/retake에 `prompt`(또는 startTime/resolution) 옵션이 있는가? (staged validation으로 미노출)
2. `image/moderate`·`video/moderate`는 동기 응답인가, requestId 반환 후 폴링인가? output 키 형태는?
3. `voice/list`의 voices 항목 필드명(voice_id/name/labels/preview_url 등)?
4. (Tier 2) voice_clone 반환 voice_id를 tts에서 바로 쓰는가? 동의 고지 필요 범위?
5. (Tier 2) 학습된 LoRA를 image_generate에서 참조하는 파라미터/조회 엔드포인트는?
6. image_edit outpaint: 모델 선택만으로 동작? `mode` 필드는 유효/무시/거부 중?

---

**최종 판단:** 전수조사로 신규 엔드포인트 6종 + 버그 1건(High)을 **실데이터 근거**로 확정했다. **버그 B1과 Tier 1 4도구는 즉시 착수 가능**(스펙 확정). voice_clone/lora_train은 Phase 0에서 소비측·법적 확인 후 채택 여부 결정. §4 범위만 정해지면 구현 진입.
