# KarmoLab (Tauri)

데스크톱에서 시스템 WebView로 [KarmoLab](https://mascari4615.github.io/karmolab/)을 여는 얇은 셸입니다. **앱 바이너리에는 사이트 전체를 넣지 않고**, 배포된 GitHub Pages URL을 그대로 띄웁니다. 오프라인은 **서비스 워커(Chirpy PWA)가 받아 둔 캐시**에 의존합니다(한 번 온라인으로 쓴 뒤, WebView가 캐시를 지우지 않았다면 제한적으로 동작).

## 준비물

- [Rust](https://www.rust-lang.org/learn/get-started) + [Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/) (Windows: Visual Studio Build Tools, WebView2)
- **Node.js** (필수, Tauri 와 동일) — `npm run dev` 시 정적 서버는 `scripts/dev-static.mjs` 가 8898 포트로 서빙 (Node 단독, no-store header)

## 명령 (KL-046 — 단순화: `dev` + `build` 둘만)

```bash
cd apps/karmolab-tauri
npm install
npm run dev          # debug 빌드 (KarmoLab Dev) — 8898 정적 서버 + tauri dev. production .exe 옆에 동시 실행 OK.
npm run build        # release 빌드 (KarmoLab 설치 패키지) — `--config tauri.release.conf.json` 명시.
```

## 개발 빌드 vs Production — 자연스러운 분리 (KL-046)

**핵심**: `tauri.conf.json` 자체가 dev 기본 (identifier `.dev` / port 8898 / `KarmoLab Dev`). production 빌드는 `tauri.release.conf.json` 가 오버라이드. **`npm run dev` 를 production 옆에서 그냥 켜면 됨** — single-instance 그룹 별도라 충돌 X.

| 필드 | dev (`tauri.conf.json` 기본) | production (`tauri.release.conf.json` 오버라이드) |
|---|---|---|
| `productName` | `KarmoLab Dev` | `KarmoLab` |
| `identifier` | `com.mascari4615.karmolab.dev` | `com.mascari4615.karmolab` |
| window title | `KarmoLab [DEV]` | `KarmoLab` |
| 정적 서버 포트 | 8898 | 8899 |
| 트레이 icon | KarmoLab + **DEV badge overlay** (`lib.rs::with_dev_overlay`) | KarmoLab |
| 트레이 tooltip | `KarmoLab [DEV] — debug 빌드 (npm run dev)` | `KarmoLab — 트레이 메뉴…` |
| `createUpdaterArtifacts` | false | true |

dev/prod 분기 진실 = Rust `cfg!(debug_assertions)` (debug build = dev / release = prod). identifier 도 그쪽에 맞춰 정합. CI workflow (`karmolab-tauri-release.yml`) 는 이미 `--config tauri.release.conf.json` 명시 사용.

### ⚠ `cargo build` / `cargo run` / `cargo check --all-targets` 직접 사용 X

이 명령들은 conf override 안 거치고 직접 컴파일 → tauri-plugin-single-instance / Windows AUMID 의 dev/prod 분기는 `cfg!(debug_assertions)` 로 작동하지만, frontend 자산 (devUrl 8898) 이 안 떠있으면 흰 화면. **dev 검증은 항상 `npm run dev`** (정적 서버 + tauri dev concurrently).

## 원격 + 캐시(오프라인에 가깝게)

- KarmoLab 페이지(`apps/karmolab/index.html`)는 **프로덕션 빌드에서** 사이트 루트의 **`/sw.min.js`(Chirpy 서비스 워커)** 를 등록합니다. 본문 레이아웃을 쓰지 않던 페이지라 기존에는 SW가 붙지 않았습니다.
- 그 SW는 설정상 **거부 경로가 아닌 GET 요청**을 네트워크로 받은 뒤 **Cache Storage에 넣습니다**. 그래서 **같은 출처**(`/karmolab/`, `/apps/karmolab/…` 등)는 방문·로드된 범위에서 캐시에 쌓일 수 있습니다.
- **한계**: (1) 최초 실행부터 오프라인이면 캐시가 없어 빈 화면/실패할 수 있습니다. (2) 브라우저·WebView2가 디스크를 비우면 캐시가 사라집니다. (3) **폰트(Inter, Pretendard)·일부 위젯 전용 CDN** 등은 여전히 외부망이 필요할 수 있습니다. KarmoLab 본문은 `crypto-js`·`marked`·`prism`(테마·자주 쓰는 언어 컴포넌트)을 `apps/karmolab/js/vendor`에 두어 같은 출처로 제공합니다.
- 로컬에서 앱으로 확인할 때는 **`npm run dev`** (8898 정적 서버 + KarmoLab Dev) 를 쓰면 됩니다. 배포본·서비스 워커·원격 캐시 검증은 그냥 production .exe (`KarmoLab`) 사용 — 이미 GitHub Pages live URL 띄움.

## 배포·원격 검증(짧은 체크리스트)

1. production `KarmoLab` 이 GitHub Pages `karmolab` 을 띄우는지.
2. **사이드바 → 기타 → 디버그** 에서 OS 알림 테스트(성공/에러 로그).
3. **트레이**: 창 숨김, 다시 실행 시 단일 인스턴스로 앞으로 오는지.
4. **서비스 워커**: `index.html` 의 SW 등록은 **프로덕션 Jekyll** 에만 들어갑니다. 로컬 `jekyll serve`(기본 development)로는 해당 스크립트가 빠지므로, SW·오프라인 캐시는 **배포 URL** 또는 `JEKYLL_ENV=production` 으로 빌드한 `_site` 로 확인하세요.

## 로컬 데브 러너

사용 방법·`devProfiles` 설정·플랫폼별 제한은 **KarmoLab 웹앱 → 문서 → 데스크톱·로컬** 탭(원본 `apps/karmolab/js/widgets/docs/local-dev-runner.md`)에 모아 두었습니다.

## 앱 내 업데이트 (`tauri-plugin-updater`)

- 트레이 메뉴 **「업데이트 확인…」** 이 GitHub Releases의 정적 manifest를 조회한 뒤, 새 버전이 있으면 내려받아 설치합니다(Windows는 passive 설치 모드). 결과는 OS 알림으로 짧게 알립니다.
- **엔드포인트**(기본): `https://github.com/mascari4615/mascari4615.github.io/releases/latest/download/latest.json` — 각 릴리스에 `latest.json` 과 플랫폼별 `.sig`·설치 파일 URL이 있어야 합니다. 형식은 [Tauri Updater](https://v2.tauri.app/plugin/updater/) 의 static JSON 과 동일합니다.
- **서명**: 업데이트는 공개키(`tauri.conf.json` → `plugins.updater.pubkey`)로 검증됩니다. 릴리스 빌드 시 **비밀키**가 필요합니다(`.env`는 읽히지 않음).
  - `TAURI_SIGNING_PRIVATE_KEY`: 비밀키 **파일 경로** 또는 PEM/키 **문자열**
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 키에 비밀번호를 둔 경우
- 키 생성 예: `npx tauri signer generate -w src-tauri/karmolab-updater.key` (로컬 전용으로 만든 키는 **백업**하세요). 저장소에는 비밀키를 올리지 마세요(`.gitignore`에 `src-tauri/karmolab-updater.key` 가 있습니다). 공개키 문자열을 바꾼 뒤에는 **이미 배포된 앱**과 맞지 않으면 업데이트가 실패하므로, 키 교체는 신중히 하세요.
- 릴리스 전용 설정인 `src-tauri/tauri.release.conf.json` 에서 `bundle.createUpdaterArtifacts` 를 켜 두었습니다. 배포 빌드에서는 업데이트용 시그니처 파일과 manifest가 함께 생성됩니다. 예시 manifest 뼈대는 `updater/latest.json.example` 을 참고하세요.
- **릴리스 체크리스트(버전·서명·Release·CI)** 는 KarmoLab 앱 **문서 → 로드맵** 탭(`apps/karmolab/js/widgets/docs/roadmap.md` 의 「Tauri 데스크톱 · 자동 업데이트」절)에 모아 두었습니다.
- 자동 배포는 `.github/workflows/karmolab-tauri-release.yml` 이 담당합니다. `karmolab-v*` 태그를 푸시하거나 Actions에서 수동 실행하면 Windows 빌드, 서명, GitHub Release 업로드, `latest.json` 생성까지 같이 처리합니다.
- GitHub Secrets 에 `TAURI_SIGNING_PRIVATE_KEY` 를 넣어야 합니다. 비밀번호가 있는 키면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 도 같이 넣으세요.

## 데스크톱 전용

- Tauri가 주입: `window.__KARMOLAB_DESKTOP__ === true` (웹 브라우저에는 없음)
- KarmoLab 스크립트: `Toolbox.isDesktopApp()` 로 동일 분기
- **단일 인스턴스**: 앱을 다시 실행하면 새 창 대신 기존 창이 앞으로 옵니다(최소화 해제 포함).
- **창 닫기(X)**: 앱이 종료되지 않고 트레이로 숨겨집니다. 완전 종료는 트레이 메뉴의 **종료**만 사용하세요.
- 트레이: **왼쪽 클릭**으로 메뉴(창 보이기 / 브라우저에서 열기 / **업데이트 확인…** / 종료). Windows에서는 트레이 아이콘 **왼쪽 더블클릭**으로 메뉴 없이 창만 앞으로.
- 헤더에 **브라우저** 링크(앱 전용): 기본 브라우저로 같은 사이트를 엽니다.
- **OS 알림**: `showToast`가 에러·성공을 띄울 때(일부 짧은 성공 메시지 제외) 데스크톱 알림으로도 보냅니다. **에러 토스트**는 `sound: Mail`을 붙입니다(Windows에서 셸이 대소문자 정규화). 성공은 무음(기존과 동일)입니다.
- `devtools.js`는 **더 이상 Rust `include_str`로 앱에 박지 않습니다**(옛 스크립트가 최신 위젯·JSON UI를 덮어쓰던 문제 방지).
- **소리**: 토스트 자체는 Windows·집중 방해 설정에 따라 무음일 수 있어, `sound`가 켜진 요청은 토스트 표시 **직후** `MessageBeep`(시스템 별표음)으로 한 번 더 알립니다. **이 동작은 앱을 다시 빌드해야** 들어갑니다.
- **`desktop_notify` 인자** (`invoke('desktop_notify', { … })`): `title`, `body` 필수. 선택: `sound`, `image_path`(스네이크 케이스 — 로컬 파일 절대 경로).
  - **Windows** (`notify-rust` → WinRT 토스트): `sound`는 예) `IM`, `Mail`, `Reminder`, `SMS`, `Alarm`, `Call` … 무음이면 `silent` 또는 생략. 값 `Default`는 WebView 무음 이슈를 피하려고 셸에서 **`IM`** 알림음으로 바꿔 보냅니다.
  - **Linux/macOS**는 같은 필드가 있어도 데스크톱/세션에 따라 무시되거나 다르게 동작할 수 있습니다.
  - 배너·소리·방해 금지는 **Windows 설정 → 시스템 → 알림**에서 앱별로 조정합니다.

## 사이드바에 「디버그」가 없을 때

**브라우저에서는 보이는데 앱에서만 안 보일 때**는 WebView2가 **옛 캐시**를 쓰는 경우가 많습니다. 앱 데이터 삭제·강력 새로고침을 시도하거나, GitHub에 배포된 최신본과 비교해 보세요.
