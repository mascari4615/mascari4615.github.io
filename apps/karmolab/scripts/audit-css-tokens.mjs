#!/usr/bin/env node
/**
 * **없는 토큰을 부르는 자리**를 잡는다 (2026-08-16)
 *
 * ★ 왜: CSS 는 이름이 틀려도 에러를 안 낸다. `var(--bg-elev, #1b1b20)` 처럼 예비값이 있으면
 *   **조용히 그 예비값을 쓴다.** 그래서 「테마를 따른다」고 적어 놓고 한 번도 안 따를 수 있다.
 *   2026-08-16 실측: 언어 메뉴가 그렇게 **양쪽 판에서 늘 어두웠고**(토큰 이름 4개가 틀림),
 *   도구 아이콘 속 네모는 늘 검정이었다. 어느 검사도 못 잡았다 — CI 의 접근성 검사가
 *   「밝은 판 글자색 위에 어두운 바탕」이라는 이상한 조합을 찍어 준 뒤에야 알았다.
 *
 * 세는 법: `--이름:` 로 값을 주는 자리와 `setProperty('--이름'` 를 전부 모아 「있는 것」으로 치고,
 *   `var(--이름)` 중 그 목록에 없는 것을 센다. JS 가 만들어 넣는 임시 변수(`--x`·`--n` 등)도
 *   섞이므로 **한 번에 0 을 요구하지 않는다** — 기준선(래칫)으로 켜서 늘면 빨강.
 *
 * exit 0 = 안 늘었다 · 1 = 늘었다 · 2 = 못 쟀다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE = path.join(root, 'data', 'css-token-baseline.json');
const SKIP = new Set(['node_modules', 'tmp', '.git', 'dist']);

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP.has(e.name) === false) walk(p, fn); }
    /* 해시 붙은 사본(`tools.42ccc66d.css`)은 **캐시용 생성물**이고 .gitignore 대상이다.
       소스가 아니라 옛 판이라 여기서 세면 「이미 고친 것」이 계속 빚으로 남는다(실측). */
    else if (/\.(ts|css|html)$/.test(e.name) && /\.[0-9a-f]{8}\.css$/.test(e.name) === false) fn(p);
  }
}

const roots = ['src', 'css'].map((r) => path.join(root, r)).filter((d) => fs.existsSync(d));
if (roots.length === 0) {
  console.error('[css-tokens] 못 쟀다 — src/css 가 없다.');
  process.exit(2);
}

const defined = new Set();
const collect = (p) => {
  const s = fs.readFileSync(p, 'utf8');
  for (const m of s.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of s.matchAll(/setProperty\(\s*['"`](--[a-zA-Z0-9-]+)/g)) defined.add(m[1]);
};
for (const r of roots) walk(r, collect);
const indexHtml = path.join(root, 'index.html');
if (fs.existsSync(indexHtml)) collect(indexHtml);

/* 주석 안의 `var(--px)` 는 **설명**이지 코드가 아니다 — 실제로 남은 4종이 전부
   「이렇게 쓰지 마라」고 적어 둔 주석이었다(2026-08-16). 세기 전에 주석을 걷어낸다.
   문자열 안의 `//` 를 지우는 실수를 피하려고 줄 주석은 **줄 맨 앞/공백 뒤**만 본다. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

const missing = new Map();
const scan = (p) => {
  const s = stripComments(fs.readFileSync(p, 'utf8'));
  for (const m of s.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
    if (defined.has(m[1])) continue;
    if (missing.has(m[1]) === false) missing.set(m[1], []);
    missing.get(m[1]).push(path.relative(root, p).split(path.sep).join('/'));
  }
};
for (const r of roots) walk(r, scan);
const names = [...missing.keys()].sort();

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(names, null, 1) + '\n', 'utf8');
  console.log(`[css-tokens] 기준선을 다시 적었다 — 없는 토큰 ${names.length}종`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[css-tokens] 못 쟀다 — 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const fresh = names.filter((n) => base.includes(n) === false);
if (fresh.length > 0) {
  console.error(`[css-tokens] **없는 토큰을 부르는 자리가 늘었다** ${fresh.length}종:`);
  for (const n of fresh) console.error(`  - ${n}  ← ${[...new Set(missing.get(n))].slice(0, 2).join(', ')}`);
  console.error('  이름을 진짜 토큰으로 고쳐라. 예비값(var(--x, #hex))은 남기지 마라 — 다음에도 조용히 이긴다.');
  console.error('  JS 가 넣는 임시 변수라 정상이면: npm run audit:css-tokens -- --bless');
  process.exit(1);
}
const fixed = base.filter((n) => names.includes(n) === false);
if (fixed.length > 0) {
  console.log(`[css-tokens] 줄었다 ${base.length} → ${names.length}종 — 기준선을 다시 적어라: npm run audit:css-tokens -- --bless`);
  process.exit(0);
}
console.log(`[css-tokens] 안 늘었다 (남은 빚 ${names.length}종)`);
