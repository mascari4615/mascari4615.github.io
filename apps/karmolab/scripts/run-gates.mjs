/**
 * 검사를 **끝까지 다 돌리고 한꺼번에 보고한다** (TASK-KL-210 곁가지).
 *
 * 2026-08-09 실측: 배포가 하루 종일 빨갰다. 원인은 **여섯 개**였는데, 한 판에 **하나씩만**
 * 드러났다. `A && B && C` 는 A 에서 멈추므로 B, C 가 빨간지 아무도 모른다. 고치고, 10분 기다려
 * 배포가 또 죽고, 다음 것을 알고... 를 여섯 번 했다. 여섯 시간이 그렇게 갔다.
 *
 *   `&&` 사슬:  A 빨강 → 끝.        아는 것 1개 / 판당
 *   이 스크립트: 전부 돌림 → list.   아는 것 전부 / 판당
 *
 * ## 왜 그냥 `--continue-on-error` 가 아닌가
 *
 * 만드는 단계와 보는 단계는 다르다. 산출물을 못 만들면 그 뒤 검사는 **없는 것을 보는**
 * 셈이라 전부 헛돈다(빈 화면은 언제나 통과한다. 이 저장소에서 실제로 속은 적 있다).
 * 그래서 만드는 단계는 그대로 `&&` 로 두고, **검사만** 여기서 모아 돌린다.
 *
 * ## 순서대로, 한 번에 하나씩
 *
 * 병렬로 돌리면 빨라지지만 이 저장소의 검사들은 브라우저, 포트, 산출물을 공유한다. 실제로
 * 병렬화했더니 하위 셸 카운터가 사라져 전부 통과로 보이던 사고가 있었다. 시간보다 정직이 먼저다.
 *
 * 사용: node scripts/run-gates.mjs <npm-script> [<npm-script> ...]
 */
import { spawn, execFileSync } from 'node:child_process';
import { reapHeadless } from './lib/reap-browsers.mjs';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEntry, pick } from './lib/gate-scope.mjs';
import { deriveWatch } from './lib/gate-derive.mjs';

/* ★ **이름 목록은 파일에 있다** (2026-08-14). 예전에는 `package.json` 의 `gates` 한 줄에
   백스물다섯 개가 늘어서 있었다. 세션 여럿이 같은 줄을 동시에 늘리니 충돌이 잦았고,
   손으로 합치다 **승격 하나가 조용히 사라진** 적이 있다(`smoke:arcadeopen`).
   한 줄에 하나면 서로 다른 줄을 고치므로 git 이 알아서 합친다. */
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
let gates = args;
if (fromIdx !== -1) {
  const file = args[fromIdx + 1];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(path.join(here, '..', file), 'utf8'));
  /* ⚠ 한때 자료 키가 `목록` 인데 읽는 쪽만 `.list` 로 바뀌어 이름 목록을 못 찾았다로
     검사 165개가 통째로 안 돌았다(2026-08-21). 지금은 자료도 `list` 로 옮겨졌다
     (`e6e467538`). 두 이름이 <b>다시 갈리면</b> 같은 침묵이 난다. 자료와 코드는 같이 옮긴다. */
  gates = raw.list ?? raw;
  if (!Array.isArray(gates)) {
    console.error(`[gates] ${file} 안에서 이름 목록을 못 찾았다`);
    process.exit(2);
  }
}
/* ★ **`--changed` = 바뀐 것에 걸리는 검사만** (TASK-KL-331).
 *
 * 개발 중 전용 길이다. push, CI 는 이 깃발 없이 통짜로 돈다. 내 자리에선 초록이
 * 배포를 빨갛게 만드는 사고를 여기서 만들지 않는다.
 *
 * 안전 기본값 둘:
 *   ① 목록에 `볼것` 을 안 적은 검사는 **언제나 돈다**. 건너뛰려면 적어야 한다.
 *   ② 바뀐 목록을 못 구하면(git 이 없다, 저장소가 아니다) **통짜로 되돌린다.**
 *      못 봤다를 볼 것 없다로 바꾸는 것이 이 저장소에서 제일 비싼 고장이다.
 */
/** `package.json` 의 명령표. 발판을 알아낼 때 이 검사가 무슨 스크립트를 부르나의 근거다. */
function pkgScripts() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  try {
    return JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return {}; // 못 읽으면 아무 것도 못 알아낸다 = 통짜로 돈다 (안전 기본값)
  }
}

const changedIdx = args.indexOf('--changed');
let changed = null;
let skipped = [];
if (changedIdx !== -1) {
  const base = args[changedIdx + 1] && !args[changedIdx + 1].startsWith('--') ? args[changedIdx + 1] : 'origin/main';
  changed = changedFiles(base);
  if (changed === null) {
    console.log(`[gates] 바뀐 것을 못 구했다 (${base}). 통짜로 돈다.`);
  } else {
    /* 발판이 안 적힌 검사는 **알아내 본다** (KAR-231). 못 알아내면 그대로 돈다. */
    const scripts = pkgScripts();
    const picked = pick(gates, changed, (name) => deriveWatch(name, scripts));
    skipped = picked.skipped;
    gates = picked.run;
    console.log(
      `[gates] 바뀐 파일 ${changed.length}개, 돌릴 검사 ${gates.length}개` +
        (picked.derived ? `, 발판을 알아낸 검사 ${picked.derived}개` : '') +
        (skipped.length ? `, 건너뜀 ${skipped.length}개 (발판이 안 걸린다)` : '')
    );
  }
}

/* ★ **목록에는 두 꼴이 산다**. 이름 문자열, 그리고 발판을 적은 `{이름, 볼것}`(KL-331).
   고르는 길(`--changed`)만 그걸 이름으로 폈고, **통짜로 도는 길은 안 폈다.** 그래서 판
   전체가 `npm run --silent [object Object]` 를 열여섯 번 돌리고 요약에서
   `r.gate.padEnd is not a function` 으로 터졌다. push 게이트가 통째로 막혔다.
   펴는 자리를 한 곳으로 모은다: 여기를 지나면 `gates` 는 언제나 이름 배열이다. */
gates = gates.map(parseEntry).filter((e) => e !== null).map((e) => e.name);

if (!gates.length) {
  if (changed !== null) {
    // 걸리는 게 없다는 정상 결과다. 아무것도 안 돌았음을 **소리 내어** 말하고 초록으로 끝낸다.
    console.log(`[gates] 바뀐 것에 걸리는 검사가 없다. 건너뛴 ${skipped.length}개는 통짜(\`npm run gates\`)에서 돈다.`);
    process.exit(0);
  }
  console.error('[gates] 돌릴 검사가 없다. 이름을 하나 이상 줘라.');
  process.exit(2);
}

/**
 * 앱 뿌리 기준으로 바뀐 파일들. 못 구하면 `null` (= 통짜로 되돌린다).
 *
 * 기준과 견준 것과 아직 안 담은 것을 **둘 다** 본다. 하나만 보면 방금 고친 파일이
 * 빠져 그 검사를 안 돌리게 된다. 그게 곧 초록인데 죽음이다.
 */
function changedFiles(base) {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(appRoot, '..', '..');
  /* git 의 군말(줄끝 바뀐다는 경고 따위)은 버린다. 검사 화면을 덮으면 정작 볼 것을 못 본다. */
  const git = (a) =>
    execFileSync('git', ['-C', repoRoot, ...a], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  let out = '';
  try {
    out += git(['diff', '--name-only', base, '--']);
  } catch {
    return null; // 기준을 모른다 = 못 봤다
  }
  try {
    out += git(['status', '--porcelain']).split(String.fromCharCode(10))
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      .map((p) => p.split(' -> ').pop())
      .join(String.fromCharCode(10));
  } catch { /* 담긴 것만으로도 고를 수 있다 */ }

  const prefix = path.relative(repoRoot, appRoot).split(path.sep).join('/') + '/';
  const seen = new Set();
  for (const line of out.split(String.fromCharCode(10))) {
    const p = line.trim().replace(/^"|"$/g, '');
    if (!p) continue;
    // 목록의 `볼것` 은 앱 뿌리 기준으로 적는다. 앱 밖 파일은 그대로 둔다(저장소 기준 경로).
    seen.add(p.startsWith(prefix) ? p.slice(prefix.length) : p);
  }
  return [...seen];
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★ **npm 껍데기가 검사보다 비쌌다** (2026-08-29 실측). 같은 스크립트를 두 길로 세 번씩:
     `npm run --silent gen:arcade-catalog` 3675ms, `node scripts/gen-arcade-catalog.mjs` 931ms.
   차 2744ms 는 전부 npm.cmd 와 shell 기동이다. 130판이면 357초, 직렬 합계 548초의 65%가
   검사가 아니라 npm 이었다.

   그래서 `package.json` 의 명령 문자열을 읽어 **node 를 직접 부른다**. 다만 아무 문자열이나
   가르면 안 된다. `&&` 나 따옴표가 든 것(지금 `test:meok`, `test:mcp` 둘)은 shell 이 해야 할
   일이라 npm 길을 그대로 둔다. 갈라도 되는 꼴만 갈라낸다. */
const SIMPLE_NODE = /^node((?: +[^\s&|<>;"'`$()]+)+)$/;
const gateScripts = pkgScripts();
function directCommand(gate) {
  const m = SIMPLE_NODE.exec((gateScripts[gate] ?? '').trim());
  if (!m) return null;
  return { cmd: process.execPath, args: m[1].trim().split(/ +/) };
}

/* 브라우저를 띄우는 검사인가. 판단 근거는 그 검사의 첫 파일이 playwright 나 `lib/browser.mjs`
   를 들이는가 하나다. 넘게 세도 손해가 없고(같이 도는 크로미움이 줄 뿐), 덜 세면 RAM 이
   터진다. 그래서 의심스러우면 브라우저로 친다. */
function usesBrowser(gate) {
  const direct = directCommand(gate);
  const entry = direct?.args?.[0] ?? (gateScripts[gate] ?? '').match(/scripts\/[\w.-]+\.mjs/)?.[0];
  if (!entry) return true;
  try {
    return /playwright|lib\/browser/.test(readFileSync(path.join(appRoot, entry), 'utf8'));
  } catch {
    return true;
  }
}

/**
 * 검사 하나를 돌린다. **화면에는 그대로 흘려보내면서, 마지막 몇 줄은 따로 쥔다.**
 *
 * 왜 (2026-08-15 실측): 여태 `stdio: 'inherit'` 였다. 그러면 이 스크립트는 검사가 **무슨 말을
 * 했는지 하나도 모른 채** 빨강 N개 목록만 찍고, 사유는 위 로그를 봐라로 미룬다.
 * 그런데 이걸 부르는 쪽(`typecheck-pushed.mjs`)은 **끝 열네 줄만** 사람에게 보여 준다 . 
 * 사유는 그 위로 흘러가 버린다. 오늘 실제로 그 자리에 걸렸다: push 가 `audit:orphans` 로
 * 막혔는데 **왜 막혔는지 한 줄도 안 나왔다**. 사유 없는 빨강은 게이트가 아니라 벽이다.
 *
 * 그래서 흘려보내는 것은 그대로 두고(긴 판에서 진행이 보여야 한다), **빨간 검사의 제 output**을
 * 요약 바로 아래에 다시 붙인다. 요약만 떼어 봐도 사유가 같이 온다.
 */
const TAIL_LINES = 12;
function runGate(gate) {
  return new Promise((resolve) => {
    const tail = [];
    const collected = [];
    const collect = (chunk) => {
      for (const line of String(chunk).split(String.fromCharCode(10))) {
        if (!line.trim()) continue;
        tail.push(line.replace(/\s+$/, ''));
        if (tail.length > TAIL_LINES) tail.shift();
      }
    };
    /* ★ 인자 배열 대신 **한 줄 명령**으로 넘긴다. 윈도우의 `npm.cmd` 는 shell 이 있어야
       돌고(없으면 EINVAL), shell 에 인자 배열을 같이 주면 Node 가 매 판 DEP0190 경고를 찍는다.
       그 경고가 tail 열두 줄을 채우면 검사의 제 말이 또 밀려난다. 이름은 우리 목록에서만 온다. */
    const direct = directCommand(gate);
    const child = direct
      ? spawn(direct.cmd, direct.args, { cwd: appRoot, stdio: ['inherit', 'pipe', 'pipe'] })
      : spawn(`${npm} run --silent ${gate}`, {
          stdio: ['inherit', 'pipe', 'pipe'],
          shell: true
        });
    /* ★ **같이 도니까 흘려보내면 안 된다** (2026-08-19). 여덟 판이 한 화면에 섞여 찍히면
       어느 검사가 한 말인지 못 가린다. 사유 없는 빨강과 같아진다. 모았다가 끝날 때
       한 덩이로 낸다(머리글 + 그 검사의 output). */
    child.stdout.on('data', (c) => { collected.push(String(c)); collect(c); });
    child.stderr.on('data', (c) => { collected.push(String(c)); collect(c); });
    /* ★ **한 검사가 걸리면 판이 통째로 죽는다.** verify:live 에는 검사마다 바깥 상한(12분)이 있는데
       여기엔 없었다. 2026-09-05 실측: 자판 검사가 제 도우미를 재귀로 부르며 40분 CPU 100% 로 멈췄고,
       이 실행기였다면 워크플로 상한까지 전원이 기다렸다. 넘기면 끊고 못 돌림(2)으로 센다. 빨강이 아니라
       판정 없음이다. 왜 걸렸는지는 그 검사의 마지막 줄에 있다. 윈도우는 shell 로 띄운 손자까지 트리로 죽인다 */
    let timedOut = false;
    const limitMs = Number(process.env.KL_GATE_TIMEOUT_MS || 12 * 60 * 1000);
    const timer = setTimeout(() => {
      timedOut = true;
      const note = `⏱ ${Math.round(limitMs / 60000)}분을 넘겨 끊었다. 이 검사는 걸렸다 (못 돌림으로 센다). 마지막 줄을 봐라`;
      collected.push(note + String.fromCharCode(10)); collect(note);
      if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 이미 죽음 */ } }
      else { try { child.kill('SIGKILL'); } catch { /* 이미 죽음 */ } }
    }, limitMs);
    child.on('error', (error) => { clearTimeout(timer); resolve({ status: null, error, tail, output: collected.join('') }); });
    child.on('close', (status) => { clearTimeout(timer); resolve({ status: timedOut ? 2 : status, error: null, tail, output: collected.join('') }); });
  });
}

/* ★ **하나씩 돌 이유가 없었다** (2026-08-19 실측). 158판 합계 707초인데 이 컴퓨터는
   코어가 스물넷이다. 스물셋이 노는 동안 사람이 12분을 기다렸다. 검사들은 저마다 딴
   프로세스라 같이 돌려도 서로 모른다.

   같이 돌 때 지켜야 하는 것 둘:
    , **판정은 안 바뀐다.** 바뀌면 빨라진 게 아니라 검사를 망가뜨린 것이다. 같은 포트, 
       같은 파일을 쥐는 검사가 있으면 여기서 드러난다(조용히 넘기지 않는다).
    , **누가 한 말인지 안 섞인다.** 모았다가 한 덩이로 낸다(위 `돌린다`).

   그리고 **긴 것부터** 집는다. 짧은 것부터 집으면 끝에 제일 긴 놈만 남아 코어가 또 논다.
   지난 판 시간을 적어 두고 그 순서로 세운다. */
const timesFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gate-times.json');
let previousTimes = {};
try { previousTimes = JSON.parse(readFileSync(timesFile, 'utf8')); } catch { /* 처음이면 없다 */ }

/* ★ **폭이 8로 묶여 있었다.** 코어 스물넷인 자리에서 스물둘이 논다. 폭을 올리는 것을 막던
   것은 RAM 이다. 검사 절반이 크로미움을 띄우고 한 개가 200~400MB 라, 폭 16을 그냥 주면
   최악 6GB 다. 그래서 **세는 자리를 둘로 나눈다**: 전체 폭과 브라우저 폭.
   브라우저 폭은 예전 그대로 8이므로 메모리 최고점은 안 오르고, 나머지 여덟 자리는 파일만
   읽는 검사가 채운다. */
const cpuCount = os.cpus().length || 4;
const workerCount = Math.max(1, Number(process.env.KL_GATE_JOBS || Math.min(16, cpuCount - 2)));
const browserLimit = Math.max(1, Number(process.env.KL_GATE_BROWSER_JOBS || Math.min(8, workerCount)));
/* 모르는 검사는 **중간쯤**으로 친다. 맨 앞에 세우면 새 검사 하나가 판을 늘어뜨리고,
   맨 뒤에 세우면 사실 긴 놈이 꼬리에 남는다. */
const knownTimes = Object.values(previousTimes).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
const medianTime = knownTimes.length ? knownTimes[Math.floor(knownTimes.length / 2)] : 1;
const ordered = gates
  .map((gate, i) => ({ gate, i, expectedSec: previousTimes[gate] ?? medianTime, browser: usesBrowser(gate) }))
  .sort((a, b) => b.expectedSec - a.expectedSec);

const browserCount = ordered.filter((e) => e.browser).length;
const directCount = ordered.filter((e) => directCommand(e.gate)).length;
console.log(
  `[gates] 검사 ${gates.length}개, 한 번에 ${workerCount}판씩 (그중 브라우저는 ${browserLimit}판까지, 브라우저 검사 ${browserCount}개), 긴 것부터` +
    (directCount < gates.length ? `, npm 껍데기를 쓰는 검사 ${gates.length - directCount}개` : '')
);
const startedAt = Date.now();
let finishedCount = 0;
let browserActive = 0;
const pending = [...ordered];
/** 브라우저 자리가 찼으면 그 검사는 건너뛰고 다음 것을 집는다. 순서(긴 것부터)는 그대로다. */
function takeNext() {
  const idx = pending.findIndex((e) => !e.browser || browserActive < browserLimit);
  if (idx === -1) return undefined;
  const [entry] = pending.splice(idx, 1);
  if (entry.browser) browserActive += 1;
  return entry;
}
await Promise.all(
  Array.from({ length: Math.min(workerCount, pending.length) }, async () => {
    for (;;) {
      const nextGate = takeNext();
      /* 브라우저 자리가 차서 못 집은 것뿐이면 이 일꾼은 접기. 브라우저를 쥔 판이 살아 있고,
         그 판이 끝나면 다시 집으므로 남은 검사가 굶지 않음 */
      if (nextGate === undefined) return;
      const started = Date.now();
      const run = await runGate(nextGate.gate);
      if (nextGate.browser) browserActive -= 1;
      const sec = Math.round((Date.now() - started) / 1000);
      /* 죽은 방식도 구분해 남긴다. 빨강과 아예 못 돌았다는 손 갈 데가 다르다. */
      const how = run.error ? `못 돌림 (${run.error.message.slice(0, 60)})` : run.status === 0 ? null : `exit ${run.status}`;
      results.push({ gate: nextGate.gate, i: nextGate.i, sec, how, cantRun: !run.error && run.status === 2, tail: run.tail });
      finishedCount += 1;
      const mark = run.error ? ', ' : run.status === 0 ? '✓' : run.status === 2 ? ', ' : '✘';
      console.log(`
──── ${nextGate.gate} ────  ${mark} ${sec}s  (${finishedCount}/${gates.length})`);
      if (run.output) process.stdout.write(run.output.endsWith(String.fromCharCode(10)) ? run.output : run.output + String.fromCharCode(10));
    }
  })
);
// 요약은 list 순서로. 끝난 순서로 적으면 판마다 줄이 뒤바뀌어 견주기가 어렵다.
results.sort((a, b) => a.i - b.i);
console.log(`
[gates] 판 전체 ${Math.round((Date.now() - startedAt) / 1000)}초 (한 판씩이면 ${results.reduce((n, r) => n + r.sec, 0)}초였다)`);
// 다음 판에 긴 것부터 세우려고 이번 시간을 적어 둔다.
try {
  const nextTimes = { ...previousTimes };
  for (const r of results) nextTimes[r.gate] = r.sec;
  writeFileSync(timesFile, JSON.stringify(nextTimes, null, 2) + String.fromCharCode(10));
} catch { /* 못 적어도 판정과는 상관없다 */ }

/* ★ **exit 2 = 못 돌았다**. 이 저장소의 약속이고 검사 서른 곳이 이미 그렇게 쓴다.
   여태 그걸 빨강으로 셌다. 옆 세션이 `packages/` 를 지우는 중이면 전제를 못 찾겠다(2)가
   나는데 그건 커밋이 틀린 게 아니라 못 잰 것이다. 못 잰 것을 빨강으로 세면 push 게이트가
   멀쩡한 커밋을 막고, 사람은 곧 게이트를 안 믿게 된다(2026-08-13 실측). */
const cantRun = results.filter((r) => r.cantRun);
const bad = results.filter((r) => r.how && !r.cantRun);
console.log('\n════ 검사 결과 ════');
for (const r of results) {
  const mark = r.cantRun ? ', ' : r.how ? '✘' : '✓';
  const tail = r.cantRun ? ' . 못 돌림 (빨강 아님)' : r.how ? ' . ' + r.how : '';
  console.log(`  ${mark} ${r.gate.padEnd(22)} ${String(r.sec).padStart(4)}s${tail}`);
}
if (cantRun.length) {
  console.log(`[gates] 못 돌린 검사 ${cantRun.length}개. ${cantRun.map((r) => r.gate).join(', ')} (통과도 실패도 아니다)`);
}

/* ★ **판 요약에도 남긴다** (2026-08-13). 빨간 검사 이름을 보려고 매번 로그를 통째로
   내려받아 훑고 있었다(오늘만 여남은 번). 실행 요약에 적어 두면 판 화면에서 바로 보인다.
   라이브 점검은 이미 그렇게 하고 있었다. 같은 것을 여기도 둔다. */
if (process.env.GITHUB_STEP_SUMMARY) {
  const NL = String.fromCharCode(10);
  const lines = results.map((r) => `- ${r.cantRun ? '⚪' : r.how ? '❌' : '✅'} ${r.gate} (${r.sec}s)${r.how ? '. ' + r.how : ''}`);
  try {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 검사. 빨강 ${bad.length} / ${results.length}${cantRun.length ? `, 못 돌림 ${cantRun.length}` : ''}` + NL + lines.join(NL) + NL,
      'utf8'
    );
  } catch { /* 요약을 못 적는 것이 판을 세울 이유는 아니다 */ }
}

/* 검사가 죽으면서 남긴 브라우저를 거둔다. 정본은 `lib/reap-browsers.mjs` 머리말 */
{
  const reaped = reapHeadless(startedAt);
  if (reaped.count > 0) {
    console.log(`[gates] 검사가 남긴 브라우저 ${reaped.count}개를 거뒀다 (${reaped.mb}MB). 안 닫고 죽은 검사가 있다는 뜻`);
  }
}

/* ★ 건너뛴 것을 **소리 내어 적는다**. 조용히 줄어든 초록은 초록이 아니다. 이 저장소는
   안 도는 검사는 조용하다로 이미 데였다(gate-list 감사기 머리말). */
if (skipped.length) {
  console.log(`[gates] 건너뜀 ${skipped.length}개. 발판이 안 걸린다: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ` 외 ${skipped.length - 8}개` : ''}`);
  console.log('[gates]   (전부 보려면 `npm run gates`. push, CI 는 언제나 통짜다)');
}

if (!bad.length) {
  console.log(`
[gates] 전부 통과. ${results.length - cantRun.length}개${cantRun.length ? ` (못 돌림 ${cantRun.length})` : ''}${skipped.length ? `, 건너뜀 ${skipped.length}` : ''}`);
  process.exit(0);
}

console.error(`\n[gates] 빨강 ${bad.length}개 / ${results.length}개. **한 판에 전부 보인다**:`);
for (const r of bad) console.error(`  - ${r.gate} (${r.how})`);

/* ★ **사유를 요약에 붙여 보낸다**. 위 로그를 봐라는 부르는 쪽이 끝 몇 줄만 보여 줄 때
   거짓말이 된다(2026-08-15: push 가 사유 한 줄 없이 막혔다). 빨간 것의 제 말을 여기 다시 적는다. */
for (const r of bad) {
  console.error(`${String.fromCharCode(10)}  ── ${r.gate} 가 스스로 말한 것 ──`);
  if (!r.tail || r.tail.length === 0) console.error('    (아무 말도 안 하고 죽었다. 그 자체가 고칠 자리다)');
  else for (const line of r.tail) console.error(`    ${line}`);
}
console.error(`${String.fromCharCode(10)}  하나씩 고치고 또 10분 기다리지 마라.`);
process.exit(1);
