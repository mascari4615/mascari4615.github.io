/**
 * 검사를 **끝까지 다 돌리고 한꺼번에 보고한다** (TASK-KL-210 곁가지).
 *
 * 2026-08-09 실측: 배포가 하루 종일 빨갰다. 원인은 **여섯 개**였는데, 한 판에 **하나씩만**
 * 드러났다 — `A && B && C` 는 A 에서 멈추므로 B·C 가 빨간지 아무도 모른다. 고치고, 10분 기다려
 * 배포가 또 죽고, 다음 것을 알고… 를 여섯 번 했다. 여섯 시간이 그렇게 갔다.
 *
 *   `&&` 사슬:  A 빨강 → 끝.        아는 것 1개 / 판당
 *   이 스크립트: 전부 돌림 → 목록.   아는 것 전부 / 판당
 *
 * ## 왜 그냥 `--continue-on-error` 가 아닌가
 *
 * 「만드는 단계」와 「보는 단계」는 다르다. 산출물을 못 만들면 그 뒤 검사는 **없는 것을 보는**
 * 셈이라 전부 헛돈다(빈 화면은 언제나 통과한다 — 이 저장소에서 실제로 속은 적 있다).
 * 그래서 만드는 단계는 그대로 `&&` 로 두고, **검사만** 여기서 모아 돌린다.
 *
 * ## 순서대로, 한 번에 하나씩
 *
 * 병렬로 돌리면 빨라지지만 이 저장소의 검사들은 브라우저·포트·산출물을 공유한다. 실제로
 * 「병렬화했더니 하위 셸 카운터가 사라져 전부 통과로 보이던」 사고가 있었다. 시간보다 정직이 먼저다.
 *
 * 사용: node scripts/run-gates.mjs <npm-script> [<npm-script> …]
 */
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  gates = raw.목록 ?? raw.list ?? raw;
  if (!Array.isArray(gates)) {
    console.error(`[gates] ${file} 안에서 이름 목록을 못 찾았다`);
    process.exit(2);
  }
}
if (!gates.length) {
  console.error('[gates] 돌릴 검사가 없다 — 이름을 하나 이상 줘라.');
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

/**
 * 검사 하나를 돌린다 — **화면에는 그대로 흘려보내면서, 마지막 몇 줄은 따로 쥔다.**
 *
 * 왜 (2026-08-15 실측): 여태 `stdio: 'inherit'` 였다. 그러면 이 스크립트는 검사가 **무슨 말을
 * 했는지 하나도 모른 채** 「빨강 N개」 목록만 찍고, 사유는 「위 로그를 봐라」로 미룬다.
 * 그런데 이걸 부르는 쪽(`typecheck-pushed.mjs`)은 **끝 열네 줄만** 사람에게 보여 준다 —
 * 사유는 그 위로 흘러가 버린다. 오늘 실제로 그 자리에 걸렸다: push 가 `audit:orphans` 로
 * 막혔는데 **왜 막혔는지 한 줄도 안 나왔다**. 사유 없는 빨강은 게이트가 아니라 벽이다.
 *
 * 그래서 흘려보내는 것은 그대로 두고(긴 판에서 진행이 보여야 한다), **빨간 검사의 제 말**을
 * 요약 바로 아래에 다시 붙인다. 요약만 떼어 봐도 사유가 같이 온다.
 */
const 꼬리길이 = 12;
function 돌린다(gate) {
  return new Promise((resolve) => {
    const 꼬리 = [];
    const 담기 = (chunk) => {
      for (const line of String(chunk).split(String.fromCharCode(10))) {
        if (!line.trim()) continue;
        꼬리.push(line.replace(/\s+$/, ''));
        if (꼬리.length > 꼬리길이) 꼬리.shift();
      }
    };
    /* ★ 인자 배열 대신 **한 줄 명령**으로 넘긴다 — 윈도우의 `npm.cmd` 는 shell 이 있어야
       돌고(없으면 EINVAL), shell 에 인자 배열을 같이 주면 Node 가 매 판 DEP0190 경고를 찍는다.
       그 경고가 꼬리 열두 줄을 채우면 검사의 제 말이 또 밀려난다. 이름은 우리 목록에서만 온다. */
    const child = spawn(`${npm} run --silent ${gate}`, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });
    child.stdout.on('data', (c) => { process.stdout.write(c); 담기(c); });
    child.stderr.on('data', (c) => { process.stderr.write(c); 담기(c); });
    child.on('error', (error) => resolve({ status: null, error, 꼬리 }));
    child.on('close', (status) => resolve({ status, error: null, 꼬리 }));
  });
}

for (const gate of gates) {
  const started = Date.now();
  console.log(`\n──── ${gate} ────`);
  const run = await 돌린다(gate);
  const sec = Math.round((Date.now() - started) / 1000);
  /* 죽은 방식도 구분해 남긴다 — 「빨강」과 「아예 못 돌았다」는 손 갈 데가 다르다. */
  const how = run.error ? `못 돌림 (${run.error.message.slice(0, 60)})` : run.status === 0 ? null : `exit ${run.status}`;
  results.push({ gate, sec, how, cantRun: !run.error && run.status === 2, 꼬리: run.꼬리 });
}

/* ★ **exit 2 = 「못 돌았다」** — 이 저장소의 약속이고 검사 서른 곳이 이미 그렇게 쓴다.
   여태 그걸 빨강으로 셌다. 옆 세션이 `packages/` 를 지우는 중이면 「전제를 못 찾겠다(2)」가
   나는데 그건 커밋이 틀린 게 아니라 못 잰 것이다 — 못 잰 것을 빨강으로 세면 push 게이트가
   멀쩡한 커밋을 막고, 사람은 곧 게이트를 안 믿게 된다(2026-08-13 실측). */
const cantRun = results.filter((r) => r.cantRun);
const bad = results.filter((r) => r.how && !r.cantRun);
console.log('\n════ 검사 결과 ════');
for (const r of results) {
  const mark = r.cantRun ? '·' : r.how ? '✘' : '✓';
  const tail = r.cantRun ? '  — 못 돌림 (빨강 아님)' : r.how ? '  — ' + r.how : '';
  console.log(`  ${mark} ${r.gate.padEnd(22)} ${String(r.sec).padStart(4)}s${tail}`);
}
if (cantRun.length) {
  console.log(`[gates] 못 돌린 검사 ${cantRun.length}개 — ${cantRun.map((r) => r.gate).join(', ')} (통과도 실패도 아니다)`);
}

/* ★ **판 요약에도 남긴다** (2026-08-13). 빨간 검사 이름을 보려고 매번 로그를 통째로
   내려받아 훑고 있었다(오늘만 여남은 번). 실행 요약에 적어 두면 판 화면에서 바로 보인다.
   라이브 점검은 이미 그렇게 하고 있었다 — 같은 것을 여기도 둔다. */
if (process.env.GITHUB_STEP_SUMMARY) {
  const NL = String.fromCharCode(10);
  const lines = results.map((r) => `- ${r.cantRun ? '⚪' : r.how ? '❌' : '✅'} ${r.gate} (${r.sec}s)${r.how ? ' — ' + r.how : ''}`);
  try {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 검사 — 빨강 ${bad.length} / ${results.length}${cantRun.length ? ` · 못 돌림 ${cantRun.length}` : ''}` + NL + lines.join(NL) + NL,
      'utf8'
    );
  } catch { /* 요약을 못 적는 것이 판을 세울 이유는 아니다 */ }
}

if (!bad.length) {
  console.log(`
[gates] 전부 통과 — ${results.length - cantRun.length}개${cantRun.length ? ` (못 돌림 ${cantRun.length})` : ''}`);
  process.exit(0);
}

console.error(`\n[gates] 빨강 ${bad.length}개 / ${results.length}개 — **한 판에 전부 보인다**:`);
for (const r of bad) console.error(`  - ${r.gate} (${r.how})`);

/* ★ **사유를 요약에 붙여 보낸다** — 「위 로그를 봐라」는 부르는 쪽이 끝 몇 줄만 보여 줄 때
   거짓말이 된다(2026-08-15: push 가 사유 한 줄 없이 막혔다). 빨간 것의 제 말을 여기 다시 적는다. */
for (const r of bad) {
  console.error(`${String.fromCharCode(10)}  ── ${r.gate} 가 스스로 말한 것 ──`);
  if (!r.꼬리 || r.꼬리.length === 0) console.error('    (아무 말도 안 하고 죽었다 — 그 자체가 고칠 자리다)');
  else for (const line of r.꼬리) console.error(`    ${line}`);
}
console.error(`${String.fromCharCode(10)}  하나씩 고치고 또 10분 기다리지 마라.`);
process.exit(1);
