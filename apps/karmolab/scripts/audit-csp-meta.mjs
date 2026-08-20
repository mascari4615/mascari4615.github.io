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

/* ★ **정말 나가는 장을 보려면 지어진 자리를 봐야 한다** (2026-08-16).
   여기는 `apps/karmolab` 만 훑는다 — 사람이 검색으로 처음 밟는 도구 상세 장들은
   찍혀서 다른 나무로 간다. 그래서 폴더를 인자로 받는다:
     node scripts/audit-csp-meta.mjs <지어진 폴더>
   배포에서 사이트를 지은 **직후** 그 폴더로 한 번 더 부른다(사이트맵 검사와 같은 자리).
   저장소 안의 `apps/blog/karmolab/**` 사본을 훑지 않는 이유: 그건 배포 때 다시 찍히는
   **낡은 사본**이라, 여기서 보면 없는 병을 17건 만들어 낸다(실측 — 실사이트는 전부 멀쩡했다). */
/* 폴더를 **여럿** 받는다 — 지어진 사이트에서 우리 앱이 사는 자리가 둘이다
   (`/karmolab/**` 찍힌 장 · `/apps/karmolab/**` 앱 알맹이). */
const targets = (process.argv.length > 2 ? process.argv.slice(2) : [root]).map((d) => path.resolve(d));
const 없는것 = targets.filter((d) => fs.existsSync(d) === false);
if (없는것.length > 0) {
  console.error(`[csp-meta] CANNOT-RUN: 볼 폴더가 없다 — ${없는것.join(', ')}`);
  process.exit(2);
}
const files = [];
for (const t of targets) walk(t, files);

const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  /* 넘김: 곧바로 다른 데로 보내는 안내판(refresh)은 내용이 없다. */
  if (/<meta\s+http-equiv="refresh"/i.test(src)) continue;
  /* ★ **글자로 훑으면 「말한 것」과 「단 것」이 안 갈린다** (2026-08-17, 옆 검사에서 같은 구멍을 봤다).
     이 저장소에는 CSP 를 **설명하는 도구 장**이 있다(`/t/csp/`) — 거기 본문이나 주석에 같은 글자가
     들어가면 실제 `<meta>` 가 없어도 통과한다. 안전 한 줄을 「있다」고 세는 검사가 그러면 안 된다.
     진짜 `<meta http-equiv="Content-Security-Policy" … content="…">` 를 찾아 그 안을 견준다. */
  const sweet = [...src.matchAll(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi)]
    /* 값 안에 홑따옴표가 있다(`'none'`) — **연 따옴표와 같은 것으로 닫히는 데까지** 읽어야 한다.
       `[^"']*` 로 읽으면 `object-src ` 에서 잘려 멀쩡한 장이 「빠졌다」로 잡힌다(방금 6장). */
    .map((m) => (m[0].match(/content=("|')([\s\S]*?)\1/i) || [])[2] || '');
  if (!sweet.some((one) => one.includes(CSP_CONTENT))) {
    missing.push(path.relative(targets[0], f).split(path.sep).join('/'));
  }
}

if (missing.length > 0) {
  console.error(`[csp-meta] 보안 한 줄이 빠진 화면 ${missing.length}개:`);
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  if (missing.length > 20) console.error(`  … 그 외 ${missing.length - 20}개`);
  console.error('  넣기: lib/head-security.mjs 의 CSP_META 를 그 화면 머리에 (문구를 손으로 적지 X)');
  process.exit(1);
}
console.log(`[csp-meta] 화면 ${files.length}개 — 전부 보안 한 줄 있음.`);
