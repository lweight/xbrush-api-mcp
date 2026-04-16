# @lweight/xbrush-api-mcp 업데이트 계획서

> 작성일: 2026-04-16
> 대상 버전: v1.1.0 → **v1.2.0**
> 근거: 코드베이스 매핑, prod API(api.xbrush.run) 엔드포인트 probe, xbrush.run 공식 랜딩 교차 검증, 3건의 비판적 리뷰(API 통합 / 아키텍처 / QA·릴리즈)

---

## 0. 한눈에 보는 요약

- **서버에는 이미 있고 우리 코드에는 없는 엔드포인트 6종** 확인됨 (모두 `401 MISSING_API_KEY` → 경로 유효).
- **공식 OpenAPI/Swagger/changelog 페이지 없음** → 요청/응답 스키마는 **사내 경로**로 확보 후 구현이 원칙. probe만으로 릴리스 금지.
- **도구 11개 → 16개로 확장** (lip-sync, tts, music, sound-effect, watermark 추가). file_upload, image_edit은 _파라미터 확장_만. 별도 신규 도구로 만들지 않는다.
- **먼저 리팩토링 → 그 다음 신규 추가.** sync/async 분기 헬퍼, 타임아웃 테이블, 응답 포맷터 일반화가 선행되지 않으면 보일러플레이트가 150줄 더 생긴다.
- **버전은 v1.2.0 (minor).** 기존 인터페이스가 깨지지 않음. v2.0.0은 마케팅 논리일 뿐.
- **문서/블로그 동기화가 최우선 리스크.** 회사 블로그가 이미 TTS/Lip-sync를 홍보 중인데 패키지에 없다.

---

## 1. 조사 결과 (증거)

### 1.1 현재 구현 (v1.1.0) — 참고용

| 영역 | 도구 | 엔드포인트 |
|---|---|---|
| Image | `xbrush_image_generate` | POST `/v1/image/generate` (+ `/sync`) |
| Image | `xbrush_image_edit` | POST `/v1/image/edit` (+ `/sync`) |
| Image | `xbrush_image_upscale` | POST `/v1/image/upscale` (+ `/sync`) |
| Image | `xbrush_image_remove_bg` | POST `/v1/image/remove-background/sync` |
| Video | `xbrush_video_generate` | POST `/v1/video/generate` (+ `/sync`) |
| Video | `xbrush_video_upscale` | POST `/v1/video/upscale` (+ `/sync`) |
| Requests | `xbrush_get_request` / `list_requests` / `check_health` | GET `/v1/requests[/:id]`, `/v1/health` |
| Models | `xbrush_list_models` | GET `/v1/models` |
| File | `xbrush_file_upload` | POST `/v1/files/presign` → S3 |

총 11개 도구, 16개 엔드포인트, 143개 Vitest 케이스.

### 1.2 서버 probe 결과 — 신규 엔드포인트 (모두 `401 MISSING_API_KEY`)

| 경로 | 모델 (공식 랜딩 기준) | sync 변종 |
|---|---|---|
| POST `/v1/video/lip-sync` | pixverse | `/sync` 유효 |
| POST `/v1/tts/generate` | minimax | `/sync` 유효 |
| POST `/v1/music/generate` | lyria2 | `/sync` 유효 |
| POST `/v1/sound-effect/generate` | — | `/sync` 유효 |
| POST `/v1/watermark/add` | — | `/sync` 유효 |
| POST `/v1/files/upload` | — | sync 없음(단일 스텝 직접 업로드) |

**존재하지 않는 것 (404 확인)**: `/v1/audio/generate`, `/v1/speech/generate`, `/v1/lip-sync` (도메인 prefix 없는 짧은 형태), `/v1/image/outpaint` (통합됨), `/v1/image/style-transfer`, `/v1/video/image-to-video`.

### 1.3 API 동작 불변 항목

- **인증**: `X-API-Key` 헤더. 에러 코드 `MISSING_API_KEY` / `INVALID_API_KEY`. 기존 구현과 일치.
- **응답 스킴**: 기존 `XBrushAsyncResponse` / `XBrushSyncResponse` 구조가 그대로 사용될 것으로 **추정**. 유효 키 없어 미확인.
- **OpenAPI/Swagger spec**: 없음 (`/openapi.json`, `/swagger`, `/redoc`, `/docs` 전부 404).
- **인프라**: Express + AWS ELB + CloudFront (NRT12-P4, 도쿄 리전).

### 1.4 Outpaint는 별도 엔드포인트가 아님

공식 랜딩(https://xbrush.run/en)은 Outpaint를 `/v1/image/edit` 내부 파라미터 분기로 정의. `/v1/image/outpaint`는 404. 즉 **`xbrush_image_edit` 스키마 확장**으로 해결(신규 도구 만들지 않음).

### 1.5 홍보-구현 괴리 (주의)

- `https://xbrush.ai/en/blog/introducing-lweight-mcp` (Mar 31, 2026, 2026-04-15 최종 수정) 블로그가 본 MCP의 기능으로 **TTS, 이미지→비디오, Lip-sync**를 명시.
- 현재 npm v1.1.0에는 TTS/Lip-sync/Music/Sound-effect/Watermark 없음.
- → 기존에 설치한 사용자가 "블로그와 다르다" 이슈를 낼 위험. 배포 지연은 곧 브랜드 리스크.

---

## 2. 리스크 & 전제 조건 (Go/No-Go)

### 2.1 스펙 공백 리스크

공개 OpenAPI가 없고, 유효 API 키가 있어도 422로 스키마를 역추적하는 데는 수십 번의 시도가 필요하다. **probe + 추측만으로 릴리스하면 필드명·필수/선택·enum 오류로 422 폭탄이 터진다**.

**완화 — 배포 전 다음 중 _하나 이상_을 만족시켜야 한다:**

1. **[1순위] 사내 repo/문서 확보.** xbrush 백엔드(FastAPI/Nest 등) 레포의 DTO/Pydantic 모델, 또는 프론트엔드 API 호출부 grep.
2. **[2순위] xbrush.run 웹앱 네트워크 탭 캡처.** 제품 UI에서 실제 TTS/music/lip-sync/watermark 각 1회씩 호출 → DevTools Network에서 request body/response 복사. 100% 정답지.
3. **[3순위] 내부 개발용 API 키로 에러 경로 탐색.** 빈 body, 잘못된 enum 등으로 422 반환 메시지에서 필드 유추.

**세 가지 다 실패하면 이번 릴리스에서 해당 도구를 제외한다.** 도구 하나가 틀리는 것보다 아예 제공 안 하는 게 신뢰에 낫다.

### 2.2 idempotentHint 오설정 → 중복 과금

MCP host가 `idempotentHint: true`로 달린 도구는 **타임아웃/네트워크 오류 시 공격적으로 재시도**한다. 생성 도구는 같은 입력이라도 결과가 달라지므로(seed 없으면) 기본 false여야 한다. 실수하면 **사용자 크레딧 중복 차감**. 책임은 MCP 개발자.

### 2.3 `list_models` category enum 고정

`src/schemas/models.ts`의 `z.enum(["image", "video", "audio"])`는 신규 카테고리(예: `music`, `sound-effect`, `lip-sync`)가 서버에서 올 때 **클라이언트가 먼저 거부**한다. 신규 도구 코드를 한 줄이라도 쓰기 전에 **실제 `GET /v1/models` 응답을 덤프**해 카테고리 값을 확인해야 한다.

### 2.4 응답 포맷 가정 오류

`formatSyncResult`는 `output.imageUrls` 가정. 오디오/립싱크는 `audioUrl`·`videoUrl`·`wordTimings[]` 등 구조가 다를 가능성. 25KB truncation이 오디오 메타데이터(word timings 배열)를 JSON 중간에서 잘라 먹을 수 있다. **도메인별 전용 포맷터 필요.**

### 2.5 Breaking change 없음 (확인)

기존 11개 도구의 파라미터/응답 시그니처는 전부 유지. `image_edit`에 optional 파라미터 추가(outpaint용), `file_upload`에 optional `strategy` 파라미터 추가 — 모두 additive. → **v1.2.0 minor 확정**.

---

## 3. 목표 변경점

### 3.1 신규 MCP 도구 (5개)

모든 신규 도구는 **async 기본, `sync: boolean` 파라미터로 전환 가능**. 기존 video/image 도구 규칙과 일관.

| 도구명 | 엔드포인트 | 주요 입력 (추정, 확정은 §2.1 완료 후) | 기본 모드 |
|---|---|---|---|
| `xbrush_video_lip_sync` | `/v1/video/lip-sync`(+`/sync`) | `model`, `video_url`, `audio_url`, `sync?` | async |
| `xbrush_tts_generate` | `/v1/tts/generate`(+`/sync`) | `model`, `text`, `voice_id?`, `language?`, `speed?`, `sync?` | async |
| `xbrush_music_generate` | `/v1/music/generate`(+`/sync`) | `model`, `prompt`, `duration?`, `sync?` | async |
| `xbrush_sound_effect_generate` | `/v1/sound-effect/generate`(+`/sync`) | `prompt`, `duration?`, `sync?` | async |
| `xbrush_watermark_add` | `/v1/watermark/add`(+`/sync`) | `image_url` 또는 `video_url`, `text?`/`image?`, `position?`, `sync?` | sync (빠를 것으로 예상) |

> 참고: 파라미터 목록은 §2.1의 스펙 확보 단계 이후 **반드시 재검증**. 지금은 뼈대.

### 3.2 기존 도구 확장 (2개, additive)

1. **`xbrush_image_edit`** — outpaint 파라미터 추가. 정확한 이름은 서버 DTO 확인 후. (예: `mode: "inpaint" | "outpaint"`, `extend_direction`, `extend_pixels` 등)
2. **`xbrush_file_upload`** — `strategy: "auto" | "direct" | "presign"` 추가 (default `"auto"`). 내부에서 파일 크기 기반 자동 선택(`< 10MB` direct, 이상 presign). **새 도구를 추가하지 않는다.**

### 3.3 `list_models` 카테고리 enum 확장

`src/schemas/models.ts:6` 확장 대상. 확정은 실제 `/v1/models` 응답 확인 후. 예상치:

```ts
z.enum(["image", "video", "audio", "music", "sound-effect", "lip-sync"])
```

실제 서버 값이 `"tts"` vs `"audio"` 중 무엇을 쓰는지 확인 필수.

### 3.4 선행 리팩토링 (반드시 신규 도구 추가 _전에_ 수행)

1. **`submitSyncOrAsync` 헬퍼 추출 (services/xbrush-client.ts)**
   - 현재 `image.ts`/`video.ts`에 5회 중복된 `if (useSync) { ... } else { ... }` 분기를 헬퍼 1개로 통합.
   - 신규 5개 도구 × 2(sync/async) = 10개 분기가 생기기 _전에_ 해야 ROI 최대. 미룰수록 부채 폭증.
2. **타임아웃 테이블 재설계 (constants.ts)**

   ```ts
   export const SYNC_TIMEOUTS = {
     image: 120_000,         // 기존 TIMEOUT_SYNC
     audio_short: 60_000,    // tts, sound-effect, watermark
     audio_long: 180_000,    // music
     video: 600_000,         // video_*, lip-sync
   } as const;
   ```

   기존 `TIMEOUT_SYNC`, `TIMEOUT_VIDEO_SYNC`는 `@deprecated` 주석으로 유지(외부 import 가능성).
3. **응답 포맷터 일반화**
   - 현재 `image.ts`의 `formatSyncResult`와 `video.ts`의 `formatVideoSyncResult`는 필드 차이만 있는 중복.
   - `services/xbrush-client.ts`에 `formatGenericSyncResult({ primaryFields: ("imageUrls"|"videoUrl"|"audioUrl"|...)[], meta: ... })` 로 일반화.
   - TTS/music은 `wordTimings` 등 대용량 메타 노출하지 않고 **요약 표시만**(URL, duration, credit). 상세 필요 시 `get_request`로 조회하도록.

### 3.5 운영 안전장치

1. **`XBRUSH_DISABLED_TOOLS` 환경변수** (신규)
   - `"tts,lip-sync"` 같이 쉼표 구분. `src/index.ts`의 `registerXxxTools` 앞에 필터 적용.
   - 배포 후 특정 도구에서 문제 발생 시 사용자가 즉시 끄게 함. 패치 릴리스까지 완충.
2. **`prepublishOnly` 강화**

   ```json
   "prepublishOnly": "npm run build && npm test"
   ```

   현재 build만 있어서 실패하는 테스트로도 publish 가능. 1분이면 끝나는 수정.

### 3.6 관측 / 측정

- 릴리스 후 24h는 GitHub issue, npm download 모니터링.
- 신규 도구별 에러 응답 로깅(이미 `xbrush-client.ts`에 에러 핸들링 있음 — 유지).

---

## 4. 구현 작업 계획 (순서)

### Phase 0 — 스펙 확보 (Go/No-Go 게이트, ≤ 1일)

- [ ] 사내 xbrush 백엔드 repo / 프론트 repo 접근 권한 확보
- [ ] TTS / music / sound-effect / lip-sync / watermark 각 엔드포인트의 request DTO 확인
- [ ] xbrush.run 웹앱(또는 관리자 대시보드)에서 각 기능 1회씩 호출 → DevTools Network capture
- [ ] 실제 `GET /v1/models` 응답 덤프 확보 (category, featureType, creditConfig 필드 값)
- [ ] 결과물: 내부 문서 `docs/api-spec-snapshot-2026-04.md` (req/res 예시 + 주석)

**Phase 0 실패 시**: 불확실한 도구는 이번 릴리스에서 제외하고 확인된 것만 추가.

### Phase 1 — 리팩토링 (신규 도구 추가 전제)

- [ ] `services/xbrush-client.ts`에 `submitSyncOrAsync<S, A>(...)` 헬퍼 추가
- [ ] `tools/image.ts`, `tools/video.ts`를 헬퍼 사용하도록 리팩토링 — **기존 143 테스트가 그대로 통과해야 함** (회귀 가드)
- [ ] `constants.ts`에 `SYNC_TIMEOUTS` 테이블 추가, 기존 상수는 deprecated 표시
- [ ] `formatGenericSyncResult` 추출 (image/video 공유)
- [ ] `src/index.ts`에 `XBRUSH_DISABLED_TOOLS` 환경변수 처리 로직 추가

### Phase 2 — 스키마 enum/카테고리 확장

- [ ] `schemas/models.ts`의 `category` enum 확장 (Phase 0의 덤프 기반 정확한 값)
- [ ] `tools/models.ts`의 `formatModelsMarkdown`이 신규 카테고리를 graceful하게 렌더링하는지 검증/보강
- [ ] `test/schemas/models.test.ts`, `test/tools/models.test.ts` 추가 케이스

### Phase 3 — 기존 도구 확장

- [ ] `schemas/image.ts`에 image_edit의 outpaint 파라미터 추가 (strict 유지)
- [ ] `schemas/file-upload.ts`에 `strategy` 파라미터 추가
- [ ] `services/file-upload.ts`에 direct 업로드 경로(`/v1/files/upload`) 분기 구현
- [ ] 테스트: image_edit outpaint 1~2케이스, file_upload strategy 분기 2~3케이스

### Phase 4 — 신규 도구 5종 추가

각 도구마다 동일 패턴:

- [ ] `src/schemas/<domain>.ts` 생성 (`audio.ts`로 tts+music+sound-effect 묶기 / `lip-sync.ts` / `watermark.ts` 분리)
- [ ] `src/services/xbrush-client.ts`에 메서드 추가 (제네릭 헬퍼 사용)
- [ ] `src/tools/<domain>.ts` 핸들러 + register 함수
- [ ] `src/index.ts`에 `registerXxxTools(server)` 추가 (DISABLED 필터 뒤에)
- [ ] `test/schemas/<domain>.test.ts` — 공통 팩토리로 ~10케이스
- [ ] `test/tools/<domain>.test.ts` — 행복 경로 1 + 에러 경로 1~2 + camelCase 매핑 1 = 4~5케이스

예상 코드 증가:
- schemas: `audio.ts`(~60줄), `lip-sync.ts`(~30줄), `watermark.ts`(~30줄)
- tools: `audio.ts`(~150줄), `lip-sync.ts`(~60줄), `watermark.ts`(~60줄)
- services/xbrush-client.ts: +메서드 ~50줄 (헬퍼 덕에 작음)

### Phase 5 — 도구 annotations 검증 (치명적 실수 방지)

모든 신규 도구는 다음 원칙으로 annotation 설정:

| 도구 | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|---|---|---|
| tts_generate, music_generate, sound_effect_generate | false | false | **false** | true |
| video_lip_sync | false | false | **false** | true |
| watermark_add | false | false | **false** | true |
| image_edit(기존) outpaint 파라미터 포함 | false | false | false | true |
| file_upload (기존 확장) | false | false | false | true |

**절대 `idempotentHint: true` 설정 금지** (중복 과금 리스크).

### Phase 6 — 문서 동기화 (배포와 동시)

- [ ] `README.md`: 도구 테이블 업데이트 (11 → 16), 예시 추가
- [ ] `CLAUDE.md`: "도구 11개" → "도구 16개", 신규 도구 설명, 도메인별 타임아웃 언급
- [ ] `CHANGELOG.md`: **신설**. v1.2.0 항목에 신규 도구 / 확장 / 호환성(“Breaking: None”) 명시
- [ ] `package.json` version → `1.2.0`, description에 TTS/Music 언급 추가
- [ ] **블로그 팀에 확인 요청**: `xbrush.ai/en/blog/introducing-lweight-mcp`와 패키지 기능 일치 여부 재확인

### Phase 7 — 릴리스

- [ ] Release 브랜치에서 `npm test` 전체 통과 확인
- [ ] `npm pack --dry-run`으로 포함 파일 검토 (`dist/`, `README.md`, `LICENSE`만. `.env`·`test/`·`src/` 제외 확인)
- [ ] `npm view @lweight/xbrush-api-mcp versions --json`으로 중복 방지
- [ ] `npm publish --access public` (dry-run 먼저)
- [ ] git tag `v1.2.0` 푸시, GitHub Release 노트 작성
- [ ] 사내 슬랙/노션 공지

### Phase 8 — 릴리스 후 스모크 (수동, 30분)

- [ ] 별도 프로젝트에서 `npm install @lweight/xbrush-api-mcp@1.2.0` → MCP Inspector로 도구 목록 확인
- [ ] `check_health`, `list_models`(category별) 확인
- [ ] 유료 도구는 **최저가 모델 1회씩만** 수동 스모크
- [ ] 24h 이슈 모니터링

---

## 5. 테스트 전략

### 5.1 레이어별 원칙 (비판적 리뷰 C 반영)

- **Tier 1 (schemas/)**: 계약. 강하게 유지. 신규 스키마당 10~12 케이스 (공통 팩토리 사용해 중복 제거).
- **Tier 2 (services/)**: 기존 xbrush-client 테스트 확장. 헬퍼 `submitSyncOrAsync`에 5~8 케이스 추가 (회귀 가드).
- **Tier 3 (tools/)**: **과도하게 늘리지 않는다.** 신규 도구당 4~5 케이스(happy + error 1~2 + camelCase 매핑 1). 기존과 동일 수준 지양.
- **Tier 4 (integration/)**: 도구 수 / 이름 / annotation 스냅샷 자동 갱신. 신규 도구 등록 시 스냅샷 diff 리뷰 필수.

### 5.2 테스트 파일 배치

```
test/tools/
├── image.test.ts        (기존 + image_edit outpaint 2~3)
├── video.test.ts        (기존 유지)
├── audio.test.ts        (신규: tts + music + sound_effect)
├── lip-sync.test.ts     (신규)
├── watermark.test.ts    (신규)
├── file-upload.test.ts  (기존 + strategy 분기 2~3)
├── models.test.ts       (기존 + category 확장)
└── requests.test.ts     (기존 유지)
```

예상 최종: 약 200~230 케이스 (현재 143). Vitest 실행 시간 1초대 유지 예상.

### 5.3 해서는 안 되는 것

- **스냅샷 테스트 전면 도입 금지**: 응답 포맷 자체가 UX 자산. 변경이 잦으므로 스냅샷은 잡음이 된다. `test/integration/__snapshots__/`의 등록 목록 스냅샷은 유지(계약성).
- **모델 ID 하드코딩 금지**: `"z-image-turbo"`를 테스트 입력에 박지 말 것. `"test-model"` 같은 placeholder. 모델 목록 테스트는 `list_models` 스냅샷으로 별도.
- **Contract 테스트 (pact 등) 도입 금지**: 서버 쪽 OpenAPI가 없으므로 의미 있는 계약이 없다. YAGNI.

### 5.4 CI 전략

- **PR CI (매 push)**: mock only. `npm ci && npm run build && npm test && npm audit --audit-level=high && npm pack --dry-run`. 비용 0.
- **Release CI (tag 또는 수동)**: 위 전체 + 실 API 스모크 2건만(`check_health`, `list_models`). 크레딧 소모 0.
- **Scheduled (주 1회)**: 최저가 모델로 `image_generate` 1회 + `list_models` 덤프 스냅샷 비교. 월 예산 $10 상한 알람.

---

## 6. 롤백 & 에러 복구

1. **도구 단위 즉시 비활성**: `XBRUSH_DISABLED_TOOLS=tts_generate,watermark_add` 로 사용자가 즉시 비활성화.
2. **문제 버전 deprecate**: `npm deprecate @lweight/xbrush-api-mcp@1.2.0 "Upgrade to 1.2.1: <reason>"`. 릴리스 체크리스트에 명시.
3. **핫픽스 릴리스**: v1.2.x 패치. Phase 7 체크리스트 전부 재적용.
4. **최악의 경우**: v1.2.0 완전 취소 — npm은 publish 후 72h 이내 `npm unpublish` 가능. 단 사용자가 이미 lockfile에 고정했으면 소용 없음. 그래서 deprecate가 우선.

---

## 7. 범위 밖 (이번 릴리스에서 하지 않음) — over-engineering 경계

비판적 리뷰 B·C 공통 결론으로 제외:

1. **types.ts 도메인별 분리**. 현재 122줄. 200줄 이하는 단일 파일 유지.
2. **자동 도구 등록 시스템** (glob `tools/*.ts`). 명시적 7~8줄 등록이 낫다.
3. **스냅샷 테스트 전면 도입**. 응답 포맷은 의도적 변경이 잦아 잡음원.
4. **`xbrush_file_upload_direct`라는 별도 도구 추가**. 기존 도구에 `strategy` 파라미터로 흡수.
5. **`xbrush_image_outpaint`라는 별도 도구**. `/v1/image/edit` 파라미터 분기로 통합.
6. **OpenAPI 클라이언트 자동 생성 (openapi-typescript 등)**. 서버에 스펙 없음.
7. **Contract test / pact**. 같은 이유.
8. **z.enum으로 모델 ID 화이트리스트**. 서버 모델 추가 때마다 MCP 버전업 강제 → UX 악화. 현재 `z.string()` 유지.
9. **dotenv 의존성 추가**. 현재 수제 파서 43줄로 충분. 확장 필요 시 `services/env.ts`로 분리만 검토.
10. **index.ts 자동 등록 / 타입 제너레이션**.

---

## 8. 의사결정 표 (요약)

| 항목 | 결정 | 근거 |
|---|---|---|
| 버전 번호 | **v1.2.0** | Additive 변경, 기존 인터페이스 유지 |
| 도구 개수 | 11 → **16** | 5개 신규. `xbrush_file_upload_direct`·`xbrush_image_outpaint`는 별도로 만들지 않음 |
| `idempotentHint` (신규 도구) | **false (전부)** | 생성 API는 비-idempotent. 중복 과금 방지 |
| `list_models` category enum | **확장 필수** | 현재 `[image, video, audio]` — 실제 덤프 후 결정 |
| sync/async 헬퍼 | **`submitSyncOrAsync` 추출** | 분기 중복 5회 → 10회 되기 전 |
| 타임아웃 | **`SYNC_TIMEOUTS` 테이블** | 도메인별 차등 (image/audio_short/audio_long/video) |
| 파일 업로드 2경로 | **단일 도구 + `strategy`** | MCP UX: 도구 개수 증가 회피 |
| Zod strict | **유지** | 사용자 보호장치. 응답엔 영향 없음 |
| 모델 ID 검증 | **z.string() 유지** | 서버 업데이트 강제 업그레이드 방지 |
| 스펙 없이 릴리스 | **Go/No-Go 게이트** | Phase 0 완료 후에만 진행 |
| 실 API 통합 테스트 | **check_health + list_models 2건만 CI** | 크레딧 소모 0. 유료 스모크는 주 1회 scheduled |
| 스냅샷 테스트 | **등록 목록만 유지, 응답은 미도입** | 응답 포맷 변경 잡음 방지 |
| `DISABLED_TOOLS` 환경변수 | **도입** | 핫픽스 대기 중 완충 |

---

## 9. 파일 변경 맵 (Phase별 영향 요약)

| 파일 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|---|---|---|---|---|---|---|
| `src/constants.ts` | 타임아웃 테이블 | | | | | |
| `src/services/xbrush-client.ts` | 헬퍼·포맷터 추가 | | | 메서드 5개 추가 | | |
| `src/services/file-upload.ts` | | | direct 경로 분기 | | | |
| `src/schemas/models.ts` | | category enum 확장 | | | | |
| `src/schemas/image.ts` | | | outpaint 파라미터 | | | |
| `src/schemas/file-upload.ts` | | | strategy 파라미터 | | | |
| `src/schemas/audio.ts` (신규) | | | | tts+music+se 스키마 | | |
| `src/schemas/lip-sync.ts` (신규) | | | | | | |
| `src/schemas/watermark.ts` (신규) | | | | | | |
| `src/tools/image.ts` | 헬퍼 사용 리팩토링 | | outpaint 분기 | | annotations 확인 | |
| `src/tools/video.ts` | 헬퍼 사용 리팩토링 | | | | annotations 확인 | |
| `src/tools/models.ts` | | 렌더링 보강 | | | | |
| `src/tools/audio.ts` (신규) | | | | 핸들러 3개 | annotations | |
| `src/tools/lip-sync.ts` (신규) | | | | 핸들러 1개 | annotations | |
| `src/tools/watermark.ts` (신규) | | | | 핸들러 1개 | annotations | |
| `src/tools/file-upload.ts` | | | strategy 분기 | | | |
| `src/index.ts` | DISABLED_TOOLS 필터 | | | 신규 register 5개 | | |
| `src/types.ts` | | | | 필요 시 direct 업로드 응답 타입 1개 | | |
| `test/**/*.test.ts` | 헬퍼 테스트 | models 테스트 | image/fu 테스트 | 도구별 테스트 | annotations 스냅샷 | |
| `package.json` | | | | | | version 1.2.0, prepublishOnly |
| `README.md`, `CLAUDE.md`, `CHANGELOG.md` | | | | | | 전면 업데이트 |

---

## 10. 일정 (가이드)

| Phase | 예상 작업량 | 선후 |
|---|---|---|
| Phase 0 (스펙 확보) | 0.5~1일 | 게이트. 반드시 먼저. |
| Phase 1 (리팩토링) | 0.5일 | P2~P4 선행 |
| Phase 2 (models enum) | 0.5일 | |
| Phase 3 (기존 확장) | 0.5일 | |
| Phase 4 (신규 도구 5) | 1.5~2일 | |
| Phase 5 (annotations 검증) | 0.5일 | |
| Phase 6 (문서) | 0.5일 | Phase 4/5 이후 |
| Phase 7 (릴리스) | 0.5일 | |
| Phase 8 (스모크·모니터링) | 24h | 릴리스 후 |

**총 5~6 영업일**. Phase 0 실패 시 Phase 4 범위 축소.

---

## 11. 미해결 질문 (Phase 0에서 답해야 할 것)

1. pixverse, minimax, lyria2가 `/v1/models` 응답에서 어느 `category` 값으로 오는가? (tts? audio? music?)
2. `/v1/files/upload`는 FormData multipart인가 아니면 JSON + Base64인가? presign과 응답 구조가 동일한가?
3. `image_edit`의 outpaint는 실제로 어떤 파라미터로 트리거되는가? (`mode`? `operation`? `outpaint: true`?)
4. TTS의 모델별 파라미터 차이는? (voice enum, 언어 코드 포맷)
5. 신규 엔드포인트들이 기존 `/v1/requests/{id}`로 폴링 가능한가 (응답 구조 동일한가)?
6. Watermark는 image/video 모두 가능한가? 입력 필드가 통합돼 있나 분리돼 있나?
7. `XBrushSyncResponse.output`의 오디오/립싱크 output 키 이름?

이 7개에 답이 없으면 해당 도구 구현을 보류한다.

---

## 12. 체크리스트 (한 장)

### Go/No-Go (Phase 0)
- [ ] 사내 API DTO 확보
- [ ] 신규 모델의 `/v1/models` 덤프
- [ ] 웹앱 Network 탭 캡처 또는 내부 API 키 probing

### 코드
- [ ] `submitSyncOrAsync` 헬퍼
- [ ] `SYNC_TIMEOUTS` 테이블
- [ ] `formatGenericSyncResult` 추출
- [ ] category enum 확장
- [ ] image_edit outpaint 파라미터
- [ ] file_upload strategy 파라미터
- [ ] 신규 도구 5개 (audio, lip-sync, watermark)
- [ ] 모든 신규 도구 `idempotentHint: false`
- [ ] `XBRUSH_DISABLED_TOOLS` 환경변수

### 테스트
- [ ] 기존 143 케이스 유지
- [ ] 신규 스키마당 ~10 케이스
- [ ] 신규 도구당 ~5 케이스
- [ ] 등록 목록 스냅샷 자동 갱신

### 릴리스
- [ ] `prepublishOnly: "npm run build && npm test"`
- [ ] `CHANGELOG.md` v1.2.0 항목
- [ ] README / CLAUDE.md 도구 수/이름 업데이트
- [ ] `npm pack --dry-run` 포함 파일 확인
- [ ] 블로그 텍스트와 기능 일치 확인
- [ ] `npm publish --access public`
- [ ] 24h 모니터링

---

**최종 판단**: 이 계획은 **스펙 확보(Phase 0) 성공을 전제**로 한다. 확보 실패 시 scope 축소 후 진행. 어떤 경우에도 probe + 추측만으로는 릴리스하지 않는다.
