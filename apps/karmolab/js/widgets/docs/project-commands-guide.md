# 프로젝트 통합 명령·경로 가이드

이 레포(`Mascari4615.github.io`) 안에서 자주 쓰는 **터미널 명령**과 **로컬 URL**을 한곳에 모았습니다. 블로그, KarmoLab, 부가 앱(`apps/*`)을 오갈 때 **복사해서 실행**하면 됩니다.

> 블로그는 더 이상 Ruby(Jekyll)로 짓지 않습니다. 글·작업물·소개까지 전부 KarmoLab 파이프가 굽고, 사이트 조립도 Node(`assemble-site.mjs`)가 합니다.

> **원본 파일:** `apps/karmolab/js/widgets/docs/project-commands-guide.md` (GitHub에서 직접 열어도 동일)

---

## 레포 구조 한눈에

| 경로 | 역할 |
|------|------|
| 루트 `/` | 모노레포 오케스트레이터 — `npm run verify`(main invariant 단일 게이트) |
| `apps/karmolab/` | **KarmoLab** 웹앱(TypeScript → `js/` 빌드 산출) |
| `apps/karmolab-tauri/` | KarmoLab **데스크톱**(Tauri + 로컬 정적 서버) |
| `apps/discord-bots/` | Discord 봇 워크스페이스(여러 패키지) |
| `apps/chat-overlay/` | 방송용 오버레이(Tauri + Vite) |
| `apps/karmo-web-extension/` | Chrome 확장(MV3) |
| `apps/blog/` | 배포되는 사이트 껍데기 — 글·도구 장은 빌드 때 여기로 실립니다 |

세부 README: 각 `apps/*/README.md` 및 루트 `README.md`.

---

## 블로그: 글·장 굽기

글 원본은 `apps/karmolab/content/posts/`(마크다운, git)이고, 장은 KarmoLab 셸로 찍습니다.

```bash
cd apps/karmolab
npm run gen:post-pages   # /posts/<slug>/ · /about/ · /works/ · /feed.xml · /404
```

산출은 검증용으로 `content/pages/` 에 나옵니다(배포는 워크플로가 `apps/blog/` 로 옮깁니다).
사이트 한 벌을 그대로 조립해 보려면:

```bash
node apps/karmolab/scripts/assemble-site.mjs --site apps/blog --out apps/blog/_site
```

---

## KarmoLab: TypeScript → `js/` 빌드

위젯·툴박스 소스는 `src/`, 배포물은 `js/`입니다. **KarmoLab 코드를 수정했다면** 장을 굽기 전에 빌드하세요.

```bash
cd apps/karmolab
npm install
npm run build
```

타입만 검사:

```bash
npm run typecheck
```

화면을 고치는 중이라면 **배포를 기다리지 말고** 핫리로드 서버를 씁니다:

```bash
npm run dev      # http://127.0.0.1:8813/apps/karmolab/index.html
```

작업 중 검사는 바뀐 것에 걸리는 것만:

```bash
npm run gates:changed
```

---

## KarmoLab: 정적 파일만 띄우기

빌드 산출을 **파일 그대로** 서빙해 볼 때 씁니다. 상단 앞머리(`---`)가 글자로 보일 수 있으나 **스크립트는 대체로 동작**합니다(배포에서는 조립기가 떼고 냅니다).

**Python 3** (레포 루트에서):

```bash
cd /path/to/mascari4615.github.io
python -m http.server 8899
```

브라우저: **http://localhost:8899/apps/karmolab/index.html**

**Node** (정적 서버 예):

```bash
npx --yes serve -l 8899
```

그다음 같은 경로로 `index.html`을 열면 됩니다.

---

## KarmoLab Tauri (데스크톱)

Rust·Tauri·WebView2 전제. 자세한 설명은 **`apps/karmolab-tauri/README.md`**.

```bash
cd apps/karmolab-tauri
npm install
npm run dev
```

- **`dev-static.mjs`** 가 레포 루트를 **8898** (KarmoLab Dev identifier `.dev`) 에 서빙 (Node, no-store header) + Tauri 가 **http://127.0.0.1:8898/apps/karmolab/** 를 엽니다.
- production .exe (`KarmoLab`) 옆에 그냥 켜면 됨 (별 single-instance 그룹).
- 설치 패키지 빌드: `npm run build` (release.conf.json 오버라이드, identifier 복원).
- KL-046 — `dev:dual` / `dev:app` / `dev:with-jekyll` / `dev:remote` 변종 폐기(흐름 하나).
- 데스크톱 앱에서 **KarmoLab → 데스크톱 앱 → 서버 모니터**의 **로컬** 블록에서 KarmoLab 핫리로드·Discord 봇 등 프로필 시작·종료·`npm install`·(설정 시) **deploy**: **문서 → 데스크톱·로컬** 탭 (`apps/karmolab/js/widgets/docs/local-dev-runner.md`).

---

## Discord 봇 워크스페이스

슬래시 명령 목록이 아니라 **워크스페이스 진입·빌드**만 여기 둡니다. 세부 스크립트·환경 변수는 **`apps/discord-bots/README.md`** 와 각 앱 README를 보세요.

```bash
cd apps/discord-bots
npm install
npm run build
npm run start:yawnbot
npm run deploy:yawnbot
```

---

## 기타 `apps/`

| 앱 | 대표 명령 |
|----|-----------|
| `chat-overlay` | `cd apps/chat-overlay` → `npm install` → `npm run tauri:dev` |
| `karmo-web-extension` | Chrome에서 **압축해제된 확장 로드** → 폴더 선택 (`README.md` 참고) |

---

## 유용한 링크

| 설명 | URL |
|------|-----|
| 이 레포 | https://github.com/Mascari4615/Mascari4615.github.io |
| Tauri v2 | https://v2.tauri.app/ |

---

## KarmoLab에서 이 문서 열기

**[KarmoLab](https://blog.mascari4615.com/)** → **문서** → **프로젝트 명령** 탭.
