# KarmoLab 위젯 작성 가이드

> 새 위젯을 만들기 전 / 기존 위젯을 수정할 때 반드시 본다. 같은 일을 두 번 구현하지 않기 위해.

## 부품 킷 (change.karmolab-ui-kit, 2026-08-30)

위젯 화면은 아래 공용 클래스로만 짓는다. 모양은 스킨 토큰이 정하므로 위젯 CSS 에 색, 둥글기, 그림자를 직접 적지 않는다. 새 부품이 필요하면 여기 목록에 더하고 `css/toolbox.css` 의 부품 킷 절에 규칙을 둔다. 위젯 안에서 만들지 않는다.

| 부품 | 클래스 | 쓰임 (2026-08-30 실측 사용 수) |
| --- | --- | --- |
| 버튼 | `.btn` `.btn-primary` `.btn-ghost` `.btn-sm` | 기본 601, 실행 143 (필 + 강조 밑선), 조용한 413, 작은 25 |
| 곁들이 버튼 | `.btn-outline` `.btn-tool` (`.is-on`) | 56 / 39. outline 은 창과 도구 머리, tool 은 좁은 머리띠(고정폭 11px) |
| 입력 묶음 | `.field-group` > `.field-label` + input/select/textarea | 210 / 187. 라벨은 모노 대문자 |
| 고정폭 입력 | `.mono-input` | 66 |
| 상태 줄 | `.tool-status` (`.ok` `.error`) | 167 |
| 보조 라벨 | `.tool-sublabel` `.tool-hint` | 247 / 31 |
| 고르기 칩 | `.tool-chips` > `.tool-chip` (`.active`) | 51 / 104. 평행사변형, 고른 것은 띠 반전 |
| 키, 값 목록 | `.tool-list` > `.tool-list-row` > `.tool-list-key` `.tool-list-val` `.tool-list-dim` | 79 / 90 |
| 두 칸 | `.tool-grid-2` `.tool-split` | 97 |
| 버튼 줄 | `.tool-actions` (`.tight`) | 50 |
| 놓는 곳 | `.tool-drop` | 38 |
| 탭 | `.tab-row` > `.tab-btn` (`.active`), `.tab-panel` | 셸이 만듦. 고른 탭은 띠 반전 |
| 재료 도구 틀 | `tools/shared/material-shell.ts` (`.pf-*`) | 재료 아홉 |
| 큰 수 | `.tool-display` | 타이머, 계산 |
| 클래스 없이도 되는 것 | 맨 `button`, `input[type=file]`, `table`, `details` | 셸이 킷 모양으로 채운다. 클래스를 하나라도 붙이면 그쪽이 이긴다 |

- 위젯 자체 클래스는 2026-09-01 에 킷으로 올렸다. `hu-btn` -> `.btn .btn-tool`, `tl-btn` -> `.btn .btn-outline`,
  `tl-btn-primary` -> `.btn-accent`, `tl-btn-toggle-on` -> `.btn-danger.is-on`, `ie-opt-label` -> `.field-label.is-inline`.
  `km-field` 도 앞서 옮겼다. 남은 것은 `ie-apply-btn`, `ie-tool-btn` 둘. 새 코드는 위 표로
- 살아 있는 견본 장은 `#uikit` (`src/widgets/uikit.ts`). 부품 24종을 갈래 여섯(기본, 입력, 알림과 값, 고르기, 짜임, 그 밖)으로,
  아래에 스킨 토큰 견본. 목록의 근거는 실측이다: 셸 CSS 가 규칙을 가진 클래스 중 위젯이 세 번 이상 쓰는 것 66개에서
  위젯 하나만 쓰는 자체 클래스를 뺐다. 부품을 더하면 이 표, `toolbox.css`, `uikit.ts` 셋을 같이 고친다
- 그 장 아래쪽에 스킨 토큰 22개가 색 견본과 함께 뜬다. 위젯 CSS 는 이 이름만 쓴다. 글자로 쓰는 강조색은 `--accent-ink`, 상태색 위 글자는 `--status-fg`

## 새 위젯이 지나야 하는 문

- `npm run smoke:tool-boot` 이 도구 전부를 열어 **자바스크립트 오류와 못 받은 `.js`** 를 본다 (67초).
  새 위젯이 부르는 파일은 `scripts/entry-points.mjs` 가 찾아 지어야 한다. `lazyScriptPaths`, 같은 폴더 형제,
  `ensureScript('이름')` 셋 다 자동으로 잡히지만, 그 밖의 방식으로 부르면 지어지지 않아 그 화면만 조용히 빈다
- `npm run audit:style-tokens` 가 직접 적은 크기와 색을 파일별로 센다. 늘리면 빨강. 색은 스킨 토큰으로

## 시작 전 체크리스트

새 위젯, 기능을 *코드로 옮기기 전* 다음 순서로 정독한다. 정독 결과는 TASK 문서 관련 파일 / 읽기 (참고 패턴) 에 명시. *어떤 파일을 보고 어떤 결론* 인지.

- [ ] **같은 카테고리, layout 위젯 1~2개 정독**. `widgets-lazy-meta.ts` 에서 같은 `layout` (`'full'` / `'form'`) 또는 `category` (`'desktop'` / `'lab'` / `'tool'` / `'play'`) 위젯 골라 *컨테이너 / 디자인 토큰 / 폴링, 라이프사이클 / 외부 lib 처리* 패턴 확인.
- [ ] **공통 helper 모듈 검토**. `Toolbox`, `chatbot/markdown.ts` (마크다운→HTML), `lib/karmoworld/parse-md.ts` (frontmatter), `lib/markdown/rich-view.ts` (마크다운+목차+mermaid+Prism), `@karmo/ai` 패키지. 같은 기능 거의 다 *이미 있음*. 새로 만들기 전 grep.
- [ ] **외부 lib 동일 출처**. mermaid, marked, prism 등은 `assets/lib/<lib>/<lib>.min.js` 에 동일 출처로 박혀있음 (Tauri webview 의 Tracking Prevention 회피). CDN (`cdn.jsdelivr.net` 등) 우선 안 씀.
- [ ] **글로벌 디자인 토큰 사용**. 자체 색, 폰트, spacing 박지 말 것. CSS 변수: `--bg-primary` / `--bg-secondary` / `--bg-tertiary` / `--text-primary` / `--text-tertiary` / `--accent` / `--border` / `--border-color` / `--radius-sm` / `--radius-md` / `--font-mono`. 다른 위젯이 쓰는 패턴 그대로.
- [ ] **자체 CSS injection 최소화**. `injectStyles()` 패턴은 *위젯 한정 클래스* 만. 컨테이너 / 카드 / 버튼 / 표 / 코드블록은 글로벌 스타일에 맡김. 다른 위젯과 외관 톤 어긋나면 사용자가 *이질감* 느낌.
- [ ] **탭 컨테이너와 내부 레이아웃 분리**. `build(container)`의 `container`는 공용 `.tab-panel`이기도 함. `display:grid/flex` 같은 화면 레이아웃은 컨테이너에 직접 걸지 말고, 내부 전용 wrapper에 검. 공용 `.tab-panel.active` 규칙과 충돌하면 넓은 화면에서만 레이아웃이 풀릴 수 있음.

체크 안 하고 자체 구현하면 *사용자 부정적 경험* (재구현, 디자인 일관성 깨짐, 유지보수 부담 증가). 룰 단일 출처: `memo/UMBRELLA.md` § 새 기능, 위젯, 모듈. 기존 정독 우선.

## 결정. 신규 vs 흡수 vs helper 재사용

정독 후 셋 중 하나:

| 결과 | 의미 |
| --- | --- |
| **기존 흡수** | 같은 일 하는 위젯이 있다 → 그 위젯에 카테고리, 모드, 탭 추가. 별도 위젯 X. |
| **helper 재사용** | 일부 변환, 유틸 (마크다운, mermaid, frontmatter, escapeHtml 등) 만 공유 → 공용 모듈로 빼고 우리 위젯이 호출. |
| **진짜 신규** | (a), (b) 다 안 맞는 *진짜* 새 도메인 → 그 *진짜 신규임* 의 근거 1줄 TASK 에 명시. |

의심되면 사용자에게 묻기.

## 위젯 등록 흐름. 신규일 때만

진짜 신규 결정 후:

1. `apps/karmolab/src/widgets/<slug>/<slug>.ts` (또는 단일 파일 `<slug>.ts`). IIFE + `Toolbox.register({ ...Toolbox.getLazyWidgetPublicMeta(slug), tabs: [...] })`.
2. `apps/karmolab/src/widgets-lazy-meta.ts`. 메타 entry 추가 (id / title / category / desc / layout / icon / lazyScriptPaths).
   → 묶을 목록은 **여기서 기계가 뽑는다.** `build.mjs` 의 `entryPoints` 에 손으로 적지 않는다.
3. **i18n 묶음**. 새 `loadNamespace('<ns>')` 를 쓰면 `apps/karmolab/i18n/<언어>/<ns>.json` 을 **세 언어 다** 만들고,
   `widgets.<id>.title`, `widgets-desc.<id>.desc` 를 `widgets.json`, `widgets-desc.json` 에 넣는다.
   ⚠ **파일만 만들고 안 구우면 위젯이 통째로 안 그려진다**. 화면은 `js/i18n/<언어>/<ns>.js` 를 받는데
   그게 404 면 받기가 실패하고 그 뒤 코드가 아예 안 돈다. **오류도 안 뜬다.**
   `node build.mjs` 가 이제 늘 굽는다(2026-08-28). 검사 = `npm run audit:i18n-catalog` (PREPUSH).
4. Tauri 명령이 필요하면 `apps/karmolab-tauri/src-tauri/src/<feature>.rs` (신규) + `lib.rs` 에 `mod`, `use` +
   `src-tauri/acl.toml` 에 `[[group]]` 한 벌 + `capabilities/default.json` 에 그 `identifier` 추가.
   → `permissions/` 는 **build.rs 가 acl.toml 에서 굽는 생성물**이다. 손으로 적지 않는다.

## 외부 lib 동일 출처 패턴

`lib/markdown/rich-view.ts` 가 정본 패턴:
- `Toolbox.ensureScript('vendor/marked.min')` 처럼 동일 출처 vendor 만 싣는다
- mermaid 는 안 싣는다. 도해는 `lib/karmograph/render.ts` 가 그린다

CDN 직접 import 는 *Tauri webview Tracking Prevention* 에서 사용자에 따라 차단됨. 동일 출처 우선.

## CSS 토큰 reference

다른 위젯의 실제 사용 예:
- `lib/markdown/rich-view.ts` 의 `.docs-body .mermaid` 가 `var(--bg-tertiary)`, `var(--border)`, `var(--radius-md)` 사용.
- `widgets/karmoddrine-dashboard/karmoddrine-dashboard.ts`. `.kd-card` 가 `var(--accent, #a99bf5)` (fallback), `var(--text-primary, #e8e8e8)` 사용.
- `widgets/quest-log/quest-log.ts`. 같은 패턴.

자체 hex (`#a99bf5`, `#e8e8e8` 등) 박지 말고 토큰 + fallback hex 패턴 따름.

## 관련

- 룰 정본: `memo/UMBRELLA.md` § 새 기능, 위젯, 모듈. 기존 정독 우선
- TASK 작성: `memo/TASK-SCHEMA.md` 본문 포맷 (특히 목표 첫 줄 사용자 원본 발화 인용 + 관련 파일 / 읽기 필수)
- 옵션 제안: `memo/UMBRELLA.md` § 옵션 제안 시 추천 + 근본 수정 평가 명시
