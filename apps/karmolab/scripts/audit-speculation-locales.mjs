/**
 * audit-speculation-locales.mjs — 미리읽기 규칙이 **말 판마다** 있나 본다.
 *
 * ★ 왜 (2026-08-17 실측): 셸에 speculationrules 를 한 번 박아 두면 생성기가 그것을 300여 장에
 *   그대로 복사한다. 그런데 규칙은 `/karmolab/t/*` 하나였고, 영어 장의 링크는
 *   `/en/karmolab/t/...` 다. 규칙은 주소 맨 앞부터 맞춰 보므로 **하나도 안 맞았다** —
 *   260여 장이 태그만 달고 이득은 0. 태그가 있으니 아무도 이상하다고 안 했다.
 *   말 판을 새로 늘릴 때도 같은 일이 조용히 다시 난다. 그래서 판 목록(locales.mjs)과 대조한다.
 *
 * 사용: node scripts/audit-speculation-locales.mjs
 * 나가는 값: 0 통과 · 1 빠진 판 있음 · 2 못 봤다(셸이나 규칙 덩어리가 없다 — 통과 아님)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEFAULT_LOCALE, localizedPath } from './lib/locales.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = path.join(root, 'index.html');

if (!fs.existsSync(shell)) {
  console.log(`[미리읽기-판 검사] 못 봤다 — 셸이 없다: ${shell} (통과로 안 센다)`);
  process.exit(2);
}
const html = fs.readFileSync(shell, 'utf8');
const block = html.match(/<script type="speculationrules">([\s\S]*?)<\/script>/);
if (!block) {
  console.log('[미리읽기-판 검사] 못 봤다 — 셸에 speculationrules 덩어리가 없다 (통과로 안 센다)');
  process.exit(2);
}
let rules;
try {
  rules = JSON.parse(block[1]);
} catch (e) {
  console.error(`[미리읽기-판 검사] FAIL — 규칙이 JSON 이 아니다: ${e.message}`);
  process.exit(1);
}
/** 이 규칙 묶음이 그 주소 꼴을 **미리 그리나** — `not` 안에 적힌 것은 빼는 것이니 안 센다. */
function covers(bundle, urlPattern) {
  const list = Array.isArray(bundle?.prerender) ? bundle.prerender : [];
  const verdictOf = (where) => {
    if (!where || typeof where !== 'object') return false;
    if (typeof where.href_matches === 'string') return where.href_matches === urlPattern;
    if (Array.isArray(where.and)) return where.and.some(verdictOf);
    if (Array.isArray(where.or)) return where.or.some(verdictOf);
    return false;   // not 안쪽은 「빼는 것」이라 안 센다
  };
  return list.some((r) => verdictOf(r?.where));
}

// 각 판의 도구 목록 주소가 규칙에 적혀 있나. (localizedPath 가 판마다의 앞자리를 안다.)
const missing = [];
for (const l of LOCALES) {
  const hub = localizedPath('/karmolab/t/', l.code, DEFAULT_LOCALE);
  /* ★ **글자로 찾으면 「빼는 규칙」까지 있는 것으로 센다** (2026-08-17 실측, 내 검사의 구멍).
     규칙은 허브를 `not` 안에도 적는다 — 「도구 장은 미리 그리되 허브 자체는 빼라」는 뜻이다.
     그런데 글자만 훑으면 그 `not` 이 「허브 규칙이 있다」로 읽혔다. 실제로 허브 규칙이 통째로
     사라진 판에서 이 검사가 초록이었다. 규칙을 **JSON 으로 펴서** 진짜 대상만 센다. */
  if (!covers(rules, `${hub}*`)) missing.push(`${l.code} → ${hub}* (도구 장)`);
}
if (missing.length > 0) {
  console.error(`[미리읽기-판 검사] FAIL — 미리읽기 규칙이 없는 말 판 ${missing.length}개:`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error('  그 판의 장들은 규칙 태그를 달고도 아무 일이 안 난다(주소 앞자리가 안 맞는다).');
  console.error(`  고칠 곳: apps/karmolab/index.html 의 <script type="speculationrules">`);
  process.exit(1);
}
console.log(`[미리읽기-판 검사] 말 판 ${LOCALES.length}개 전부 규칙 있음 — ${LOCALES.map((l) => l.code).join(', ')}`);
