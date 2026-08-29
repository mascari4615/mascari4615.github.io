/**
 * 새 재료 화면이 **공용 껍데기를 쓰는지** 본다.
 *
 * 왜: 파일 먼저 → 할 일 격자 → 결과 이어받기는 재료 화면 여덟이 **공유하는** 뼈대다
 * (`tools/shared/material-shell.ts`). 새 화면이 이걸 안 쓰고 자기 껍데기를 또 그리면,
 * 사람은 화면마다 다른 규칙을 배워야 하고 이어서가 그 화면에서만 안 된다.
 * 지금까지 이건 **사람 눈**으로만 봤다.
 *
 * 무엇을 보나 (둘):
 *   ① `Toolbox.mountTool(` 로 **남의 도구를 자기 안에 띄우면서** `materialShell(` 은 안 쓰는 화면.
 *      = 껍데기가 할 일을 손으로 다시 하고 있다는 신호.
 *   ② 껍데기를 쓰는 화면 수 ≤ `gates` 에 걸린 `smoke:*shell` 수.
 *      = **새 껍데기 화면을 늘리면서 화면 검사를 안 늘리는 것**을 막는다(기준선 없이 성립한다).
 *
 * ①은 래칫이다. 지금 있는 것은 기준선으로 통과, 새로 늘면 빨강. 둘째 칸에 예외 사유를 적는다
 * (재료가 아닌 모음 화면은 껍데기를 쓸 이유가 없다. 그 판단을 지우지 않고 적어 둔다).
 * 기준선은 이 감사기 자신이 쓴다(`--write-baseline`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(appRoot, 'src/widgets');
const GATE_LIST = join(appRoot, 'data/gate-list.json');
const BASELINE = join(appRoot, 'scripts/material-shell-baseline.tsv');
const TAB = '\t';
const write = process.argv.includes('--write-baseline');

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

if (!existsSync(SCAN_ROOT) || !existsSync(GATE_LIST)) {
  console.error('[material-shell] CANNOT-RUN: 훑을 폴더나 게이트 목록이 없다.');
  console.error('[material-shell]   이건 어긋난 데 없음이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}

const files = walk(SCAN_ROOT);
if (files.length < 100) {
  console.error(`[material-shell] CANNOT-RUN: 파일이 ${files.length}개뿐이다. 경로가 옮겨졌는지 확인할 것.`);
  process.exit(2);
}

const shellUsers = [];
const hosts = [];
for (const abs of files) {
  const rel = relative(appRoot, abs).split(String.fromCharCode(92)).join('/');
  if (rel.endsWith('shared/material-shell.ts')) continue; // 껍데기 자신은 대상이 아니다
  const code = stripComments(readFileSync(abs, 'utf8'));
  const usesShell = /materialShell\(/.test(code);
  const mounts = (code.match(/mountTool\(/g) ?? []).length;
  if (usesShell) shellUsers.push(rel);
  if (mounts > 0 && !usesShell) hosts.push({ rel, mounts });
}
// 껍데기를 쓰는 화면이 하나도 안 잡히면 = 규칙이 낡았다는 뜻이지 깨끗하다가 아니다.
if (shellUsers.length === 0) {
  console.error('[material-shell] CANNOT-RUN: `materialShell(` 을 쓰는 화면이 0개다. 이름이 바뀌었는지 확인할 것.');
  process.exit(2);
}

const gateNames = JSON.parse(readFileSync(GATE_LIST, 'utf8'));
/* ⚠ 여기는 `gateNames['목록']` 을 봤다. 그 파일이 영문 키(`list`)로 옮겨간 뒤로 이 줄은
   늘 빈 배열을 집었고, 그래서 이 검사가 **CANNOT-RUN 으로 조용히 빠져 있었다** . 
   빨강도 초록도 아니라 아무도 안 봤다. 자료를 옮길 때 **읽는 쪽을 다 안 고친** 것이다.
   같은 파일을 읽는 다섯 곳(`audit-gate-list`, `audit-orphan-tests`, `gate-derive`, 
   `new-tool-plan`, `test-gate-derive`)은 이미 `list` 를 본다. 여기 하나만 남아 있었다. */
const gateEntries = Array.isArray(gateNames) ? gateNames : gateNames.list || [];
/* 한 줄은 name 문자열이거나 `{name, 볼것}` 이다 (TASK-KL-331). 객체를 안 펴면 아래
   `filter(정규식)` 이 조용히 빠뜨리고, 그러면 이 검사가 형식을 확인할 것으로
   뒤집힌다. 발판을 적는 순간 터지는 지뢰라 미리 편다. */
const gates = gateEntries
  .map((e) => (typeof e === 'string' ? e : e?.name ?? e?.name))
  .filter((n) => typeof n === 'string');
const shellSmokes = gates.filter((g) => /^smoke:[a-z]+shell$/.test(g));
if (shellSmokes.length === 0) {
  console.error('[material-shell] CANNOT-RUN: `gates` 에 `smoke:*shell` 이 하나도 없다. 목록 형식을 확인할 것.');
  process.exit(2);
}

if (write) {
  const head = [
    '# material-shell 기준선. 도구를 자기 안에 띄우면서 공용 껍데기는 안 쓰는 화면들.',
    '# 껍데기를 쓰게 하면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 둘째 칸 = 판단 끝난 예외(재료 화면이 아니라 껍데기를 쓸 이유가 없는 것).',
    '# 갱신: node scripts/audit-material-shell.mjs --write-baseline',
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
  const lines = [...new Set(hosts.map((h) => h.rel))].sort()
    .map((k) => (prev.has(k) ? `${k}${TAB}${prev.get(k)}` : k));
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[material-shell] 기준선을 새로 썼다: ${lines.length}줄 (껍데기 쓰는 화면 ${shellUsers.length}개)`);
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
const fresh = hosts.filter((h) => !baseline.has(h.rel));
const stale = [...baseline].filter((k) => !hosts.some((h) => h.rel === k));

console.log(
  `[material-shell] 껍데기 쓰는 화면 ${shellUsers.length}개, 화면 검사 ${shellSmokes.length}개` +
    `, 껍데기 없이 도구를 띄우는 화면 ${hosts.length}개(기준선 ${baseline.size - reasons.size}, 판단 끝난 예외 ${reasons.size}), 새 것 ${fresh.length}건`,
);
if (stale.length > 0) {
  console.log(`[material-shell] 껍데기를 쓰게 된 것 ${stale.length}줄. 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k}`);
}

let bad = false;
// ② 껍데기 화면을 늘리면 화면 검사도 같이 늘어야 한다. 이건 기준선 없이 성립한다 . 
//    지금 것은 봐준다가 아니라 짝이 맞아야 한다라서다.
if (shellUsers.length > shellSmokes.length) {
  bad = true;
  console.error(
    `[material-shell] ❌ 껍데기 화면 ${shellUsers.length}개인데 화면 검사는 ${shellSmokes.length}개다. 새 껍데기 화면에 smoke 가 없다.`,
  );
  console.error(`    껍데기 쓰는 화면: ${shellUsers.join(', ')}`);
  console.error(`    gates 의 화면 검사: ${shellSmokes.join(', ')}`);
  console.error('        → 새 재료 화면을 만들었으면 `scripts/smoke-<재료>-shell.mjs` 를 짜고 `gates` 에 건다.');
}
if (fresh.length > 0) {
  bad = true;
  console.error('[material-shell] ❌ 공용 껍데기를 안 쓰고 도구를 자기 안에 띄운다:');
  for (const h of fresh) {
    console.error(`    ${h.rel} (mountTool ${h.mounts}곳)`);
    console.error('        → 재료 화면이면 `materialShell(container, ...)` 을 쓴다. 파일 줄, 할 일 격자, ');
    console.error('          이어서가 전부 거기 있다. 재료 화면이 아니면 기준선 둘째 칸에 사유를 적어라.');
  }
}
if (bad) process.exit(1);
console.log('[material-shell] OK. 껍데기를 비켜 간 새 화면 없음');
process.exit(0);
