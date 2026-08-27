# mascari4615.github.io — AI 에이전트 작업 지침

블로그 + KarmoLab 앱 monorepo. 배포 = GitHub Pages, 도메인 `https://blog.mascari4615.com` (CNAME).
구조: `apps/blog/` = 사이트 껍데기 (Jekyll = 얇은 조립기 — permalink·sitemap·정적 복사만, Chirpy 는 철거됨) / `apps/` 서브앱 (karmolab·discord-bots·karmolab-tauri 등) / `packages/ai/`(`@karmo/ai`) / `unity/` 유니티 프로젝트 (npm workspace 밖 — 위 게이트와 무관).
**뿌리 = KarmoLab 앱** (change.karmolab-at-root, memo): `/` 가 앱 셸이고 `/t/<id>/`·`/u/`·`/bot/`·`/wm/`·`/c/`·`/play/`·`/sw.js` 가 그 켜에 선다. 옛 `/karmolab/*` 는 지원 안 함(404).
**블로그 = KarmoLab 파이프** (change.blog-cutover, memo): 글 정본 = `apps/karmolab/content/{posts,drafts}/` · 렌더 = `src/lib/markdown/` · 장 생성 = `scripts/gen-post-pages.mjs` (`/posts/<slug>/`·`/about/`·`/works/`·`/feed.xml`). **목록 장은 없다** — 목록의 집은 커뮤니티 「글」 판(`/?board=blog#community`).

## Post 규칙 (글 원본 = `apps/karmolab/content/posts/`)

**파일명**: `YYYY-MM-DD-slug-name.md` (kebab-case, slug = URL). 드래프트 = `content/drafts/`.

**Front matter**: `title` / `description` / `categories: [..]` / `tags: [..]` / `date: ISO8601(+09:00)` / `image` / `hidden`.

**`last_modified_at`**: 내용 변경 시만 갱신 (오타·포맷 변경 X). 이력은 git 이 정본.

**글쓰기 스타일**: 절제 (중복·자명한 내용 제거). 머리말(목적·방향) / 꼬리말(선택) / 메모(참고·키워드·도토리·기록).

**`hidden: true`**: 목록·색인·피드에서 제외, URL 직접 접근만.

**문법**: 표준 마크다운 + 우리 확장 (유튜브 URL 단독 줄 = 카드 · ` ```mermaid ` = KarmoGraph · `> [!NOTE]` callout). Liquid/Kramdown 문법 금지 — 렌더러가 모른다.

## 빌드 / 검증

```bash
npm run verify                              # main invariant 단일 게이트 (push 전 필수)
cd apps/karmolab && npm run gen:post-pages  # 블로그 장 재생성 (content/pages/ 검증 산출)
node apps/karmolab/scripts/assemble-site.mjs --site apps/blog --out apps/blog/_site  # 사이트 조립 (Ruby 0)
```

## KarmoLab 화면 작업 = `npm run dev` (배포 기다리지 마라, KL-100)

**KarmoLab 의 화면·스타일·위젯을 고칠 때 배포를 기다리거나 새로고침하지 마라.**

```bash
cd apps/karmolab && npm run dev   # http://127.0.0.1:8813/apps/karmolab/index.html
```

- **스타일** — 저장 즉시 반영. 새로고침 없음(화면 상태 유지)
- **위젯** — 저장하면 그 번들만 다시 받아 **갈아 끼운다**. 입력하던 값·열어 둔 탭이 살아 있다
- **셸**(`src/toolbox.ts`·`widgets-loader`·`index.html`) — 이때만 자동 새로고침
- 서버모니터 「KarmoLab (핫리로드)」 카드로도 기동 (`devProfiles: karmolab-dev`)

받쳐 주는 것: `Toolbox.register()` 가 **같은 id 재등록 = 교체**로 동작한다. 위젯이 타이머·전역
리스너를 걸면 `build` 안에서 `Toolbox.onDispose(fn)` 로 뒷정리를 맡겨라 — 안 맡기면 갈아 끼울
때마다 쌓인다(DOM 리스너는 노드와 함께 죽으므로 적을 필요 없다).

**셸(`index.html`)을 고쳤으면 `npm run audit:pages`** — 도구 상세 127장은 셸에서 배포 때
찍힌다. 셸 모양이 달라져 생성기가 멈추면 **배포가 통째로 막힌다**(2026-08-07 세 시간 막혔다).
`npm run verify` 에도 물려 있다.

## 검증 루프 — 작업 중에는 `gates:changed` (KAR-231)

**작업 중에 `npm run build` 를 반복해서 돌리지 마라.** 게이트 통짜는 **한 판 201초**(앞단계
포함 4~5분)다. 2026-08-19·08-20 두 세션이 연달아 같은 판을 다섯 번 돌렸고, 사람은 그동안
「왜 이리 오래 걸려」만 물었다.

```bash
cd apps/karmolab
npm run gates:changed     # 바뀐 것에 걸리는 검사만 (한 파일이면 160 -> 50~60개)
npx tsc --noEmit          # 타입은 따로, 몇 초
npm run build             # push 직전 한 번만 (통짜)
```

`gates:changed` 는 **발판을 스스로 알아낸다**(`scripts/lib/gate-derive.mjs`) — 검사 스크립트가
자기 안에 적어 둔 경로 + 이름 규칙으로 실재하는 파일. **아무 것도 못 알아내면 그 검사는 그냥
돈다**(안전 기본값). push·CI 는 언제나 통짜라, 여기서 잘못 건너뛰어도 배포로는 안 샌다.

새 검사를 달면 `test:gate-derive` 가 「발판이 무의미하게 넓어졌나」를 막는다 — 그 게이트가
빨개지면 유도가 다시 no-op 이 됐다는 뜻이다(그게 어제 있었던 일이다).

## main invariant (`npm run verify`)

main 브랜치는 항상:
- `apps/karmolab` build (typecheck 포함) 통과
- `packages/ai`(`@karmo/ai`) build 통과
- `apps/karmolab-tauri/src-tauri` cargo check 통과 + ACL audit (`acl.toml ⟷ #[command] ⟷ caps` cross-check)
- typos check 통과

verify fail 시 SLO: 1시간 내 revert. pre-push hook 이 자동 호출, CI post-push audit 도 발동.

## Tauri ACL (KL-063)

새 command 추가 = **2곳만**: ① 구현 `#[tauri::command] fn` ② `acl.toml` 알맞은 `[[group]].commands` 1줄.
`build.rs` 가 `acl.toml` 에서 handler + permissions 파생 — `capabilities/default.json` 은 새 그룹 신설 시만 변경.

## IO 무거운 Tauri command = async 강제 (KL-043)

`fs::read_dir` 다중 / external process spawn(git·claude·gh) / 수 초 작업:
```rust
pub async fn cmd(params) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || cmd_blocking(params))
        .await.map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}
```
단순 파일 R/W·toggle 등 <10ms = sync OK.

## KarmoLab Server Monitor 등록 (Note 12)

새 봇·로컬 서버·dev runner 추가 시 **반드시 `apps/karmolab/data/servermonitor-config.json` `devProfiles` 에 등록** — 사용자가 터미널 명령 외울 필요 없게.

**npm-script 형식 (선호)**: `{ id, label, app, script, deployScript?, healthUrl? }` — `program/args` 손기재 금지.
**raw (예외)**: `{ id, label, cwd, program, args }` — npm script 아닌 실행체만.

stale 자동 차단: `servermonitor-config-audit.mjs` 가 `npm run verify` 에서 script 실재 cross-check.

**트레이 「빠른 실행」에도 띄우려면** `apps/karmolab/data/tray-menu.json` 에 한 줄 — 시계 옆
아이콘에서 바로 켜고 끈다(터미널 불요). `kind` 셋: `dev`(devProfiles id 를 켜고 끄기 —
사람 카드와 **같은 손**이라 상태가 안 갈라진다) · `tool`(창 열고 그 위젯으로) · `url`.
Rust 는 안 건드린다(`src/tray_menu.rs` 가 그 파일을 읽어 그린다). 같은 audit 가 죽은 줄
(없는 프로필·없는 위젯)을 push 전에 막는다.

AI 직접 조작 = `127.0.0.1:8766` HTTP (`localdev-http.json` 에서 토큰·포트 자동 로드). 봇 재기동 등을 사용자에게 안내하지 말고 이 HTTP 로 처리.

## AI (Vertex / Claude)

Vertex AI 선호 (credits 보유) — `KARMO_AI_SURFACE=vertex` default. AI Studio = fallback only.
예외: 무한 텍스트 어드벤처 (KL-032) = Claude Max OAuth default, Vertex 토글 선택 가능.

## Git Workflow

정본 = `memo/rules/git.md`. main 직접 push default, force push 절대 금지.
PR 생성 케이스: autopilot Draft PR / CodeRabbit 리뷰 / 다른 세션 충돌 회피 worktree / 외부 협업.
Commit = Conventional Commits (`feat:`/`fix:`/`chore:` 등), pre-commit hook 강제.

## 공통 원칙

`memo/rules/` 정본 적용 (레거시 금지·마이그 자기소멸·한 commit 한 주제 등). 충돌 시 memo 룰 우선.
