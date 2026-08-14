/**
 * 검사 묶음이 **실제로 도는지** 본다 (이름만 있고 안 도는 것 잡기).
 *
 * 왜 (2026-08-14 실측, 한 판에 두 번 데였다):
 *   ① `package.json` 의 `gates` 가 옛 모양(한 줄에 이름 120개)으로 되돌아가 있었다. 정본은
 *      `data/gate-list.json`(135개)인데 한 줄짜리가 이기면서 **목록에만 있는 15개가 아무 데서도
 *      안 돌았다.** 초록은 그대로였다 — 안 도는 검사는 조용하다.
 *   ② 목록에 이름은 있는데 `package.json` 에 스크립트가 없는 것이 여섯 있었다. `npm run <없는 이름>`
 *      은 그냥 죽으므로 묶음이 거기서 멈춘다.
 *
 * 즉 이 감사기가 지키는 것은 「검사가 초록인가」가 아니라 **「검사가 도는 자리에 있는가」**다.
 *
 * 무엇을 보나:
 *   ⓐ `gates` 가 `--from data/gate-list.json` 으로 목록 파일을 읽는가 (한 줄 나열로 되돌아가면 빨강)
 *   ⓑ 목록의 모든 이름이 `package.json` 에 스크립트로 있는가
 *   ⓒ 목록 안에 같은 이름이 두 번 들어 있지 않은가
 *
 * 기준선이 없다 — 「지금 것은 봐준다」가 아니라 **짝이 맞아야 한다**라서다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(appRoot, 'package.json');
const LIST = join(appRoot, 'data/gate-list.json');

if (!existsSync(PKG) || !existsSync(LIST)) {
  console.error('[gate-list] CANNOT-RUN: package.json 이나 data/gate-list.json 이 없다.');
  console.error('[gate-list]   이건 「어긋난 데 없음」이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const raw = JSON.parse(readFileSync(LIST, 'utf8'));
const names = raw.목록 ?? raw.list ?? raw;
if (!Array.isArray(names) || names.length < 50) {
  console.error(`[gate-list] CANNOT-RUN: 목록에서 이름을 ${Array.isArray(names) ? names.length : 0}개만 읽었다 — 형식이 바뀌었는지 확인할 것.`);
  process.exit(2);
}

const problems = [];

const gates = pkg.scripts?.gates ?? '';
if (!gates.includes('--from') || !gates.includes('data/gate-list.json')) {
  problems.push(
    `\`gates\` 가 목록 파일을 안 읽는다 — 지금: ${gates || '(없음)'}\n` +
      '        → `node scripts/run-gates.mjs --from data/gate-list.json` 이어야 한다.\n' +
      '          한 줄에 이름을 늘어놓으면 세션끼리 같은 줄을 고치다 승격이 조용히 사라진다.',
  );
}

const missing = names.filter((n) => !pkg.scripts?.[n]);
for (const n of missing) {
  problems.push(`「${n}」 는 목록에 있는데 npm script 가 없다 — 묶음이 그 자리에서 죽는다`);
}

const seen = new Set();
for (const n of names) {
  if (seen.has(n)) problems.push(`「${n}」 가 목록에 두 번 있다 — 두 번 돌린다`);
  seen.add(n);
}

console.log(`[gate-list] 묶음 이름 ${names.length}개 · 스크립트 없는 이름 ${missing.length}개 · 어긋남 ${problems.length}건`);
if (problems.length > 0) {
  console.error('[gate-list] ❌ 이름만 있고 안 도는 검사가 있다:');
  for (const p of problems) console.error(`    ${p}`);
  process.exit(1);
}
console.log('[gate-list] OK — 목록의 이름이 전부 도는 자리에 있다');
process.exit(0);
