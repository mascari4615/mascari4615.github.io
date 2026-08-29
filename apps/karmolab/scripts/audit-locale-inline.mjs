/**
 * audit-locale-inline.mjs. 말 판 장에 **원본 말 묶음이 두 벌** 실렸나 본다.
 *
 * ★ 왜 (2026-08-17 실측): en/ja 장은 제 말 묶음과 함께 원본(ko) 묶음을 통째로 실었다.
 *   그 자리의 뜻은 아직 안 옮긴 열쇠가 떨어질 곳인데, 다 옮긴 뒤에도 계속 실려서
 *   **첫 화면 167KB 중 44KB, 도구 장 240KB 중 84KB** 가 그냥 짐이었다(장 326개에 곱해진다).
 *   고친 뒤 그 자리를 지키는 것이 없으면 다음 사람이 안전하게 다시 통째로 싣는다.
 *
 * 재는 것은 **크기가 아니라 뜻**이다: 그 판이 이미 가진 열쇠를 원본이 또 들고 있나.
 * 크기로 재면 말이 늘 때마다 기준선을 만져야 하지만, 이 뜻은 말이 늘어도 안 변한다.
 *
 * 사용: node scripts/audit-locale-inline.mjs
 * 나가는 값: 0 통과, 1 두 벌 실림, 2 못 봤다(찍힌 장이 없다. 통과 아님)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blog = path.resolve(root, '../blog');

/** 볼 장. 겉 장 둘 + 도구 장 표본 둘(사람이 검색으로 들어오는 자리). */
const pagesToCheck = [
  'en/index.html',
  'ja/index.html',
  'en/t/loan/index.html',
  'ja/t/loan/index.html',
];

/** 그 장이 실은 말 묶음을 꺼낸다. 없으면 null. */
export function inlinedBundles(html) {
  const m = html.match(/window\.__KARMO_I18N=(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** 그 판이 이미 가진 열쇠를 원본이 또 들고 있나. 몇 개인가. */
export function duplicatedKeyCount(bundles, locale) {
  const localeBundle = bundles[locale] || {};
  const koBundle = bundles.ko || {};
  let n = 0;
  for (const ns of Object.keys(koBundle)) {
    for (const k of Object.keys(koBundle[ns] || {})) {
      if (typeof localeBundle[ns]?.[k] === 'string') n += 1;
    }
  }
  return n;
}

/** 도구 한 장이 미리 실어도 되는 묶음. 그 밖은 목록 화면 몫이다(스스로 늦게 받아 온다). */
const allowedNamespaces = new Set(['site', 'shell', 'widgets', 'toolpage']);

/** 장 주소에서 도구 id 를 뽑는다. 제 도구의 말 묶음은 실어도 된다(열 때 기다림 0). */
const toolIdFromPath = (rel) => (rel.match(/\/t\/([^/]+)\//) || [])[1] || '';

const problems = [];
let pagesSeen = 0;
for (const rel of pagesToCheck) {
  const p = path.join(blog, rel);
  if (!fs.existsSync(p)) continue;
  pagesSeen += 1;
  const html = fs.readFileSync(p, 'utf8');
  const bundles = inlinedBundles(html);
  if (!bundles) continue;
  const locale = rel.slice(0, 2);
  const duplicated = duplicatedKeyCount(bundles, locale);
  if (duplicated > 0) problems.push(`${rel}. 이미 옮긴 열쇠 ${duplicated}개를 원본으로 또 싣는다`);

  /* ★ **도구 한 장에 목록 화면의 짐을 싣지 마라** (2026-08-17 실측: `tools` 45.6KB, `widgets-desc` 27.6KB
     를 빼서 240KB → 108KB). 둘 다 첫 그림에 안 쓰이고, 필요한 화면이 스스로 늦게 받아 온다.
     크기 대신 **무엇을 싣나**를 지킨다. 말이 늘어도 이 목록은 안 변한다. */
  if (rel.includes('/t/')) {
    const inlinedNamespaces = Object.keys(bundles[locale] || {});
    const extraNamespaces = inlinedNamespaces.filter((ns) => !allowedNamespaces.has(ns) && ns !== toolIdFromPath(rel));
    if (extraNamespaces.length) problems.push(`${rel}. 첫 그림에 안 쓰는 묶음을 싣는다: ${extraNamespaces.join(', ')}`);
  }
}

if (pagesSeen === 0) {
  console.log('[말판 무게] 못 봤다. 찍힌 말 판 장이 없다 (배포가 만든다). 통과로 안 센다.');
  process.exit(2);
}
if (problems.length) {
  console.error(`[말판 무게] FAIL. 첫 그림에 안 쓰는 짐을 진 장 ${problems.length}개:`);
  for (const one of problems) console.error(`  - ${one}`);
  console.error(' , 원본이 두 벌이면: 그 판에 없는 열쇠만 실어라. scripts/lib/locale-page.mjs.');
  console.error(' , 안 쓰는 묶음이면: 도구 장의 묶음 목록에서 빼라. scripts/gen-tool-pages-locale.mjs.');
  process.exit(1);
}
console.log(`[말판 무게] 말 판 장 ${pagesSeen}개. 원본 묶음이 겹쳐 실린 곳 없음`);
