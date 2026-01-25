# 🍋 pic-drm

**pic-drm**은 스테가노그래피(Steganography) 서비스를 위한 **Orchestration API Server**입니다.
이 서버는 무거운 이미지 처리 작업을 직접 수행하지 않고, 클라이언트와 스테가노그래피 엔진 간의 통신 및 리소스 관리를 중재하는 역할을 담당합니다.

Cloudflare Workers 환경에서 **Hono** 프레임워크를 기반으로 구축되었습니다.

## 🛠 기술 스택 (Tech Stack)

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework:** [Hono v4](https://hono.dev/)
- **Language:** TypeScript
- **Package Manager:** npm (or pnpm)

## 🚀 시작하기 (Getting Started)

### 설치 (Installation)

의존성 패키지를 설치합니다.

```bash
npm install
```

### 로컬 개발 서버 실행 (Development)

로컬 환경에서 개발 서버를 실행합니다.

```bash
npm run dev
```

### 배포 (Deploy)

Cloudflare Workers로 프로젝트를 배포합니다.

```bash
npm run deploy
```

### 타입 생성 (Type Generation)

`wrangler.jsonc` 설정을 기반으로 Cloudflare Bindings 타입을 생성합니다.

```bash
npm run cf-typegen
```

## 📂 프로젝트 구조 (Project Structure)

```
pic-drm/
├── src/
│   └── index.ts       # 애플리케이션 엔트리 포인트 (App Entry Point)
├── wrangler.jsonc     # Cloudflare Workers 설정 파일
├── package.json       # 프로젝트 의존성 및 스크립트
└── tsconfig.json      # TypeScript 설정
```

## 📝 주요 기능 (Core Features)

- **Orchestration:** 프론트엔드 요청과 스테가노그래피 처리 엔진 간의 중재
- **Lightweight:** Hono 기반의 경량화된 API 서버
- **Edge Computing:** Cloudflare Workers를 통한 글로벌 엣지 배포

---
> 이 프로젝트는 `pic-drm` 백엔드 전략 가이드를 따릅니다.