/**
 * 배경 테마가 **정말 있는지** 본다 (TASK-KL-101)
 *
 * 고르는 목록에는 여섯 개가 있었지만, 관측실 말고는 사실상 고장이었다. 원인은 한 가지다 —
 * 격자와 분위기를 한 규칙에 쌓아 두고 테마마다 **그림 목록만** 갈아 끼웠다. 크기·반복
 * 목록은 그대로 남아 층 수가 어긋났고(오로라는 화면만 한 타원이 48px 로 잘려 바둑판처럼
 * 깔렸다), 격자는 테마마다 통째로 사라졌다. 화면은 「좀 다른 배경」처럼 보여 안 잡혔다.
 *
 * 그래서 층을 갈랐다: 격자는 판때기(.app-bg), 분위기는 그 위 한 겹(::before).
 * 이 검사는 그 약속이 지켜지는지만 본다.
 *
 *  - 고르는 목록(코드)과 스타일에 적힌 테마가 **같은가**
 *  - 테마마다 분위기층(::before)에 자기 그림이 있는가
 *  - 테마가 격자층(.app-bg 본체)을 덮어쓰지 않는가 — 덮으면 격자가 사라진다
 *
 * 사용: node scripts/audit-bg-themes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'css/toolbox.css'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'src/toolbox.ts'), 'utf8');

const problems = [];

// 고르는 목록 = 코드가 정본
const listBlock = ts.slice(ts.indexOf('const BG_THEMES'), ts.indexOf('const BG_THEMES') + 600);
const ids = [...listBlock.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
if (ids.length < 2) problems.push('고르는 목록(BG_THEMES)을 못 읽었다 — 이 검사가 헛돌고 있다');

// 「미니멀」은 일부러 아무것도 안 깐다. 나머지는 제 분위기층이 있어야 한다.
const BARE = new Set(['minimal']);
// 관측실은 바닥값이라 별도 규칙 없이 기본 분위기층(::before)을 그대로 쓴다.
const USES_DEFAULT = new Set(['observatory']);

for (const id of ids) {
  const before = new RegExp(`html\\[data-bg="${id}"\\][^{]*\\.app-bg::before\\s*\\{`).test(css);
  const base = new RegExp(`html\\[data-bg="${id}"\\][^{]*\\.app-bg\\s*\\{`).test(css);

  if (!before && !USES_DEFAULT.has(id) && !BARE.has(id)) {
    problems.push(`「${id}」에 분위기층이 없다 — 고를 수는 있는데 아무 일도 안 일어난다`);
  }
  if (base && !BARE.has(id)) {
    problems.push(`「${id}」가 격자층을 덮어쓴다 — 그 테마에서는 격자가 사라진다 (::before 에 적어라)`);
  }
}

// 스타일에만 있고 목록에 없는 것 = 고를 길이 없는 테마
for (const m of css.matchAll(/html\[data-bg="([a-z-]+)"\]/g)) {
  if (!ids.includes(m[1])) problems.push(`「${m[1]}」은 스타일에만 있다 — 고를 길이 없다`);
}

if (problems.length) {
  console.error(`[audit-bg-themes] 배경 테마 ${problems.length}건`);
  [...new Set(problems)].forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[audit-bg-themes] 배경 테마 ${ids.length}개 — 전부 제 분위기층이 있고 격자를 안 덮는다`);
