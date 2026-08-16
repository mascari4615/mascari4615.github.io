/**
 * **push 전에 도는 검사 목록 — 한 곳** (2026-08-13)
 *
 * 같은 목록이 두 군데 있었다: `package.json` 의 `verify:prepush` 와
 * `typecheck-pushed.mjs` 의 「소스만 읽는 것들」. 하나에 검사를 더하고 다른 하나를 잊으면
 * **밀 커밋을 재는 쪽이 조용히 덜 보게 된다** — 이 저장소가 오늘 하루 세 번 당한 그 병이다
 * (게이트 줄만 올림 · 목록이 워크플로에만 있음 · 라이브 목록 두 벌).
 *
 * 그래서 목록은 여기 하나뿐이고 둘 다 이 파일을 읽는다.
 */

/** push 전 3초 검사 — 내 작업 폴더에서 돈다 */
export const PREPUSH = [
  'test:ink',
  'audit:jpegbg',
  'audit:hidden',
  /* 0.05초 — 첫 화면 블록이 «그려졌다 사라지는» 것을 막는다. 사람 눈에는 80ms 라 안 보이는데
     사이트 밀림의 대부분이었다(0.103 → 0.0105). 값싸고 잡는 게 크면 앞으로 당긴다. */
  'audit:home-blocks',
  /* 0.05초 — 나가는 화면에서 보안 한 줄이 빠지는 것을 막는다. GitHub Pages 는 헤더를
     못 붙여서 이 meta 가 유일한 자리인데, 머리를 조립하는 자리가 여럿이라 조용히 빠진다. */
  'audit:csp-meta',
  'audit:saylive',
  'audit:iconbtn',
  'audit:aliases',
  'audit:scripts',
  'test:tools',
  'test:tool-url',
  'test:i18n:keys',
  'test:karmograph',
  'audit:wf-prereq',
  'audit:orphans',
  'audit:i18n-load',
  /* ★ 0.7초짜리인데 **배포를 네 판 세운** 병을 잡는다 (2026-08-14): 「옮겼다더니 값이 한국어
     그대로」. 그 한 열쇠 때문에 verify 가 서고 배포가 통째로 막혔고, 미는 자리에서는 아무도
     안 보고 있었다. 값싸고 잡는 게 크면 앞으로 당긴다. */
  /* 0.2초 — 스크립트로 파일을 고치다 역슬래시-b·역슬래시-n 이 **진짜 글자로** 박히는 사고를 잡는다.
     오늘 실제로 그렇게 정규식 하나가 영영 안 맞았다(`^HlivePage`). `build` 에만 있어서
     미는 자리에서는 아무도 안 봤다 — 값이 싸고 잡는 게 확실하면 앞으로 당긴다. */
  'audit:ctl',
  /* 0.05초 — 「새로 나옴」 표와 사이트맵 변경일 기록은 개발 머신에서만 남는데, 안 담고 밀면
     새 도구가 사이트에서 새것으로 안 보이고 변경일 없이 실린다. 미는 자리가 유일한 자리다. */
  'audit:tool-state',
  'audit:spec-locales',
  'audit:wiki-fresh',
  'test:i18n'
];

/**
 * **지어 놓은 것**(`js/`·말 묶음)을 읽는 검사들 — 갓 꺼낸 커밋에는 그게 없다.
 * 밀 커밋을 재는 자리에서 이것들을 돌리면 「없는 것을 보고 빨강」이 난다(실측 3건).
 */
export const NEEDS_BUILD = ['test:tools', 'test:tool-url'];

/** 밀 커밋을 풀어 놓은 자리에서 돌려도 되는 것들 */
export const SOURCE_ONLY = PREPUSH.filter((g) => !NEEDS_BUILD.includes(g));
