import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * **얘가 실제로 한 마디 하는지**. 나머지 천 개가 못 잡는 것.
 *
 * 85회차에 가장 비싼 것을 배웠다. 84회차에 배선 한 줄을 값이 만들어지기 전에 끼워 넣어서
 * **매 turn 예외가 났고, 얘는 한 마디도 못 했다.** 그 상태로 커밋하고 push 했다. 그때
 * 단위 시험 1022개는 **전부 초록**이었다. 아무도 실제 창을 안 띄우기 때문이다.
 *
 * 조각을 아무리 잘 시험해도 **조립한 것이 도는지**는 안 나온다. 그래서 여기서는 진짜로
 * 띄운다. 서버를 켜고, 말을 걸고, 대답이 나오는지 본다.
 *
 * **빠르게 만든다**. 안 그러면 아무도 안 돌린다.
 * - 두뇌는 가짜(echo)를 쓴다. 진짜 모델은 몇십 초가 걸리는데, **85회차의 사고는 두뇌가
 *   아니라 재료 만드는 자리에서 났다.** 가짜 두뇌로도 그 자리는 그대로 지나간다.
 * - 화면 곁눈질, 먼저 말 걸기는 끈다. 기억은 임시 자리에 둔다. 시험이 조수님 기억을
 *   건드리면 안 된다.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4599;

test('띄우면 말을 건넸을 때 대답한다. 조각이 다 초록이어도 조립한 게 죽어 있을 수 있다', async (t) => {
  const server = spawn(process.execPath, [join(root, 'demo', 'face.mjs')], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      COMPANION_PORT: String(port),
      COMPANION_BRAIN: 'echo',        // 진짜 모델은 안 부른다. 느리고, 사고 난 자리가 아니다
      COMPANION_DESKTOP: '0',
      COMPANION_OPEN: '0',
      COMPANION_NUDGE: '0',           // 먼저 말 걸기 끔
      COMPANION_SCREEN_MS: '0',       // 화면 곁눈질 끔
      COMPANION_MEMORY_FILE: join(mkdtempSync(join(tmpdir(), 'companion-alive-')), 'conversation.jsonl'),
    },
  });
  let emitted = '';
  server.stdout.on('data', (d) => { emitted += d; });
  server.stderr.on('data', (d) => { emitted += d; });
  let isDead = null;
  server.on('exit', (code) => { isDead = code; });
  t.after(() => server.kill());

  const brief = (ms) => new Promise((r) => setTimeout(r, ms));

  // **기다리지 말고 물어본다.** 고정 시간만 기다리다 84회차를 통째로 날렸다.
  let isAlive = false;
  for (let i = 0; i < 60; i += 1) {
    if (isDead !== null) break;
    try { await fetch(`http://127.0.0.1:${port}/ears`); isAlive = true; break; } catch { await brief(500); }
  }
  assert.ok(isAlive, `서버가 안 떴다 (code ${isDead}). 뱉은 것:\n${emitted.slice(-1500)}`);

  await fetch(`http://127.0.0.1:${port}/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '오늘 좀 어땠어' }),
  });

  // 대답이 나올 때까지 **찾아본다**. 여기서도 고정 시간이 아니라 상태를 본다.
  let spoke = false;
  for (let i = 0; i < 40; i += 1) {
    if (/\[말함\]/.test(emitted)) { spoke = true; break; }
    await brief(500);
  }

  /* **왜 말을 못 했는지가 여기 그대로 나와야 한다.** 대답이 없다만 남으면 85회차처럼
     원인 찾느라 회차를 통째로 쓴다. 서버가 뱉은 걸 붙여서 실패시킨다. */
  assert.ok(spoke, `말을 걸었는데 대답이 없다. 서버가 뱉은 것:\n${emitted.slice(-2000)}`);
});

test('한 turn 도는 동안 조용히 터진 게 없다. 예외를 삼키면 얘가 굳은 채로 살아 있다', async (t) => {
  const server2 = spawn(process.execPath, [join(root, 'demo', 'face.mjs')], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      COMPANION_PORT: String(port + 1),
      COMPANION_BRAIN: 'echo',
      COMPANION_DESKTOP: '0',
      COMPANION_OPEN: '0',
      COMPANION_NUDGE: '0',
      COMPANION_SCREEN_MS: '0',
      COMPANION_MEMORY_FILE: join(mkdtempSync(join(tmpdir(), 'companion-alive2-')), 'conversation.jsonl'),
    },
  });
  let emitted2 = '';
  server2.stdout.on('data', (d) => { emitted2 += d; });
  server2.stderr.on('data', (d) => { emitted2 += d; });
  t.after(() => server2.kill());
  const brief2 = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < 60; i += 1) {
    try { await fetch(`http://127.0.0.1:${port + 1}/ears`); break; } catch { await brief2(500); }
  }
  await fetch(`http://127.0.0.1:${port + 1}/say`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '오늘 좀 어땠어' }),
  });
  for (let i = 0; i < 30; i += 1) { if (/\[말함\]/.test(emitted2)) break; await brief2(500); }

  // 84회차의 그 사고는 이 두 낱말로 기록에 남아 있었다.
  const crashed = emitted2.split('\n').filter((l) => /ReferenceError|TypeError|is not a function|before initialization|UnhandledPromiseRejection/.test(l));
  assert.deepEqual(crashed, [], `한 turn 도는 동안 터진 게 있다:\n${crashed.join('\n')}`);
});
