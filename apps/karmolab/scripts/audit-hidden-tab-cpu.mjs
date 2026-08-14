/**
 * 숨은 탭에서 계속 도는 화면을 잡는다 (배터리 래칫).
 *
 * 왜: 앰비언트 화면은 **켜 두는 것이 전제**다. 그런데 탭을 덮어 놓아도 계속 돌면 사용자는
 * 「이 사이트 켜두면 노트북이 뜨겁다」로만 느낀다 — 오류도 안 뜨고 화면도 멀쩡하다.
 *
 * 무엇을 잡나: **`setInterval` 을 걸면서 숨김을 아예 안 보는 파일.**
 *   숨김 감지 = `visibilitychange` · `document.hidden` · `document.visibilityState` ·
 *   `IntersectionObserver`(안 보이면 멈추는 쪽) 중 **하나라도**.
 *
 * ★ `requestAnimationFrame` 은 일부러 안 센다. 브라우저가 숨은 탭에서 **스스로 멈춘다** —
 *   그걸 위반으로 세면 고칠 것 없는 자리에 빨간불이 켜지고, 그런 게이트는 꺼진다.
 *   반대로 `setInterval` 은 숨어도 (느려질 뿐) 계속 돈다. 그래서 이쪽만 본다.
 *
 * 이 검사가 못 보는 것: 그 감지가 **실제로 멈추는지**. `document.hidden` 을 읽고 아무것도
 * 안 해도 통과한다 — 그건 사람이 본다. 여기서 잡는 것은 「생각조차 안 한 자리」다.
 *
 * 래칫이다: 지금 있는 것은 기준선으로 통과, **새로 늘면 빨강**.
 * 기준선은 이 감사기 자신이 쓴다(`--write-baseline`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(appRoot, 'src/widgets');
const BASELINE = join(appRoot, 'scripts/hidden-tab-cpu-baseline.tsv');
const TAB = '\t';
const write = process.argv.includes('--write-baseline');

const RE_INTERVAL = /setInterval\(/g;
const RE_GUARD = /visibilitychange|document\.hidden|document\.visibilityState|IntersectionObserver/;

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
      continue;
    }
    if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

if (!existsSync(SCAN_ROOT)) {
  console.error(`[hidden-tab] CANNOT-RUN: 훑을 폴더가 없다 — ${SCAN_ROOT}`);
  console.error('[hidden-tab]   이건 「위반 없음」이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}
const files = walk(SCAN_ROOT);
if (files.length < 100) {
  console.error(`[hidden-tab] CANNOT-RUN: 파일이 ${files.length}개뿐이다 — 경로가 옮겨졌는지 확인할 것.`);
  process.exit(2);
}

const found = [];
let tickers = 0;
for (const abs of files) {
  const rel = relative(appRoot, abs).split(String.fromCharCode(92)).join('/');
  const code = stripComments(readFileSync(abs, 'utf8'));
  const n = (code.match(RE_INTERVAL) ?? []).length;
  if (n === 0) continue;
  tickers++;
  if (!RE_GUARD.test(code)) found.push({ rel, n });
}
// 계속 도는 파일이 하나도 안 잡히면 = 규칙이 낡았다는 뜻이지 「깨끗하다」가 아니다.
if (tickers === 0) {
  console.error('[hidden-tab] CANNOT-RUN: setInterval 을 쓰는 파일이 0개다 — 정규식이 낡았다.');
  process.exit(2);
}

if (write) {
  const head = [
    '# hidden-tab 기준선 — 숨김을 안 보는 채로 이미 도는 화면들. 여기 없는 새 것만 막는다.',
    '# 숨김을 보게 하면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 둘째 칸 = 판단 끝난 예외(숨어도 계속 돌아야 하는 이유).',
    '# 갱신: node scripts/audit-hidden-tab-cpu.mjs --write-baseline',
  ];
  const prev = new Map();
  if (existsSync(BASELINE)) {
    for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
      const s = line.trimEnd();
      if (!s || s.startsWith('#')) continue;
      const p = s.split(TAB);
      if (p[1]) prev.set(p[0], p[1]);
    }
  }
  const lines = [...new Set(found.map((f) => f.rel))].sort()
    .map((k) => (prev.has(k) ? `${k}${TAB}${prev.get(k)}` : k));
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[hidden-tab] 기준선을 새로 썼다: ${lines.length}줄 (setInterval 쓰는 파일 ${tickers}개 중)`);
  process.exit(0);
}

const baseline = new Set();
const reasons = new Map();
if (existsSync(BASELINE)) {
  for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
    const s = line.trimEnd();
    if (!s || s.startsWith('#')) continue;
    const p = s.split(TAB);
    baseline.add(p[0]);
    if (p[1]) reasons.set(p[0], p[1]);
  }
}
const fresh = found.filter((f) => !baseline.has(f.rel));
const stale = [...baseline].filter((k) => !found.some((f) => f.rel === k));

console.log(
  `[hidden-tab] setInterval 쓰는 파일 ${tickers}개 · 숨김을 안 보는 것 ${found.length}개` +
    ` (기준선 ${baseline.size - reasons.size} · 판단 끝난 예외 ${reasons.size}) · 새 것 ${fresh.length}건`,
);
if (stale.length > 0) {
  console.log(`[hidden-tab] 숨김을 보게 된 것 ${stale.length}줄 — 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k}`);
}
if (fresh.length === 0) {
  console.log('[hidden-tab] OK — 숨은 탭에서 새로 도는 자리 없음');
  process.exit(0);
}
console.error('[hidden-tab] ❌ 숨은 탭에서도 계속 돈다 (배터리를 태운다):');
for (const f of fresh) {
  console.error(`    ${f.rel} (setInterval ${f.n}곳)`);
  console.error('        → 탭이 숨으면 멈춰라: `document.addEventListener(\'visibilitychange\', …)` 로');
  console.error('          `document.hidden` 일 때 `clearInterval`, 돌아오면 다시 건다.');
  console.error('          (화면 밖으로 나가는 것까지 보려면 IntersectionObserver)');
}
process.exit(1);
