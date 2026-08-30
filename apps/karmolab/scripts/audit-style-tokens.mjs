#!/usr/bin/env node
/**
 * 크기 값을 토큰 대신 직접 적은 자리 세기 (change.karmolab-style-tokens, 2026-08-30)
 *
 * 왜: 같은 화면에 둥글기 여섯 종(2~18px), 글자 크기 열두 종(9~20px) 혼재
 *   (실측 2026-08-30: 위젯 CSS 둥글기 494, 글자 776). 만든 사람이 여럿인 인상,
 *   톤 변경에 수백 곳 손질 필요. 정본은 `css/toolbox.css` 의 `:root` 토큰
 *
 * 세는 것: `font-size: <숫자>px`, `border-radius: <숫자>px` (shorthand 안 값도 하나씩)
 *   제외: `var(--...)`, `50%`, `calc(`, `${...}`, 주석 안
 *   캔버스 그리기(`ctx.font = '12px ...'`)는 CSS 아님. 안 걸림
 *
 * 래칫: 파일마다 기준선. 어느 파일이든 기준선보다 늘면 빨강. 새 파일은 기준선 0
 *   병렬 세션이 다른 파일을 손대도 서로 안 걸림
 *
 * exit 0 안 늘음, 1 늘음, 2 못 잼
 *   --bless: 지금 값을 기준선으로 (줄인 뒤에만)
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
      && /shell-(critical|deferred)\.css$/.test(e.name) === false) fn(p);
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

const counts = new Map();
const detail = new Map();
const scan = (p) => {
  const rel = path.relative(root, p).split(path.sep).join('/');
  const raws = findRaw(fs.readFileSync(p, 'utf8'));
  if (raws.length) { counts.set(rel, raws.length); detail.set(rel, raws); }
};
for (const r of ROOTS) { const d = path.join(root, r); if (fs.existsSync(d)) walk(d, scan); }
for (const f of EXTRA) { const p = path.join(root, f); if (fs.existsSync(p)) scan(p); }

const total = [...counts.values()].reduce((a, b) => a + b, 0);
const now = Object.fromEntries([...counts.entries()].sort());

const listIdx = process.argv.indexOf('--list');
if (listIdx >= 0) {
  const needle = process.argv[listIdx + 1] || '';
  for (const [f, raws] of [...detail.entries()].sort()) {
    if (needle && f.includes(needle) === false) continue;
    for (const r of raws) console.log(`${f}:${r.line}  ${r.prop}: ${r.value}`);
  }
  console.log(`[style-tokens] 직접 값 ${total}개, 파일 ${counts.size}개`);
  process.exit(0);
}

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ total, files: now }, null, 1) + '\n', 'utf8');
  console.log(`[style-tokens] 기준선을 다시 적었다. 직접 값 ${total}개, 파일 ${counts.size}개`);
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
if (grew.length) {
  console.error(`[style-tokens] **크기 값을 직접 적은 자리가 늘었다** ${grew.length}파일:`);
  for (const g of grew) console.error(`  - ${g.f}  ${g.b} → ${g.n}`);
  console.error('  font-size 와 border-radius 는 var(--font-size-*), var(--radius-*) 로. 목록: npm run audit:style-tokens -- --list <파일>');
  console.error('  정본: css/toolbox.css :root. 예외가 정말 필요하면 npm run audit:style-tokens -- --bless');
  process.exit(1);
}
if (total < base.total) {
  console.log(`[style-tokens] 줄었다 ${base.total} → ${total}개. 기준선을 다시 적어라: npm run audit:style-tokens -- --bless`);
  process.exit(0);
}
console.log(`[style-tokens] 안 늘었다 (남은 직접 값 ${total}개, 파일 ${counts.size}개)`);
