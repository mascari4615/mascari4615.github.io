#!/usr/bin/env node
/**
 * 라이브로 찔러 보는 자리 — **한 번 제대로 만들어 두고 계속 쓴다.**
 *
 * 회차마다 「서버 띄우고 · 말 걸고 · 얘가 스스로 적은 걸 읽는」 스크립트를 손으로 다시
 * 썼다. 열 번 넘게 그랬고, 84회차에 그 값을 치렀다 — **고정 시간만 기다리는 하네스**가
 * 서버 시작을 못 기다려서 확인 자체를 못 했다. 이 기계에 다른 세션 것까지 node 프로세스가
 * 스물일곱 개 떠 있으면 시작이 12초를 넘긴다. 그런데 하네스는 12초만 기다리고 죽었고,
 * **얘가 고장 난 것처럼 보였다.**
 *
 * 그래서 두 가지를 박아 둔다.
 * - **기다리지 말고 물어본다.** 살아났는지 되물으며 기다린다(최대 90초). 시간이 아니라
 *   상태를 본다.
 * - **못 살아나면 서버가 뱉은 걸 그대로 보여 준다.** 조용히 「fetch 실패」만 나오면
 *   하네스 탓인지 얘 탓인지 못 가른다.
 *
 * 쓰는 법:
 *   node scripts/probe.mjs "첫 마디" "둘째 마디" ...
 *   PROBE_GREP='\[머리\]|\[입\]'  볼 기록 줄 고르기 (없으면 흔한 것들)
 *   PROBE_WAIT=60000              한 마디 뒤 기다릴 시간
 *   그 밖의 COMPANION_* 는 그대로 넘어간다 (COMPANION_MODEL 등).
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const 뿌리 = join(dirname(fileURLToPath(import.meta.url)), '..');
const 포트 = Number(process.env.PROBE_PORT ?? String(4700 + Math.floor(Math.random() * 90)));
const 기다림 = Number(process.env.PROBE_WAIT ?? '55000');
const 볼것 = new RegExp(process.env.PROBE_GREP ?? '\\[머리\\]|\\[입\\]|\\[공\\]|\\[그때\\]|\\[자리\\]|\\[되새김\\]|\\[귀\\]');
const 말들 = process.argv.slice(2);

if (말들.length === 0) {
  console.error('쓸 말을 하나는 줘야 한다: node scripts/probe.mjs "오늘 어땠어"');
  process.exit(2);
}

const 서버 = spawn(process.execPath, [join(뿌리, 'demo', 'face.mjs')], {
  cwd: 뿌리,
  env: { ...process.env, COMPANION_PORT: String(포트), COMPANION_DESKTOP: '0', COMPANION_OPEN: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let 뱉은것 = '';
서버.stdout.on('data', (d) => { 뱉은것 += d; });
서버.stderr.on('data', (d) => { 뱉은것 += d; });
let 죽었나 = null;
서버.on('exit', (code) => { 죽었나 = code; });

const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));
const 주소 = (길) => `http://127.0.0.1:${포트}${길}`;

/** 살아났는지 **물어보며** 기다린다 — 시간이 아니라 상태를 본다. */
async function 살아나길() {
  for (let i = 0; i < 90; i += 1) {
    if (죽었나 !== null) return `서버가 시작하다 죽었다 (code ${죽었나})`;
    try {
      await fetch(주소('/ears'));
      console.log(`# 살아났다 (${i}초)`);
      return null;
    } catch {
      await 잠깐(1000);
    }
  }
  return '90초를 기다려도 안 살아났다';
}

const 탈 = await 살아나길();
if (탈 !== null) {
  console.error(`# ${탈}. 서버가 뱉은 것:`);
  console.error(뱉은것.slice(-2000) || '(아무것도 안 뱉었다)');
  서버.kill();
  process.exit(1);
}

for (const 말 of 말들) {
  console.log(`# 넣는다: ${말}`);
  try {
    await fetch(주소('/say'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 말 }),
    });
  } catch (e) {
    /* 중간에 못 넣었으면 **서버가 뱉은 걸 보여 준다.** 여태 「fetch failed」만 나와서
       얘가 죽은 건지 하네스가 못 붙은 건지 못 갈랐다(84회차에 이걸로 회차를 날렸다). */
    console.error(`# 못 넣었다: ${e?.message ?? e}${죽었나 === null ? '' : ` — 서버가 죽었다 (code ${죽었나})`}`);
    console.error(뱉은것.slice(-2500) || '(아무것도 안 뱉었다)');
    break;
  }
  await 잠깐(기다림);
}

const 답 = 뱉은것.split('\n').filter((l) => l.startsWith('[말함]')).map((l) => l.slice(5).trim());
console.log('\n== 얘가 한 말');
말들.forEach((넣은것, i) => {
  const a = 답[i];
  // 없는 답을 「4자」로 세면 안 된다 — 그건 「(없음)」의 길이다.
  const 잰것 = a === undefined ? '  —' : String(a.length).padStart(3);
  console.log(`  사람 ${String(넣은것.length).padStart(3)}자 → 얘 ${잰것}자 | ${a === undefined ? '(대답 없음)' : a.slice(0, 70)}`);
});
console.log('\n== 얘가 스스로 적은 것');
const 고른줄 = 뱉은것.split('\n').filter((l) => 볼것.test(l));
console.log(고른줄.length === 0 ? '  (해당 없음)' : 고른줄.map((l) => `  ${l}`).join('\n'));

서버.kill();
process.exit(0);
