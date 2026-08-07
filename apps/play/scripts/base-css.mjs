/**
 * 놀이 공용 스타일 만들기 — 색·글씨 크기는 KarmoLab 이 정본 (TASK-KL-089)
 *
 * 놀이 셋이 저마다 색을 손으로 박고 있었다. KarmoLab 은 연보라에 각진 모서리인데 놀이들은
 * 금색에 둥근 모서리였다 — 같은 사이트로 안 보인다. 그렇다고 여기에 값을 베껴 적으면
 * 정본이 바뀔 때 조용히 갈라진다.
 *
 * 그래서 **KarmoLab 스타일에서 토큰 덩어리를 그대로 떠 온다.** 브랜드 색이 바뀌면 놀이도 같이 바뀐다.
 * 여기서 새로 정하는 것은 놀이에만 있는 부품(놀이 전환 줄·카드·판 고르는 칩)뿐이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CANON = path.join(here, '../karmolab/css/toolbox.css');

export function tokens() {
  const css = fs.readFileSync(CANON, 'utf8');
  const m = css.match(/:root\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('KarmoLab 스타일에서 토큰 덩어리(:root)를 못 찾았다 — css/toolbox.css 확인');
  return m[0];
}

export function baseCss() {
  return `/* 이 파일은 만들어진 것이다 — 손으로 고치지 마라 (apps/play/scripts/base-css.mjs).
   색·글씨 크기는 KarmoLab(css/toolbox.css)에서 그대로 떠 온다. */

${tokens()}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 1.6rem 1rem 3rem;
  background: var(--bg-void);
  color: var(--text-primary);
  font-family: 'Noto Sans KR', system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  font-size: var(--font-size-sm);
}
main { max-width: 40rem; margin: 0 auto; }
a { color: var(--accent); }

.play-crumb { font-size: var(--font-size-2xs); color: var(--text-tertiary); margin-bottom: 0.7rem; }
.play-crumb a { color: inherit; text-decoration: none; }
.play-crumb a:hover, .play-crumb a:focus-visible { color: var(--text-primary); text-decoration: underline; }

h1 { font-size: var(--font-size-lg); margin: 0 0 0.2rem; letter-spacing: -0.01em; }
.play-lead { color: var(--text-secondary); font-size: var(--font-size-xs); margin: 0 0 1.2rem; }

/* 놀이끼리 오가는 줄 — 목록 정본은 apps/play/games.json */
.play-strip { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0 0 1rem; font-size: var(--font-size-2xs); }
.play-strip a, .play-strip-now {
  display: inline-flex; align-items: center; min-height: 34px; padding: 0 0.7rem;
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  text-decoration: none; color: var(--text-secondary); background: var(--bg-primary);
}
.play-strip a:hover, .play-strip a:focus-visible { color: var(--text-primary); border-color: var(--border-hover); }
.play-strip-now { background: var(--accent-dim); color: var(--accent); border-color: var(--border-strong); font-weight: 700; }
.play-strip-all { background: transparent; }

/* 판·주제를 고르는 칩 */
.play-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.1rem; }
.play-chips button {
  font: inherit; font-size: var(--font-size-2xs); min-height: 38px; padding: 0 0.85rem; cursor: pointer;
  background: var(--bg-primary); color: var(--text-secondary);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
}
.play-chips button:hover { border-color: var(--border-hover); color: var(--text-primary); }
.play-chips button[aria-pressed='true'] { background: var(--accent-dim); color: var(--accent); border-color: var(--border-strong); font-weight: 700; }

.play-card { background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-xl); }

button.play-go, .play-go {
  font: inherit; font-size: var(--font-size-xs); min-height: 44px; padding: 0 1.1rem; cursor: pointer;
  background: var(--accent); color: var(--bg-void); border: 0; border-radius: var(--radius-lg); font-weight: 700;
}
button.play-ghost {
  font: inherit; font-size: var(--font-size-xs); min-height: 44px; padding: 0 1.1rem; cursor: pointer;
  background: transparent; color: var(--text-secondary);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
}
button.play-ghost:hover { color: var(--text-primary); border-color: var(--border-hover); }

input[type='text'], input[type='search'] {
  font-size: 16px; /* 폰에서 눌러도 화면이 확대되지 않게 */
  padding: 0.55rem 0.7rem; min-height: 44px; min-width: 0;
  background: var(--bg-void); color: var(--text-primary);
  border: 1px solid var(--border-hover); border-radius: var(--radius-lg);
}
input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.play-ok { color: var(--success); }
.play-no { color: var(--error); }
.play-foot { margin-top: 2rem; font-size: var(--font-size-2xs); color: var(--text-tertiary); }
.play-foot a { color: var(--text-secondary); }
`;
}
