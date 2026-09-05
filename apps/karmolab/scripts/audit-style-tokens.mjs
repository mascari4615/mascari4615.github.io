#!/usr/bin/env node
/**
 * 크기 값을 토큰 대신 직접 적은 자리 세기 (change.karmolab-style-tokens, 2026-08-30)
 *
 * 왜: 같은 화면에 둥글기 여섯 종(2~18px), 글자 크기 열두 종(9~20px) 혼재
 *   (실측 2026-08-30: 위젯 CSS 둥글기 494, 글자 776). 만든 사람이 여럿인 인상,
 *   톤 변경에 수백 곳 손질 필요. 정본은 `css/toolbox.css` 의 `:root` 토큰
 *
 * 세는 것 둘. 크기와 색
 *   크기: `font-size: <숫자>px`, `border-radius: <숫자>px` (shorthand 안 값도 하나씩)
 *   색: `color|background|border|box-shadow|outline|fill|stroke: ... #hex | rgb() | hsl()`
 *     (change.karmolab-ui-kit, 2026-08-31. 실측 733곳. 정본은 스킨 토큰)
 *   제외: `var(--...)`, `50%`, `calc(`, `${...}`, 주석 안
 *   캔버스 그리기(`ctx.font = '12px ...'`)는 CSS 아님. 안 걸림
 *
 * 래칫: 파일마다 기준선. 어느 파일이든 기준선보다 늘면 빨강. 새 파일은 기준선 0
 *   병렬 세션이 다른 파일을 손대도 서로 안 걸림
 *
 * exit 0 안 늘음, 1 늘음, 2 못 잼
 *   --bless: 지금 값을 기준선으로 (줄인 뒤에만). 두 축을 함께 덮어씀
 *   --bless-px, --bless-color: 한 축만. 남이 늘린 축을 같이 받아 적지 않으려고
 *   --list [파일 일부]: 자리 목록
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE = path.join(root, 'data', 'style-tokens-baseline.json');
const SKIP = new Set(['node_modules', 'tmp', '.git', 'dist', 'vendor']);
const ROOTS = ['src', 'css'];
const EXTRA = ['index.html'];

function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP.has(e.name) === false) walk(p, fn); }
    else if (/\.(ts|css|html)$/.test(e.name) && /\.[0-9a-f]{8}\.css$/.test(e.name) === false
      /* 파생은 안 센다. 정본에서 센 것을 두 번 세게 된다 (tools.min.css 는 tools.css 에서 설명만 뺀 벌, 2026-09-05) */
      && /shell-(critical|deferred)\.css$|tools\.min\.css$/.test(e.name) === false) fn(p);
  }
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** 한 파일의 직접 값 자리 [{prop, value, line}] */
export function findRaw(src) {
  const out = [];
  const text = stripComments(src);
  const re = /\b(font-size|border-radius)\s*:\s*([^;{}"'`]*)/g;
  for (const m of text.matchAll(re)) {
    const prop = m[1];
    const val = m[2].trim();
    if (!val || /var\(|calc\(|clamp\(|min\(|max\(|\$\{|inherit|initial|unset|em\b|rem\b|%/.test(val) && !/\bpx\b/.test(val)) continue;
    const pxs = val.match(/(?<![\w.-])\d*\.?\d+px\b/g);
    if (!pxs) continue;
    if (/\$\{/.test(val)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    for (const px of pxs) out.push({ prop, value: px, line });
  }
  return out;
}

/** 한 파일의 직접 색 자리 [{prop, value, line}]. 칠은 스킨 토큰이 정한다 */
export function findRawColors(src) {
  const out = [];
  const text = stripComments(src);
  /* CSS 문법의 자리만. 캔버스(`ctx.fillStyle = '#fff'`)와 SVG 속성(`fill="#fff"`)은 CSS 가 아니다 */
  const re = /(?<![\w-])(color|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|box-shadow|outline|outline-color|fill|stroke|text-shadow|caret-color|accent-color)\s*:\s*([^;{}"'`]*)/g;
  for (const m of text.matchAll(re)) {
    const prop = m[1];
    const val = m[2].trim();
    if (!val || /\$\{/.test(val)) continue;
    const lits = val.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g);
    if (!lits) continue;
    const line = text.slice(0, m.index).split('\n').length;
    for (const lit of lits) out.push({ prop, value: lit, line });
  }
  return out;
}

const counts = new Map();
const detail = new Map();
const colorCounts = new Map();
const colorDetail = new Map();
const scan = (p) => {
  const rel = path.relative(root, p).split(path.sep).join('/');
  const src = fs.readFileSync(p, 'utf8');
  const raws = findRaw(src);
  if (raws.length) { counts.set(rel, raws.length); detail.set(rel, raws); }
  const cols = findRawColors(src);
  if (cols.length) { colorCounts.set(rel, cols.length); colorDetail.set(rel, cols); }
};
for (const r of ROOTS) { const d = path.join(root, r); if (fs.existsSync(d)) walk(d, scan); }
for (const f of EXTRA) { const p = path.join(root, f); if (fs.existsSync(p)) scan(p); }

const total = [...counts.values()].reduce((a, b) => a + b, 0);
const now = Object.fromEntries([...counts.entries()].sort());
const colorTotal = [...colorCounts.values()].reduce((a, b) => a + b, 0);
const colorNow = Object.fromEntries([...colorCounts.entries()].sort());

const listIdx = process.argv.indexOf('--list');
if (listIdx >= 0) {
  const needle = process.argv[listIdx + 1] || '';
  const wantColor = process.argv.includes('--color');
  for (const [f, raws] of [...(wantColor ? colorDetail : detail).entries()].sort()) {
    if (needle && f.includes(needle) === false) continue;
    for (const r of raws) console.log(`${f}:${r.line}  ${r.prop}: ${r.value}`);
  }
  console.log(wantColor
    ? `[style-tokens] 직접 색 ${colorTotal}개, 파일 ${colorCounts.size}개`
    : `[style-tokens] 직접 값 ${total}개, 파일 ${counts.size}개`);
  process.exit(0);
}

/* 축을 갈라 조인다 (2026-09-01). 통짜 --bless 는 두 축을 함께 덮어써서, 크기 부채를 줄인 사람이
   남이 늘린 색 부채까지 조용히 받아 적음. 그럴 뻔한 자리 (arcade.ts 456 -> 465) */
const blessAll = process.argv.includes('--bless');
const blessPx = blessAll || process.argv.includes('--bless-px');
const blessColor = blessAll || process.argv.includes('--bless-color');
if (blessPx || blessColor) {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { /* 첫 판 */ }
  const next = {
    total: blessPx ? total : (prev.total ?? total),
    files: blessPx ? now : (prev.files ?? now),
    colorTotal: blessColor ? colorTotal : (prev.colorTotal ?? colorTotal),
    colorFiles: blessColor ? colorNow : (prev.colorFiles ?? colorNow),
  };
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n', 'utf8');
  const axes = [blessPx ? '크기' : null, blessColor ? '색' : null].filter(Boolean);
  console.log(`[style-tokens] 기준선을 다시 적었다. 직접 값 ${next.total}개, 직접 색 ${next.colorTotal}개 (조인 축: ${axes.join(", ")})`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[style-tokens] 못 쟀다. 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const grew = [];
for (const [f, n] of Object.entries(now)) {
  const b = base.files[f] || 0;
  if (n > b) grew.push({ f, b, n });
}
/* 색 기준선이 없는 판에서는 색을 안 잰다. --bless 가 적어 준다 */
const colorGrew = [];
if (base.colorFiles) {
  for (const [f, n] of Object.entries(colorNow)) {
    const b = base.colorFiles[f] || 0;
    if (n > b) colorGrew.push({ f, b, n });
  }
}
if (colorGrew.length) {
  console.error(`[style-tokens] **색을 직접 적은 자리가 늘었다** ${colorGrew.length}파일:`);
  for (const g of colorGrew) console.error(`  - ${g.f}  ${g.b} → ${g.n}`);
  console.error('  칠은 스킨 토큰이 정한다. var(--accent), var(--text-primary), var(--bg-secondary) 등');
  console.error('  목록: npm run audit:style-tokens -- --list <파일> --color');
  process.exit(1);
}
if (grew.length) {
  console.error(`[style-tokens] **크기 값을 직접 적은 자리가 늘었다** ${grew.length}파일:`);
  for (const g of grew) console.error(`  - ${g.f}  ${g.b} → ${g.n}`);
  console.error('  font-size 와 border-radius 는 var(--font-size-*), var(--radius-*) 로. 목록: npm run audit:style-tokens -- --list <파일>');
  console.error('  정본: css/toolbox.css :root. 예외가 정말 필요하면 npm run audit:style-tokens -- --bless');
  process.exit(1);
}
if (total < base.total || (base.colorTotal != null && colorTotal < base.colorTotal)) {
  console.log(`[style-tokens] 줄었다 ${base.total} → ${total}개. 기준선을 다시 적어라: npm run audit:style-tokens -- --bless`);
  process.exit(0);
}
console.log(`[style-tokens] 안 늘었다 (남은 직접 값 ${total}개, 직접 색 ${colorTotal}개)`);
