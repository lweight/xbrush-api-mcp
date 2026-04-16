# v1.2.0 테스트 기획서

> 대상: `@lweight/xbrush-api-mcp` v1.1.0 → v1.2.0
> 기준: `UPDATE_PLAN.md` §5 (테스트 전략)와 일관. 기존 4-tier 구조 유지.
> 베이스라인: **12 파일 / 143 케이스 / ~620ms**.
> 목표: **17~20 파일 / 200~230 케이스 / < 1.2s**. 회귀 0건.

---

## 1. 원칙

1. **계약으로 취급 가능한 것은 끝까지 지킨다** — Zod 스키마 / 도구 등록 / annotation / 스냅샷(입력 스키마).
2. **Tier 3 확장은 축소 지향** — 신규 도구당 5 케이스 내외. happy + 에러 1~2 + camelCase 매핑 + sync/async 분기.
3. **응답 스냅샷 테스트는 도입하지 않는다** — 포맷이 UX 자산이라 의도적 변경이 잦음. 등록 목록 / 입력 스키마 스냅샷만 유지.
4. **모델 ID 하드코딩 금지** — 테스트 입력은 `"test-model"` placeholder. 모델명 assertion은 `list_models` 스냅샷에만.
5. **Mock은 실제 API 구조를 흉내낸다** — 실 키 없어도 `XBrushSyncResponse` / `XBrushAsyncResponse` 타입을 따른다.
6. **회귀 가드 최우선** — 리팩토링(Phase 1)에서 기존 143 케이스가 하나라도 깨지면 즉시 롤백.

---

## 2. 4-Tier 구조 및 카운트

| Tier | 위치 | 현재 케이스 | v1.2 목표 | 증분 근거 |
|---|---|---|---|---|
| 1. Schemas | `test/schemas/` | 63 | **~95** | 신규 스키마 3개 × 10 = +30, image/file-upload 확장 +2 |
| 2. Services | `test/services/` | 20 | **~30** | `submitSyncOrAsync` 헬퍼 5, 신규 client 메서드별 smoke +5 |
| 3. Tools | `test/tools/` | 45 | **~75** | 신규 도구 5 × 5 = +25, image_edit/file_upload 확장 +5 |
| 4. Integration | `test/integration/` | 15 | **~25** | 도구 수 11→16 반영, annotation 검증 +5, 스냅샷 +5 |
| 합계 | | **143** | **~225** | 회귀 0 |

---

## 3. Tier 1 (schemas/) 상세

### 3.1 기존 파일 수정

| 파일 | 추가할 케이스 | 이유 |
|---|---|---|
| `schemas/models.test.ts` | +4 | category enum에 `music`, `sound-effect`, `lip-sync` 허용 확인, 이전 `image/video/audio`도 여전히 유효 |
| `schemas/image.test.ts` | +3 | `image_edit` 신규 필드(예: `mode`, `extend_*`) 유효/무효 경계 |
| `schemas/file-upload.test.ts` | +3 | `strategy` 필드 `auto/direct/presign` 허용 + 미정의 값 거부 |

### 3.2 신규 파일

#### `test/schemas/audio.test.ts` (~15 케이스)

`TtsGenerateSchema`, `MusicGenerateSchema`, `SoundEffectGenerateSchema` 각각 다음 케이스:

- 필수 필드만으로 유효 (`model` + `prompt`/`text`)
- 전체 optional 필드 유효
- 필수 필드 누락 거부 (예: text 없이 TTS)
- 미정의 필드 거부 (strict 확인)
- 수치 범위 (예: `speed` 0.5~2.0, `duration` 1~300)
- sync 필드 boolean 제약

#### `test/schemas/lip-sync.test.ts` (~7 케이스)

- `VideoLipSyncSchema` 필수(`video_url`, `audio_url`), optional(`model`, `sync`)
- URL 유효성
- strict mode
- sync boolean

#### `test/schemas/watermark.test.ts` (~8 케이스)

- `WatermarkAddSchema` 필수(target URL), optional(`text`/`image_url`, `position`)
- 이미지/비디오 URL 택일 가능
- position enum(`tl/tr/bl/br/center` 등) 추정 — 실 스펙 확인 후 보정
- strict mode

### 3.3 공통 팩토리 도입 (test/schemas/_helpers.ts, 신규)

중복 줄이기 위해 다음 헬퍼 제공:

```ts
export function assertStrict<T>(schema: ZodType<T>, validInput: T) {
  expect(() => schema.parse({ ...validInput, _unknown: 1 })).toThrow();
}
export function assertRequired<T>(schema: ZodType<T>, base: Partial<T>, field: keyof T) {
  const { [field]: _, ...without } = base as any;
  expect(() => schema.parse(without)).toThrow();
}
export function assertRange(schema: ZodType<any>, valid: any, field: string, min: number, max: number) { ... }
```

단, **무분별한 추상화 금지** — describe.each로 표면적 케이스 수 유지. 팩토리는 3개 이상 중복될 때만 적용.

---

## 4. Tier 2 (services/) 상세

### 4.1 `test/services/xbrush-client.test.ts` 확장

현재 20 케이스. 신규 `submitSyncOrAsync` 헬퍼 테스트 +5~8:

- [ ] `useSync=true` → syncUrl + syncTimeout + sync formatter 호출
- [ ] `useSync=false` → asyncUrl + asyncTimeout + async formatter 호출
- [ ] 둘 다 동일한 body 전달
- [ ] 에러 발생 시 `handleToolError` 경유
- [ ] formatter에 요청 결과 객체 그대로 전달
- [ ] (선택) timeout 값이 constants.ts 도메인 테이블과 일치

### 4.2 `test/services/file-upload.test.ts` 확장 (기존 파일 없음, 신규)

현재 `tools/file-upload.test.ts`만 있음. services/file-upload.ts에 direct 업로드 분기가 추가되면 단위 테스트 필요:

- [ ] `strategy=presign` → presign + S3 fetch (현재 동작)
- [ ] `strategy=direct` → `/v1/files/upload` multipart 호출
- [ ] `strategy=auto` + 10MB 미만 → direct 선택
- [ ] `strategy=auto` + 10MB 이상 → presign 선택

**Node `fs`/`fetch` mock 필요.**

---

## 5. Tier 3 (tools/) 상세

### 5.1 기존 파일 수정

#### `test/tools/image.test.ts` (+3~5)

- `image_edit`에 `mode: "outpaint"` 파라미터 전달 시 body에 포함
- `mode` 없으면 body에 없음
- outpaint 전용 확장 필드(`extend_*`) snake→camel 매핑 확인

#### `test/tools/file-upload.test.ts` (+3~4)

- `strategy=direct` 인자 전달 시 direct 경로
- `strategy` 미지정 시 auto 동작
- direct 업로드 실패 → isError

### 5.2 신규 파일

#### `test/tools/audio.test.ts` (~15 케이스, tts + music + sound_effect)

각 3개 도구마다:

- 기본(async) — requestId 반환
- `sync=true` → /sync URL + 결과 포맷 확인
- snake_case → camelCase 매핑 (`voice_id` → `voiceId` 등)
- optional 미지정 시 body 미포함
- API 에러 → isError + Suggestion 포함

#### `test/tools/lip-sync.test.ts` (~5)

- 기본(async)
- sync=true /v1/video/lip-sync/sync 호출
- `video_url`/`audio_url` → camelCase 매핑
- API 에러

#### `test/tools/watermark.test.ts` (~5)

- 기본 호출 (sync 기본)
- 이미지 타깃
- 비디오 타깃
- API 에러

### 5.3 공통 Tool 테스트 헬퍼 (`test/tools/_helpers.ts` 확장)

기존 `createMockServer` 유지. 추가 헬퍼:

```ts
export function expectCamelCaseMapping(
  mockedApi: MockedFn,
  snakeField: string,
  camelField: string,
  value: unknown,
) { ... }
```

---

## 6. Tier 4 (integration/) 상세

### 6.1 `test/integration/server.test.ts` 업데이트

| 항목 | 현재 | v1.2 |
|---|---|---|
| `expect(tools).toHaveLength(11)` | 11 | **16** |
| 도구 이름 목록 | 11개 | 16개 (아래 표 참조) |
| 스키마 스냅샷 대상 | 4개 | 8개 (신규 4개 추가) |
| annotation 검증 | 4개 | 8개 (신규 도구 idempotent:false 확인) |

**추가 도구 이름 (sorted)**:

```
xbrush_music_generate
xbrush_sound_effect_generate
xbrush_tts_generate
xbrush_video_lip_sync
xbrush_watermark_add
```

(총 16개: 기존 11 + 신규 5)

### 6.2 신규 integration 케이스

- [ ] `XBRUSH_DISABLED_TOOLS=xbrush_tts_generate` 설정 시 해당 도구 미등록 (환경변수 기반 선택적 비활성)
- [ ] `XBRUSH_DISABLED_TOOLS="xbrush_tts_generate,xbrush_music_generate"` 복수 비활성
- [ ] 모든 신규 도구 `idempotentHint: false` 검증 (중복 과금 방지)
- [ ] 모든 신규 도구 `openWorldHint: true`
- [ ] 새 category 값(`music`, `sound-effect`, `lip-sync`) list_models 통과

### 6.3 스냅샷 정책

- **입력 스키마 스냅샷**: 신규 5개 도구에 대해 추가. 의도적 변경 시 `vitest -u`로 갱신, PR diff 리뷰 필수.
- **도구 이름 목록 스냅샷**: 신규 추가 시 정렬된 목록으로 assert.
- **응답 스냅샷 없음** — 마크다운 출력은 부분 문자열 assertion만 사용.

---

## 7. CI 전략

### 7.1 PR CI (매 push, 비용 0)

```
npm ci
npm run build
npm test
npm pack --dry-run     # 포함 파일 검증
```

### 7.2 Release CI (tag 또는 수동, 이번 릴리스 범위 밖)

범위 밖이지만 계획에 남겨둠:
- 위 PR CI 전체
- `XBRUSH_API_KEY_CI`로 `xbrush_check_health` + `xbrush_list_models` 스모크 (크레딧 소모 0)
- `npm publish --dry-run`
- `npm view @lweight/xbrush-api-mcp versions` 중복 체크

### 7.3 수동 E2E (릴리스 후)

- MCP Inspector에서 16개 도구 목록 확인
- 최저가 모델로 `image_generate`, `tts_generate` 각 1회
- `check_health`, `list_models(category=music)` 확인

---

## 8. 회귀 가드

리팩토링 단계별 필수 게이트:

| 단계 | 게이트 |
|---|---|
| Phase 1a (타임아웃 테이블) | 기존 143 케이스 통과. 상수 값 불변 (120s, 600s 등). |
| Phase 1b (submitSyncOrAsync) | **기존 143 케이스 0건 변경 통과**. 스냅샷 변경 없음. image/video 도구가 헬퍼 사용해도 외부 동작 동일. |
| Phase 1c (DISABLED_TOOLS) | 환경변수 없을 때 도구 11개 그대로. |
| Phase 2 (models enum) | 기존 `image/video/audio` 여전히 유효. |
| Phase 3 (기존 확장) | 기존 image_edit / file_upload 테스트 그대로 통과. 새 파라미터 미전달 시 동작 불변. |
| Phase 4 (신규 5개) | 각 도구별로 add → test 반복. 기존 테스트는 한 번도 안 깨져야 함. |

---

## 9. 위험 기반 우선순위 (테스트 투자)

**많이 테스트할 것** (버그 터지면 사용자 즉시 영향):

1. `submitSyncOrAsync` 헬퍼 — 16개 엔드포인트 공유 경로. 깨지면 전부 깨짐.
2. 신규 스키마의 **strict mode** — 사용자 보호 장치.
3. `list_models`의 category enum 확장 — 새 카테고리 오면 전 클라이언트가 넘지 못함.
4. annotation `idempotentHint: false` — 중복 과금 방지.

**덜 테스트할 것** (회귀 가능성 낮거나 테스트 비용이 큼):

1. 응답 마크다운 포맷 정확한 문자열 — `toContain` 1~2개로 충분.
2. 신규 도구의 모든 optional 필드 매핑 — happy path 1개 + 핵심 매핑 1개로 샘플링.
3. 실제 API 통합 — Phase 0(스펙 확보) 성공 후에만. 지금은 계획만.

---

## 10. 스펙 공백 대응

Phase 0에서 정확한 필드명이 확보되지 않으면 다음 정책을 적용:

1. **최소 필수 필드만 Zod `.strict()`로 정의** — 서버가 요구할 가능성 높은 `model`, `prompt`/`text`, `url` 류만.
2. **추정 optional 필드는 주석 `// TODO: confirm with api-spec`**을 남기고 포함 — 서버가 무시하면 문제없고, 지원하면 즉시 사용 가능.
3. **테스트는 "추정 필드를 보냈을 때 body에 들어가는지"만 확인** — 서버 응답 해석 테스트는 금지.
4. **문서(README)에 "Experimental — 스키마가 변경될 수 있음" 배지** — 신규 도구 섹션에 표시.

---

## 11. 마일스톤 테스트 카운트 체크

각 Phase 완료 시 예상 카운트:

| Phase | 예상 테스트 수 | 누적 |
|---|---|---|
| Phase 0 (스펙) | 143 (변화 없음) | 143 |
| Phase 1a (타임아웃) | 143 | 143 |
| Phase 1b (헬퍼) | 143 + 8 = 151 | 151 |
| Phase 1c (DISABLED) | 151 + 2 = 153 | 153 |
| Phase 2 (models) | 153 + 4 = 157 | 157 |
| Phase 3a (outpaint) | 157 + 5 = 162 | 162 |
| Phase 3b (strategy) | 162 + 7 = 169 | 169 |
| Phase 4a (audio) | 169 + 30 = 199 | 199 |
| Phase 4b (lip-sync) | 199 + 12 = 211 | 211 |
| Phase 4c (watermark) | 211 + 13 = 224 | 224 |
| Phase 5 (검증) | 224 + 5 = 229 | **229** |

오차 범위 약 ±10. 225 전후가 목표.

---

## 12. 체크리스트

### 리팩토링 단계
- [ ] `submitSyncOrAsync` 테스트 추가 (Tier 2)
- [ ] image/video 헬퍼 사용으로 전환 후 기존 테스트 통과
- [ ] `XBRUSH_DISABLED_TOOLS` 통합 테스트 2개

### 스키마 단계
- [ ] `audio.test.ts`, `lip-sync.test.ts`, `watermark.test.ts` 생성
- [ ] `models.test.ts`에 카테고리 enum 케이스
- [ ] `image.test.ts`에 outpaint 필드 케이스
- [ ] `file-upload.test.ts`에 strategy 필드 케이스

### 도구 단계
- [ ] `audio.test.ts`, `lip-sync.test.ts`, `watermark.test.ts` 도구 파일
- [ ] 각 도구 happy path + 에러 + camelCase 매핑

### Integration
- [ ] 도구 수 11→16 업데이트
- [ ] 이름 목록 갱신
- [ ] 신규 4개 스키마 스냅샷
- [ ] annotation `idempotentHint: false` 검증
- [ ] `XBRUSH_DISABLED_TOOLS` 케이스

### 마지막
- [ ] `npm test` 전체 통과 (225 전후)
- [ ] 스냅샷 diff 수동 리뷰
- [ ] `prepublishOnly`가 test 포함하도록 갱신 검증

---

**원칙 재확인**: "스펙 없는 세계에서 완벽한 테스트는 불가능하다. 그러나 계약으로 취급 가능한 것(스키마, 도구 등록, annotation)은 끝까지 지킨다. 나머지는 회귀 가드 수준."
