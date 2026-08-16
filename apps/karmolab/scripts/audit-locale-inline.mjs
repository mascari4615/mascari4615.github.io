/**
 * audit-locale-inline.mjs — 말 판 장에 **원본 말 묶음이 두 벌** 실렸나 본다.
 *
 * ★ 왜 (2026-08-17 실측): en/ja 장은 제 말 묶음과 함께 원본(ko) 묶음을 통째로 실었다.
 *   그 자리의 뜻은 「아직 안 옮긴 열쇠가 떨어질 곳」인데, 다 옮긴 뒤에도 계속 실려서
 *   **첫 화면 167KB 중 44KB · 도구 장 240KB 중 84KB** 가 그냥 짐이었다(장 326개에 곱해진다).
 *   고친 뒤 그 자리를 지키는 것이 없으면 다음 사람이 「안전하게」 다시 통째로 싣는다.
 *
 * 재는 것은 **크기가 아니라 뜻**이다: 「그 판이 이미 가진 열쇠를 원본이 또 들고 있나」.
 * 크기로 재면 말이 늘 때마다 기준선을 만져야 하지만, 이 뜻은 말이 늘어도 안 변한다.
 *
 * 사용: node scripts/audit-locale-inline.mjs
 * 나가는 값: 0 통과 · 1 두 벌 실림 · 2 못 봤다(찍힌 장이 없다 — 통과 아님)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blog = path.resolve(root, '../blog');

/** 볼 장 — 겉 장 둘 + 도구 장 표본 둘(사람이 검색으로 들어오는 자리). */
const 볼장 = [
  'en/karmolab/index.html',
  'ja/karmolab/index.html',
  'en/karmolab/t/loan/index.html',
  'ja/karmolab/t/loan/index.html',
];

/** 그 장이 실은 말 묶음을 꺼낸다. 없으면 null. */
export function 실린묶음(html) {
  const m = html.match(/window\.__KARMO_I18N=(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** 그 판이 이미 가진 열쇠를 원본이 또 들고 있나 — 몇 개인가. */
export function 겹친열쇠수(묶음, 판) {
  const 내것 = 묶음[판] || {};
  const 원본 = 묶음.ko || {};
  let n = 0;
  for (const ns of Object.keys(원본)) {
    for (const k of Object.keys(원본[ns] || {})) {
      if (typeof 내것[ns]?.[k] === 'string') n += 1;
    }
  }
  return n;
}

/** 도구 한 장이 미리 실어도 되는 묶음 — 그 밖은 목록 화면 몫이다(스스로 늦게 받아 온다). */
const 허용묶음 = new Set(['site', 'shell', 'widgets', 'toolpage']);

/** 장 주소에서 도구 id 를 뽑는다 — 제 도구의 말 묶음은 실어도 된다(열 때 기다림 0). */
const 도구id = (rel) => (rel.match(/\/t\/([^/]+)\//) || [])[1] || '';

const 걸린것 = [];
let 본장 = 0;
for (const rel of 볼장) {
  const p = path.join(blog, rel);
  if (!fs.existsSync(p)) continue;
  본장 += 1;
  const html = fs.readFileSync(p, 'utf8');
  const 묶음 = 실린묶음(html);
  if (!묶음) continue;
  const 판 = rel.slice(0, 2);
  const 겹침 = 겹친열쇠수(묶음, 판);
  if (겹침 > 0) 걸린것.push(`${rel} — 이미 옮긴 열쇠 ${겹침}개를 원본으로 또 싣는다`);

  /* ★ **도구 한 장에 목록 화면의 짐을 싣지 마라** (2026-08-17 실측: `tools` 45.6KB · `widgets-desc` 27.6KB
     를 빼서 240KB → 108KB). 둘 다 첫 그림에 안 쓰이고, 필요한 화면이 스스로 늦게 받아 온다.
     크기 대신 **무엇을 싣나**를 지킨다 — 말이 늘어도 이 목록은 안 변한다. */
  if (rel.includes('/t/')) {
    const 실은것 = Object.keys(묶음[판] || {});
    const 넘친것 = 실은것.filter((ns) => !허용묶음.has(ns) && ns !== 도구id(rel));
    if (넘친것.length) 걸린것.push(`${rel} — 첫 그림에 안 쓰는 묶음을 싣는다: ${넘친것.join(', ')}`);
  }
}

if (본장 === 0) {
  console.log('[말판 무게] 못 봤다 — 찍힌 말 판 장이 없다 (배포가 만든다). 통과로 안 센다.');
  process.exit(2);
}
if (걸린것.length) {
  console.error(`[말판 무게] FAIL — 첫 그림에 안 쓰는 짐을 진 장 ${걸린것.length}개:`);
  for (const one of 걸린것) console.error(`  - ${one}`);
  console.error('  · 원본이 두 벌이면: 그 판에 없는 열쇠만 실어라 — scripts/lib/locale-page.mjs.');
  console.error('  · 안 쓰는 묶음이면: 도구 장의 묶음 목록에서 빼라 — scripts/gen-tool-pages-locale.mjs.');
  process.exit(1);
}
console.log(`[말판 무게] 말 판 장 ${본장}개 — 원본 묶음이 겹쳐 실린 곳 없음`);
