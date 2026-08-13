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
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { CHECKS, PREP } from './live-checks.mjs';

const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1] : null;
})();
const skipPrep = argv.includes('--skip-prep');
/* ★ **여럿이 나눠 든다** (2026-08-13). 서른세 검사를 한 줄로 돌면 17분이 넘는데, 이 판은
   배포마다 다시 불려 **끝나기 전에 취소된다** — 실측 40판 중 25판이 그렇게 판정을 못 냈다.
   판정이 안 나오는 검사는 없는 검사다. 그래서 조각으로 나눠 **동시에** 돈다.
   나누는 방식은 「하나 걸러 하나」다 — 앞쪽에 무거운 것이 몰려 있어 앞뒤로 자르면 한 조각만 길어진다. */
const shard = (() => {
  const i = argv.indexOf('--shard');
  if (i < 0) return null;
  const m = /^(\d+)\/(\d+)$/.exec(argv[i + 1] || '');
  if (!m) {
    console.error('[verify:live] --shard 는 「2/3」 꼴로 준다');
    process.exit(2);
  }
  return { idx: Number(m[1]) - 1, of: Number(m[2]) };
})();
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

let todo = only ? CHECKS.filter((c) => c.name.includes(only)) : CHECKS;
if (shard) {
  todo = todo.filter((_, i) => i % shard.of === shard.idx);
  console.log(`[verify:live] ${shard.idx + 1}/${shard.of} 조각 — 검사 ${todo.length}개`);
}
if (!todo.length) {
  console.error(`[verify:live] 「${only}」 에 걸리는 검사가 없다.`);
  process.exit(2);
}

/* ★ **이 자리에 서버가 있어야 도는 검사는 러너가 띄워 준다** (2026-08-13).
   「비워 둔 자리가 실제와 맞는지」는 `127.0.0.1:8801` 을 재는데 아무도 그 서버를 안 띄웠고,
   검사는 「연결 실패」를 그대로 **빨강**으로 냈다 — 못 돈 것이 틀린 것으로 읽히던 자리다. */
let server = null;
let serverDead = false;
if (todo.some((c) => c.needsServer)) {
  console.log(String.fromCharCode(10) + '──── 준비: 재는 상대가 될 서버 띄우기 (127.0.0.1:8801) ────');
  server = spawn(npm, ['run', 'serve:gzip'], { stdio: 'ignore', shell: process.platform === 'win32' });
  const ready = await (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        /* **늘 있는 파일**로 묻는다. 예전엔 `/apps/blog/karmolab/` 를 물었는데 그 자리는
           **찍어야 생기는 것**이라, 안 찍힌 판에서는 서버가 멀쩡한데도 「안 떴다」가 되어
           검사가 조용히 건너뛰어졌다 — 지키는 척만 하는 게이트가 된다. */
        const r = await fetch('http://127.0.0.1:8801/apps/karmolab/package.json');
        if (r.ok) return true;
      } catch { /* 아직 */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })();
  if (!ready) {
    /* 말만 「빨강 아님」이라 해 놓고 그대로 돌리면 결과는 빨강이다 — 그게 바로 이 검사가
       여태 서 있던 이유였다. 못 돌 것은 **돌리지 않고 못 돌았다고 적는다**. */
    console.error('[verify:live] 30초 안에 서버가 안 떴다 — 그 검사는 못 돈다(빨강 아님, 건너뛴다).');
    serverDead = true;
  } else {
    console.log('[verify:live] 서버 준비됨');
  }
}
const stopServer = () => { if (server) { try { server.kill(); } catch { /* 이미 죽음 */ } server = null; } };
process.on('exit', stopServer);

/* ★ **판이 잠잠해질 때까지 기다린 뒤 시작한다** (2026-08-13, 조각내기 부작용 교정).
   「올린 판이 실제로 서빙되는지」 검사가 그 기다림을 품고 있었는데, 목록을 셋으로 나누면서
   그 검사는 **1번 조각에만** 들어갔다 — 2·3번 조각은 배포가 갈리는 중에 그대로 들어가
   반쯤 바뀐 화면을 재고 가짜 빨강을 냈다(실측: charmap·crypto, build.json 이 그 1분 전 것).
   조각마다 앞에서 한 번 재우면 값이 싸고(대개 몇 초) 거짓 빨강이 사라진다. */
if (todo.some((c) => c.live)) {
  console.log(String.fromCharCode(10) + '──── 준비: 실사이트가 잠잠해질 때까지 ────');
  const code = run(['node', 'scripts/check-live-version.mjs']);
  if (code === 2) console.log('[verify:live] 판이 계속 갈리는 중이다 — 그래도 진행한다(이 판의 빨강은 의심하라).');
}

const results = [];
const skipped = [];
for (const check of todo) {
  if (check.needsServer && serverDead) {
    console.log(`──── ${check.name} — 건너뜀 (재는 상대가 될 서버가 안 떴다) ────`);
    skipped.push(check.name);
    continue;
  }
  const started = Date.now();
  console.log(`\n──── ${check.name}${check.live ? ' (실주소)' : ''} ────`);
  /* 실주소를 보는 검사만 「배포에 밟혔으면 다시」 껍데기를 씌운다 — 근거 있을 때만 재시도한다
     (그 껍데기가 스스로 서빙 커밋을 견준다). 목록에 손으로 적던 것을 여기로 옮겼다. */
  const cmd = check.live ? ['node', 'scripts/retry-if-redeployed.mjs', ...check.cmd] : check.cmd;
  const code = run(cmd);
  results.push({ ...check, code, sec: Math.round((Date.now() - started) / 1000) });
}

console.log('\n════ 라이브 점검 결과 ════');
for (const name of skipped) console.log(`  · ${name.padEnd(34, ' ')}   못 돌림 (건너뜀)`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓' : '✘'} ${r.name.padEnd(34, ' ')} ${String(r.sec).padStart(3)}s${r.code ? `  — exit ${r.code}` : ''}`);
}
const red = results.filter((r) => r.code !== 0);

/* 빨간 검사의 **이름**을 파일과 실행 요약에 남긴다 (2026-08-13).
   경보 이슈에 「로그를 보세요」만 328번 쌓여 있었다 — 무엇이 빨간지 안 적혀 있으면
   경보를 열어도 아무것도 모르고, 그런 경보는 꺼진 경보다. 워크플로가 이 파일을 읽어 적는다. */
const NL = String.fromCharCode(10);
const redFile = shard ? `live-check-red-${shard.idx + 1}.txt` : 'live-check-red.txt';
writeFileSync(redFile, red.map((r) => r.name).join(NL) + (red.length ? NL : ''), 'utf8');
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = results.map((r) => `- ${r.code === 0 ? '✅' : '❌'} ${r.name} (${r.sec}s)`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 라이브 점검 — 빨강 ${red.length} / ${results.length}` + NL + lines.join(NL) + NL, 'utf8');
}

if (red.length) {
  console.error(`\n[verify:live] 빨강 ${red.length}개 / ${results.length}개 — **한 판에 전부 보인다**:`);
  for (const r of red) console.error(`  - ${r.name}`);
  console.error('  위 로그에서 각 검사가 스스로 말한 사유를 봐라. 하나씩 고치고 또 10분 기다리지 마라.');
}
stopServer();
process.exitCode = red.length ? 1 : 0;
