#!/usr/bin/env node
/**
 * 라이브 점검을 **내 컴퓨터에서도 같은 순서로** 돌린다 (2026-08-13)
 *
 * 목록은 `live-checks.mjs` 하나뿐이고 워크플로도 이 파일을 부른다 — 두 곳에 적으면 갈라진다.
 *
 * 왜 필요했나: 이 검사들이 CI 에만 있어서, 빨강 하나 볼 때마다 **밀고 10분을 기다렸다**.
 * 같은 것을 여기서 돌리면 2 분이다. 「게이트가 CI 에만 있으면 늦다」의 라이브 판이다.
 *
 * 사용:
 *   npm run verify:live                 # 준비(빌드·페이지 찍기) + 전부
 *   npm run verify:live -- --only 팔레트  # 이름에 그 말이 든 것만
 *   npm run verify:live -- --skip-prep   # 준비는 건너뛰고 검사만 (이미 빌드해 뒀을 때)
 * exit: 0 = 전부 초록 / 1 = 빨강 있음
 */
import { spawnSync } from 'node:child_process';
import { CHECKS, PREP } from './live-checks.mjs';

const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1] : null;
})();
const skipPrep = argv.includes('--skip-prep');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd) {
  const [bin, ...rest] = cmd;
  const exe = bin === 'npm' ? npm : bin;
  const r = spawnSync(exe, rest, { stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

if (!skipPrep && !only) {
  for (const step of PREP) {
    console.log(`\n──── 준비: ${step.name} ────`);
    if (run(step.cmd) !== 0) {
      console.error(`[verify:live] 준비 단계에서 멈췄다 — ${step.name}`);
      console.error('  준비가 안 되면 뒤 검사는 **없는 것을 보는** 셈이라 전부 헛돈다.');
      process.exit(2);
    }
  }
}

const todo = only ? CHECKS.filter((c) => c.name.includes(only)) : CHECKS;
if (!todo.length) {
  console.error(`[verify:live] 「${only}」 에 걸리는 검사가 없다.`);
  process.exit(2);
}

const results = [];
for (const check of todo) {
  const started = Date.now();
  console.log(`\n──── ${check.name}${check.live ? ' (실주소)' : ''} ────`);
  const code = run(check.cmd);
  results.push({ ...check, code, sec: Math.round((Date.now() - started) / 1000) });
}

console.log('\n════ 라이브 점검 결과 ════');
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓' : '✘'} ${r.name.padEnd(34, ' ')} ${String(r.sec).padStart(3)}s${r.code ? `  — exit ${r.code}` : ''}`);
}
const red = results.filter((r) => r.code !== 0);
if (red.length) {
  console.error(`\n[verify:live] 빨강 ${red.length}개 / ${results.length}개 — **한 판에 전부 보인다**:`);
  for (const r of red) console.error(`  - ${r.name}`);
  console.error('  위 로그에서 각 검사가 스스로 말한 사유를 봐라. 하나씩 고치고 또 10분 기다리지 마라.');
}
process.exitCode = red.length ? 1 : 0;
