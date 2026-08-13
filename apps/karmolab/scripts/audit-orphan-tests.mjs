/**
 * **아무도 안 돌리는 검사**를 센다 (TASK-KL-301)
 *
 * 검사를 만들어 놓고 어느 묶음에도 안 넣으면, 그 검사는 **없는 것과 같다**. 빨개져도 아무도
 * 모른다 — `test:pdfdiff` 가 그렇게 며칠 「원래 깨진 것」으로 살았고, 이번 세션에 만든 재료
 * 화면검사 여덟은 게이트 밖이었으며, 이미지 재료 검사는 **npm 이름조차 없어** 손으로 부르지
 * 않으면 절대 안 돌았다.
 *
 * 그래서 「돌려지는 자리」를 전부 펼쳐 훑는다:
 *   package.json 의 묶음(`build`·`gates`·`verify:*`) 을 **재귀로** 펼치고,
 *   `scripts/live-checks.mjs`(라이브 목록)와 `.github/workflows/*.yml`(CI 가 직접 부르는 것)까지.
 *
 * **톱니(ratchet)**: 지금 밖에 있는 것들은 기준선에 적어 두고 통과시킨다. 대신
 *   ① 기준선에 없는 **새 고아**가 생기면 막고
 *   ② 기준선에 적혀 있는데 이제 묶음에 들어간 것은 **기준선에서 빼라**고 막는다.
 * 그래서 이 수는 **줄기만 한다**. (전부 당장 묶으면 게이트가 몇 배로 느려지고, 실주소를 보는
 * 검사는 배포 시점에 빨개져 아무도 안 믿게 된다 — 그건 따로 볼 판이다.)
 *
 * 사용: node scripts/audit-orphan-tests.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE = path.join(root, 'data/orphan-tests.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const isCheck = (name) => /^(test|smoke|audit):/.test(name);

/** 묶음 하나를 펼친다 — 묶음이 묶음을 부르므로 재귀. */
const covered = new Set();
function expand(name, depth = 0) {
  const body = scripts[name];
  if (depth > 6 || !body) return;
  for (const m of body.matchAll(/npm run ([\w:.-]+)/g)) {
    covered.add(m[1]);
    expand(m[1], depth + 1);
  }
  /* `run-gates.mjs a b c` 처럼 인자로 늘어놓는 묶음도 있다 */
  for (const word of body.split(/\s+/)) {
    if (isCheck(word)) {
      covered.add(word);
      expand(word, depth + 1);
    }
  }
}
for (const entry of ['build', 'gates', 'verify:prepush', 'verify:quality', 'verify:live']) {
  covered.add(entry);
  expand(entry);
}

/* 라이브 목록은 배열이라 이름이 따옴표 안에 있다 */
const live = fs.readFileSync(path.join(root, 'scripts/live-checks.mjs'), 'utf8');
for (const m of live.matchAll(/["'](?:test|smoke|audit):[\w:.-]+["']/g)) {
  const name = m[0].slice(1, -1);
  covered.add(name);
  expand(name);
}

/* CI 가 워크플로에서 직접 부르는 것도 「돌려지는 것」이다 */
const wfDir = path.join(root, '../../.github/workflows');
if (fs.existsSync(wfDir)) {
  for (const file of fs.readdirSync(wfDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    for (const m of fs.readFileSync(path.join(wfDir, file), 'utf8').matchAll(/npm run ([\w:.-]+)/g)) {
      covered.add(m[1]);
      expand(m[1]);
    }
  }
}

const all = Object.keys(scripts).filter(isCheck);
const orphans = all.filter((k) => !covered.has(k)).sort();

if (process.argv.includes('--update')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        설명: '아무 묶음에도 없는 검사 — 줄기만 한다. 늘리려면 왜 못 묶는지 적어라 (audit-orphan-tests.mjs)',
        갱신: new Date().toISOString().slice(0, 10),
        목록: orphans
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[audit-orphan-tests] 기준선 갱신 — ${orphans.length}개`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).목록;
const added = orphans.filter((k) => !base.includes(k));
const fixed = base.filter((k) => !orphans.includes(k));

if (added.length) {
  console.log(`[audit-orphan-tests] 아무도 안 돌리는 새 검사 ${added.length}개`);
  for (const a of added) console.log(`  - ${a} — 만들어 놓고 어느 묶음에도 안 넣었다`);
  console.log('  넣을 자리: package.json 의 `gates` (빠른 것) · `live-checks.mjs` (실주소를 보는 것)');
  process.exit(1);
}
if (fixed.length) {
  console.log(`[audit-orphan-tests] 이제 묶음에 든 것이 기준선에 남아 있다 ${fixed.length}개: ${fixed.join(', ')}`);
  console.log('  `npm run audit:orphans -- --update` 로 기준선을 줄여라 (톱니는 되감기지 않는다)');
  process.exit(1);
}
console.log(`[audit-orphan-tests] 검사 ${all.length}개 · 묶음 밖 ${orphans.length}개 (기준선과 같음 — 늘지 않았다)`);
