# mascari4615.github.io — AI 에이전트 작업 지침

Jekyll 블로그 + KarmoLab 앱 monorepo. 배포 = GitHub Pages `https://mascari4615.github.io`.
구조: `_posts/` 블로그 / `apps/` 서브앱 (karmolab·discord-bots·karmolab-tauri 등) / `packages/karmolab-ai/`.

## Post 규칙

**파일명**: `YYYY-MM-DD-slug-name.md` (kebab-case). 드래프트 = `slug-name-DRAFT.md`.

**Front matter 필수**: `title` / `description` / `categories` / `tags` / `date: YYYY-MM-DD. HH:MM` (마침표+공백 주의).

**`last_modified_at`**: 내용 변경 시만 갱신 (오타·포맷 변경 X). 이전 날짜는 주석으로 보존.

**글쓰기 스타일**: 절제 (중복·자명한 내용 제거). 머리말(목적·방향) / 꼬리말(선택) / 메모(참고·키워드·도토리·기록).

**`hidden: true`**: 목록에서 숨김, URL 직접 접근은 가능.

**`assets/js/dist/` 편집 금지** — `_javascript/` 소스 편집 후 `npm run build:js`.

## 빌드 / 검증

```bash
npm run verify        # master invariant 단일 게이트 (push 전 필수)
npm run build         # CSS purge + JS bundle
npm run build:graph   # 포스트 그래프 데이터
bundle exec jekyll serve --draft  # 로컬 미리보기
```

## master invariant (`npm run verify`)

master 브랜치는 항상:
- `apps/karmolab` build (typecheck 포함) 통과
- `packages/karmolab-ai` build 통과
- `apps/karmolab-tauri/src-tauri` cargo check 통과 + ACL audit (`acl.toml ⟷ #[command] ⟷ caps` cross-check)
- `apps/blog` lint:js + lint:scss 통과
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
**raw (예외)**: `{ id, label, cwd, program, args }` — `bundle exec jekyll` 같이 npm script 아닌 경우만.

stale 자동 차단: `servermonitor-config-audit.mjs` 가 `npm run verify` 에서 script 실재 cross-check.

AI 직접 조작 = `127.0.0.1:8766` HTTP (`localdev-http.json` 에서 토큰·포트 자동 로드). 봇 재기동 등을 사용자에게 안내하지 말고 이 HTTP 로 처리.

## AI (Vertex / Claude)

Vertex AI 선호 (credits 보유) — `KARMOLAB_AI_SURFACE=vertex` default. AI Studio = fallback only.
예외: 무한 텍스트 어드벤처 (KL-032) = Claude Max OAuth default, Vertex 토글 선택 가능.

## Git Workflow

정본 = `memo/rules/git.md`. master 직접 push default, force push 절대 금지.
PR 생성 케이스: autopilot Draft PR / CodeRabbit 리뷰 / 다른 세션 충돌 회피 worktree / 외부 협업.
Commit = Conventional Commits (`feat:`/`fix:`/`chore:` 등), pre-commit hook 강제.

## 공통 원칙

`memo/rules/` 정본 적용 (레거시 금지·마이그 자기소멸·한 commit 한 주제 등). 충돌 시 memo 룰 우선.
