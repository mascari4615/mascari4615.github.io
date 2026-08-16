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
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { CHECKS, PREP } from './live-checks.mjs';
import { 조각내기 } from './lib/shard-split.mjs';

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
/** 이 조각이 얼마나 걸릴 거라 봤나 — 끝에서 실제와 견준다. */
let 예측분 = null;

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
  /* ★ **셈이 아니라 시간으로 가른다** (2026-08-16, 실측). 「하나 걸러 하나」는 개수만 맞춘다 —
     그런데 검사 하나가 10초인 것도 있고 601초인 것도 있다(입력칸 이름 잇기). 그래서 1번 조각이
     **40분 제한에 걸려 통째로 취소**됐다: 그 조각의 스무 검사는 판정이 아예 안 나온다.
     「23판 연속 0%」의 한 원인이 이것이다 — 빨간 게 아니라 **끝나지를 않았다**.
     실측한 초(`data/live-check-times.json`)를 보고 **무거운 것부터 가장 한가한 조각에** 넣는다.
     처음 보는 검사는 중앙값으로 친다 — 모르는 것을 0 으로 치면 그 조각만 다시 넘친다. */
  const 잰시간 = (() => {
    try {
      return JSON.parse(readFileSync(new URL('../data/live-check-times.json', import.meta.url), 'utf8')).초 || {};
    } catch {
      return {};
    }
  })();
  const 바구니 = 조각내기(todo, shard.of, 잰시간);
  /* 원래 차례를 지킨다 — 무거운 것부터 돌면 사람이 로그에서 길을 잃는다. */
  const 내것 = new Set(바구니[shard.idx].것);
  todo = todo.filter((c) => 내것.has(c));
  예측분 = Math.round(바구니[shard.idx].합 / 60);
  console.log(
    `[verify:live] ${shard.idx + 1}/${shard.of} 조각 — 검사 ${todo.length}개 · 잰 시간으로 ${예측분}분어치`
  );
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

  /* ★ **지금 재는 것이 어느 판인지 먼저 말한다** (2026-08-13). 이 검사들은 **실사이트**를 재는데,
     사이트는 방금 민 커밋이 아니라 **마지막으로 배포된 판**이다. 오늘 그걸 몰라서, 이미 고친
     빨강을 세 판이나 다시 들여다봤다(고친 커밋이 아직 배포 전이었다).
     서빙 중인 커밋이 지금 체크아웃보다 **뒤에 있으면** 그 사실을 크게 적는다. */
  try {
    const base = process.env.BASE || 'https://blog.mascari4615.com';
    const res = await fetch(`${base}/apps/karmolab/build.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const served = String((await res.json()).commit || '').slice(0, 8);
      const here = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim().slice(0, 8) || '(모름)';
      console.log(`[verify:live] 지금 재는 판 = ${served} · 이 자리의 판 = ${here}`);
      if (served && here !== '(모름)' && served !== here) {
        const ahead = spawnSync('git', ['merge-base', '--is-ancestor', served, here]);
        if (ahead.status === 0) {
          console.log('  ⚠ 실사이트가 **이 자리보다 뒤진 판**을 서빙 중이다 — 여기서 나는 빨강은');
          console.log('    「그 옛 판의 빨강」일 수 있다. 고친 것이 아직 안 나갔는지 먼저 봐라.');
        }
      }
    }
  } catch { /* 못 물어보면 그냥 진행한다 */ }
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
/* ★ **2 = 못 돌림은 빨강이 아니다** (2026-08-14). 게이트 러너(`run-gates.mjs`)는 이미 그렇게
   읽는데 여기만 「0이 아니면 빨강」이었다 — 같은 검사가 부르는 자리에 따라 다른 판정을 받았다.
   그래서 검사들이 「못 돌렸다」고 말하면서도 **0으로 끝내** 초록으로 세어지고 있었다
   (안 본 것을 봤다고 적는 자리다). 이제 여기서도 갈라 적는다. */
for (const r of results) {
  const 표 = r.code === 0 ? '✓' : r.code === 2 ? '·' : '✘';
  const 꼬리 = r.code === 2 ? '  — 못 돌림 (빨강 아님)' : r.code ? `  — exit ${r.code}` : '';
  console.log(`  ${표} ${r.name.padEnd(34, ' ')} ${String(r.sec).padStart(3)}s${꼬리}`);
}
const red = results.filter((r) => r.code !== 0 && r.code !== 2);
const 못돌림 = results.filter((r) => r.code === 2);
if (못돌림.length) console.log(`  ※ 못 돌린 검사 ${못돌림.length}개 — 초록으로 세지 않는다: ${못돌림.map((r) => r.name).join(', ')}`);

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
/* ★ **이 판에도 지붕이 있다 — 다가가면 말해 준다** (2026-08-14, 실측).
   한 시간마다 도는 판이 16 → 20 → **40분** 으로 늘다가 워크플로 상한(`timeout-minutes: 40`)에
   걸려 **끊겼다.** 끊긴 판은 빨강으로 보이지만 무엇이 빨간지는 아무도 모른다 —
   51개를 재다 말았으니까. 늘어나는 것은 조용해서, 걸리고 나서야 안다.
   그래서 총 시간을 늘 적고, 지붕에 다가가면 미리 운다. */
/* ★ **잰 표는 스스로 갱신되어야 한다** (2026-08-16). 조각을 시간으로 가르려면 초가 필요한데,
   그 표를 사람이 손으로 고치는 물건으로 두면 두 달 뒤에는 옛날 값으로 조각을 가르게 된다.
   그래서 **내 자리에서 돌 때마다** 이번 판의 초를 표에 얹는다(CI 는 파일이 날아가므로 안 쓴다).
   빨강이어도 시간은 시간이다 — 값은 남긴다. */
if (!process.env.CI) {
  try {
    const 표경로 = new URL('../data/live-check-times.json', import.meta.url);
    const 표 = JSON.parse(readFileSync(표경로, 'utf8'));
    표.초 = 표.초 || {};
    for (const r of results) 표.초[r.name] = r.sec;
    /* ★ **없어진 검사의 시간이 표에 남는다** (2026-08-16, 실측). 표에 61개가 있는데 검사는 60개였다 —
       사라진 이름 하나가 합계를 955초나 부풀리고 있었다(그 수를 보고 조각 여유를 잘못 셌다).
       한 줄로 돌 때(조각 없이)는 목록 전체를 본 것이므로, 그때만 **없는 이름을 턴다.** */
    if (!shard) {
      const 사는이름 = new Set(CHECKS.map((c) => c.name));
      for (const 이름 of Object.keys(표.초)) if (!사는이름.has(이름)) delete 표.초[이름];
    }
    표.잰날 = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    표.초 = Object.fromEntries(Object.entries(표.초).sort((a, b) => b[1] - a[1]));
    writeFileSync(표경로, `${JSON.stringify(표, null, 2)}
`, 'utf8');
    console.log(`[verify:live] 잰 시간 ${results.length}개를 표에 얹었다 — data/live-check-times.json`);
  } catch (error) {
    console.log(`[verify:live] 잰 시간을 표에 못 얹었다(그냥 넘어간다): ${String(error.message).slice(0, 60)}`);
  }
}

const 총초 = results.reduce((a, r) => a + r.sec, 0);
const 지붕분 = Number(process.env.LIVE_CHECK_ROOF_MIN || 40);
const 총분 = 총초 / 60;
console.log(`
[verify:live] 합계 ${총초}초 (${총분.toFixed(1)}분) · 검사 ${results.length}개`);

/* ★ **예측이 틀렸으면 그 자리에서 말하게 한다** (2026-08-16, 실측). 조각을 시간으로 가른 첫날,
   2번 조각이 「19분어치」라고 적어 놓고 **40분 제한에 걸려 취소**됐다 — 표에 빠진 검사 하나가
   하필 제일 무거운 것(955초)이라 13초로 쳐졌기 때문이다. 그때 로그에는 예측만 있고 견줄 것이
   없어서, 취소된 뒤에야 사람이 눈으로 찾아야 했다. 예측과 실제를 나란히 적으면 표가 낡은 순간
   **다음 판 로그가 스스로 고발한다**. */
if (예측분 != null) {
  /* ★ **시간표는 내 자리에서 재고, 판정은 CI 에서 난다** (2026-08-16, 실측). 같은 조각이
     로컬 19분 · CI 23분, 다른 판은 예측 14분 · 실제 24분이었다 — CI 가 대략 **1.3~1.7배** 느리다.
     그 차이를 「표가 낡았다」로 외치면 CI 로그가 매번 우는 경보가 된다(늘 우는 경보는 꺼진다).
     그래서 CI 에서는 그 배수를 알고 본다: **1.6배를 넘을 때만** 표를 의심한다.
     내 자리에서는 배수가 없으므로 30% 로 그대로 본다. */
  const 여기가CI = Boolean(process.env.CI);
  const 어긋남 = 총분 === 0 ? 0 : Math.round(((총분 - 예측분) / Math.max(예측분, 1)) * 100);
  const 한계 = 여기가CI ? 60 : 30;
  const 말 = 어긋남 >= 한계 ? ' ← 표가 낡았다. `data/live-check-times.json` 를 다시 재라' : '';
  const 곁 = 여기가CI ? ' · CI 는 대개 내 자리보다 1.3~1.7배 느리다' : '';
  console.log(`[verify:live] 예측 ${예측분}분 · 실제 ${총분.toFixed(1)}분(검사만, 준비 단계 별도) (${어긋남 >= 0 ? '+' : ''}${어긋남}%)${곁}${말}`);
}
if (총분 > 지붕분 * 0.6) {
  console.log(
    `  ⚠ 지붕(${지붕분}분)의 ${Math.round((총분 / 지붕분) * 100)}% 를 썼다 — 여기 검사를 더 넣기 전에` +
    ` 제일 무거운 것부터 더 드문 자리로 옮겨라(끊긴 판은 아무것도 못 알려 준다).`
  );
}

stopServer();
process.exitCode = red.length ? 1 : 0;
