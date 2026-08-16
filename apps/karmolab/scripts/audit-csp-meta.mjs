#!/usr/bin/env node
/**
 * 나가는 화면마다 **보안 한 줄**이 박혔는지 (2026-08-16)
 *
 * GitHub Pages 는 헤더를 못 붙인다. 그래서 `<meta http-equiv="Content-Security-Policy">` 가
 * 유일한 자리인데, 머리(head)를 조립하는 생성기가 여럿이라 **한 곳에 넣으면 나머지가 빠진다.**
 * 문구는 `lib/head-security.mjs` 한 벌이고, 이 검사는 「빠진 화면이 있나」만 본다.
 *
 * exit 0 = 전부 있음 · 1 = 빠진 화면 있음 · 2 = 볼 화면이 없다(못 쟀다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_CONTENT } from './lib/head-security.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKIP = new Set(['node_modules', 'tmp', 'dist', '.git']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
}

const files = [];
walk(root, files);
if (files.length === 0) {
  console.error('[csp-meta] 못 쟀다 — 볼 .html 이 없다.');
  process.exit(2);
}

const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  /* 넘김: 곧바로 다른 데로 보내는 안내판(refresh)은 내용이 없다. */
  if (/<meta\s+http-equiv="refresh"/i.test(src)) continue;
  if (src.includes(CSP_CONTENT) === false) missing.push(path.relative(root, f).split(path.sep).join('/'));
}

if (missing.length > 0) {
  console.error(`[csp-meta] 보안 한 줄이 빠진 화면 ${missing.length}개:`);
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  if (missing.length > 20) console.error(`  … 그 외 ${missing.length - 20}개`);
  console.error('  넣기: lib/head-security.mjs 의 CSP_META 를 그 화면 머리에 (문구를 손으로 적지 X)');
  process.exit(1);
}
console.log(`[csp-meta] 화면 ${files.length}개 — 전부 보안 한 줄 있음.`);
