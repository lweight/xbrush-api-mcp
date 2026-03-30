# @lweight/xbrush-api-mcp

## 프로젝트 개요
- **목적**: [XBrush](https://xbrush.ai) AI 미디어 생성 API용 MCP 서버
- **회사**: 라이트웨이트(주) (Lightweight Inc.)
- **npm**: `@lweight/xbrush-api-mcp` (public, MIT)
- **GitHub**: `lweight/xbrush-api-mcp`

## 구조

```
src/
├── index.ts              ← 서버 엔트리, 4개 도구 모듈 등록
├── constants.ts          ← API 베이스 URL, 제한값
├── types.ts              ← 공통 타입 정의
├── schemas/              ← Zod 입력 스키마
│   ├── file-upload.ts
│   ├── image.ts
│   ├── models.ts
│   └── requests.ts
├── services/
│   ├── file-upload.ts    ← 파일 업로드 서비스
│   └── xbrush-client.ts ← HTTP 클라이언트 (axios)
└── tools/                ← MCP 도구 핸들러
    ├── file-upload.ts    ← xbrush_file_upload
    ├── image.ts          ← generate, edit, upscale, remove_bg
    ├── models.ts         ← xbrush_list_models
    └── requests.ts       ← get_request, list_requests, check_health
```

## 개발

```bash
npm install          # 의존성 설치
npm run build        # TypeScript 컴파일 (tsc)
npm run dev          # watch 모드
```

## 환경변수
- `XBRUSH_API_KEY` (필수) — xbrush.ai 대시보드 > API Keys
- `XBRUSH_BASE_URL` (선택) — 기본값 `https://api.xbrush.run`, dev: `https://api-dev.xbrush.run`

## Sync vs Async
- **Sync**: `image_generate`, `image_remove_bg` — 결과 즉시 반환
- **Async**: `image_edit`, `image_upscale` — request ID 반환 후 `get_request`로 폴링

## 테스트
- `test.ts` — 수동 테스트 스크립트
- MCP Inspector 또는 Claude Code에서 직접 사용하여 검증

## 배포

```bash
npm publish --access public
```

- `prepublishOnly` 스크립트가 자동으로 빌드 실행
- npm org: `@lweight` (계정: lightweightkr)

## 규칙
- 커밋 메시지: 한국어
- Transport: stdio 전용
- 도구 9개 (Image 4, Requests 3, Models 1, File Upload 1)
