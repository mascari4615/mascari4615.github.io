# 로컬 데브 러너 (Tauri 전용)

KarmoLab **데스크톱 앱**(Tauri) 안에서만 쓰는 기능이에요. 일반 브라우저로 GitHub Pages만 열면 **서버 모니터** 위젯 자체가 메뉴에 없습니다.

> **원본 파일:** `apps/karmolab/js/widgets/docs/local-dev-runner.md` (GitHub에서 직접 열어도 동일)

---

## 앱 실행하기

터미널에서:

```bash
cd apps/karmolab-tauri
npm install
npm run dev
```

- `npm run dev`: **`scripts/dev-static.mjs`** 가 레포 루트를 **8898** 에 서빙합니다 (Node, no-store header). **`http://127.0.0.1:8898/apps/karmolab/`** 가 응답할 때까지 기다렸다가 Tauri 가 그 URL 을 엽니다 (KarmoLab Dev identifier `.dev`). production .exe (`KarmoLab`) 옆에 그대로 켜면 됨 — 별 single-instance 그룹. 끄려면 터미널 **Ctrl+C**.
- KL-046 — `dev:dual` / `dev:app` / `dev:with-jekyll` / `dev:remote` 변종 폐기. dev 흐름 한 개 (`npm run dev`) + build 한 개 (`npm run build`).

빌드·원격 URL 등은 **문서 → 프로젝트 명령** 탭과 `apps/karmolab-tauri/README.md` 를 참고하세요.

---

## 위젯에서 쓰는 법

1. 앱에서 상단 **데스크톱 앱** 메뉴 → **서버 모니터**를 엽니다. 열리면 **한 번 자동으로** URL ping·카드 갱신이 돌아갑니다. ping은 카드마다 순서대로 끝날 때마다 **그 카드만** 잠깐 연두색 강조와 ✓가 보였다 사라집니다(실제 HTTP 확인이 있는 항목만).
2. **로컬** 카드(같은 **`id`** 의 `localMonitors` URL 응답 + `devProfiles` 프로세스가 **한 장**에 묶임)에서 **시작**·**종료** 등을 씁니다. **새로고침**으로 다시 ping·추적을 갱신하고, **목록 새로고침**은 설정·추적만 다시 읽습니다(URL ping 없음).
3. **환경 변수(.env):** **로컬** 아래 **환경 변수**에서 `servermonitor-config.json`의 **`envFiles`**에 적은 파일을 탐색기로 열거나, 앱 안에서 편집·저장할 수 있습니다.
4. 페이지 **맨 아래** **저장소 루트**에 이 레포의 최상위 폴더를 넣고 **저장**합니다. (예: Windows `C:\Users\…\Mascari4615.github.io`) 값은 WebView `localStorage`와 Rust 쪽 상태에 같이 반영됩니다. `.env` 편집·repofile 경로에 필요합니다.

---

## envFiles (선택)

- **`apps/karmolab/data/servermonitor-config.json`** 의 **`envFiles`** 배열에 `{ "label", "path", "hint?" }` 를 둡니다. `path`는 레포 루트 기준 **상대 경로**만 됩니다(상위 폴더 `..` 불가).
- 데스크톱 앱에서 **탐색기에서 표시**, 기본 앱으로 열기, **편집·저장**(임시 파일 후 이름 바꿈, 최대 512KB)을 제공합니다. 파일이 없으면 빈 편집기로 시작해 저장 시 새로 만들 수 있습니다.

---

## 프로필 설정 (`devProfiles`)

- 명령 목록은 **`apps/karmolab/data/servermonitor-config.json`** 의 **`devProfiles`** 배열만 읽습니다.
- UI는 **프로필 `id`** 만 Rust에 넘기고, `program`·`args`·`cwd`는 Rust가 그 JSON에서 다시 읽어 검증합니다.
- **허용 `program`:** `npm`, `npx`, `bundle`, `ruby`, `node` (및 확장자 변형).
- **`cwd`:** 레포 루트 기준 상대 경로(예: `.`, `apps/discord-bots`). 반드시 루트 **아래** 실제 폴더여야 합니다.
- **`npmInstall: true`:** 그 프로필에 **npm i** 버튼이 보이고, 해당 `cwd`에서 **`localdev_npm_install_stream`** 으로 실행됩니다. stdout/stderr는 카드 아래 **로그 패널**에 줄 단위로 스트림되고, 끝나면 토스트로 성공/실패가 뜹니다.
- **`deployArgs`:** (선택) 예: `["run", "deploy:yawnbot"]` — 카드에 **deploy** 버튼이 생기고, 같은 `cwd`에서 **`localdev_deploy_stream`** 으로 `npm` + 인자를 실행합니다. 로그 패널·토스트 동작은 npm i와 같습니다.
- **`localMonitors`:** 항목마다 `title`·`subtitle`(선택)·`url`(선택)·`noHealthUrl`(의도적으로 ping 안 함) 등을 둘 수 있습니다. 예전처럼 `label`만 있어도 됩니다. 예: **YawnBot** 은 기본 **`http://127.0.0.1:4615/webhook/github`** (`WEBHOOK_PORT`). 데스크톱에서는 **`devProfiles` 항목과 `id`가 같으면 카드 한 장**에 URL 상태와 시작·종료가 같이 나옵니다.
- **`healthUrl`:** (선택) `devProfiles` 전용. `localMonitors`와 주소를 맞춰 두면 카드 ping과 의미가 같아집니다.

---

## 동작·제한

- **시작:** 백그라운드 프로세스로 실행합니다(표준 출력은 숨깁니다).
- **종료 (Windows):** `taskkill /T /F` 로 프로세스 트리를 끊습니다.
- **종료 (Linux/macOS):** 부모 PID에 `kill`을 보내는 수준이라, 자식이 남을 수 있어요. 필요하면 `pkill` 등으로 정리하세요.
- **앱 완전 종료:** Rust 쪽 PID 추적이 초기화됩니다. 남은 프로세스는 작업 관리자 등으로 확인하세요.
- **Windows:** `npm` / `npx` / `bundle` / `ruby` 는 내부적으로 `cmd /C` 로 호출합니다(`.cmd`/배치 런처 호환). **Node·Ruby(`bundle`)** 가 사용자 PATH에 있어야 합니다.

---

## AI 비-GUI 경로 (localhost HTTP — TASK-KL-065)

서버 모니터의 모든 운영 액션은 GUI(카드) 클릭 외에 **localhost HTTP** 로도 구동됩니다. AI 에이전트(Claude)가 데스크톱 앱 창을 클릭하지 않고 dev 프로필을 직접 start/stop/log/deploy 할 수 있게 하기 위함입니다. 사람 카드와 **같은 `LocalDevState`·같은 함수 본체**를 공유하므로 한쪽에서 시작한 프로세스를 다른 쪽이 관측·종료할 수 있습니다(이중 추적 없음).

- **바인드:** `127.0.0.1` 만 (타 머신 접근 차단). 기본 포트 **8766**.
- **인증:** `Authorization: Bearer <token>`. 토큰·포트는 앱이 최초 1회 자동 생성 → `<app_local_data_dir>/localdev-http.json` (`{ "port", "token" }`). Windows 경로 예: `%LOCALAPPDATA%\com.mascari4615.karmolab\localdev-http.json`. `/localdev/health` 만 무인증(liveness).
- **응답 형식:** `{ "ok": true, "data": ... }` 또는 `{ "ok": false, "error": "..." }`.

| Method | 경로 | 본문/쿼리 | 대응 카드 동작 |
| --- | --- | --- | --- |
| GET | `/localdev/health` | — | (liveness, 무인증) |
| GET | `/localdev/repo-root` | — | 저장소 루트 조회 |
| POST | `/localdev/repo-root` | `{"path":"..."}` | 저장소 루트 설정 |
| GET | `/localdev/tracked` | — | 추적 중 프로필 목록 |
| GET | `/localdev/external` | — | 외부 실행 PID 맵 |
| POST | `/localdev/start` | `{"profile":"..."}` | 시작 |
| POST | `/localdev/stop` | `{"profile":"..."}` | 종료 |
| POST | `/localdev/external-stop` | `{"profile":"..."}` | 외부 실행 종료 |
| POST | `/localdev/stdin` | `{"profile":"...","text":"..."}` | stdin 전송 |
| POST | `/localdev/deploy` | `{"profile":"..."}` | deploy (blocking, 출력 반환) |
| POST | `/localdev/npm-install` | `{"profile":"..."}` | npm i (blocking, 출력 반환) |
| GET | `/localdev/log` | `?profile=X&tail=N` | 로그 마지막 N줄 스냅샷(기본 200, 폴링용) |

자가구동 스모크: **`apps/karmolab-tauri/scripts/localdev-http-smoke.sh`** (health→repo-root→start→tracked→log→stop). 정본 = Rust `apps/karmolab-tauri/src-tauri/src/local_dev_http.rs` + `TASK-KL-065`.

---

## 관련 문서

- 터미널 명령 모음: **문서 → 프로젝트 명령**
- **Deploy·npm i 로그 스트림**(카드 아래 패널)은 구현되어 있으며, 상세는 **문서 → 로컬 · deploy 로그** (`servermonitor-deploy-log-stream.md`)를 참고하세요.
- Tauri 앱 빌드·업데이트·트레이: `apps/karmolab-tauri/README.md`
- Tauri 업데이트·릴리스 체크리스트: **문서 → 로드맵** (`roadmap.md` 의 「Tauri 데스크톱 · 자동 업데이트」)
