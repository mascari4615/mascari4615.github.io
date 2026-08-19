import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const 뿌리 = join(dirname(fileURLToPath(import.meta.url)), '..');
const 포트 = 4601;

test('page 창을 띄우면 채팅 화면이 나오고 도구 카드가 흐른다', async (t) => {
  const 서버 = spawn(process.execPath, [join(뿌리, 'demo', 'face.mjs')], {
    cwd: 뿌리,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      COMPANION_PORT: String(포트),
      COMPANION_BRAIN: 'preview',
      COMPANION_SURFACE: 'page',
      COMPANION_DESKTOP: '0',
      COMPANION_OPEN: '0',
      COMPANION_NUDGE: '0',
      COMPANION_SCREEN_MS: '0',
      COMPANION_MEMORY_FILE: join(mkdtempSync(join(tmpdir(), 'companion-page-')), 'conversation.jsonl'),
    },
  });
  let 뱉은것 = '';
  서버.stdout.on('data', (d) => { 뱉은것 += d; });
  서버.stderr.on('data', (d) => { 뱉은것 += d; });
  let 죽었나 = null;
  서버.on('exit', (code) => { 죽었나 = code; });
  t.after(() => 서버.kill());

  const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));
  let 살았나 = false;
  for (let i = 0; i < 60; i += 1) {
    if (죽었나 !== null) break;
    try { await fetch(`http://127.0.0.1:${포트}/ears`); 살았나 = true; break; } catch { await 잠깐(500); }
  }
  assert.ok(살았나, `서버가 안 떴다 (code ${죽었나}). 뱉은 것:\n${뱉은것.slice(-1500)}`);

  const html = await (await fetch(`http://127.0.0.1:${포트}/?surface=page`)).text();
  assert.match(html, /get\('surface'\) === 'page'/);
  assert.match(html, /chat-markup\.js/);
  assert.match(html, /desk\.js/);
  assert.match(html, /showPart/);

  const desk = await (await fetch(`http://127.0.0.1:${포트}/desk`)).json();
  assert.ok(Array.isArray(desk.lanes));
  assert.equal(desk.lanes[0]?.id, 'work');
  assert.equal(desk.lanes[1]?.id, 'talk');

  const css = await (await fetch(`http://127.0.0.1:${포트}/ui.css`)).text();
  assert.match(css, /body\.page \.talk/);
  assert.match(css, /body\.page \.line\.tool/);

  const markup = await (await fetch(`http://127.0.0.1:${포트}/chat-markup.js`)).text();
  assert.match(markup, /export function chatSegments/);

  const parts = [];
  const ac = new AbortController();
  t.after(() => ac.abort());
  const ev = fetch(`http://127.0.0.1:${포트}/events`, { signal: ac.signal }).then(async (res) => {
    const reader = res.body?.getReader();
    if (reader === undefined) return;
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line === undefined) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'part') parts.push(data.part);
        } catch { /* 한 줄 버림 */ }
      }
    }
  }).catch((e) => {
    if (e.name !== 'AbortError') throw e;
  });
  void ev;
  await 잠깐(200);

  await fetch(`http://127.0.0.1:${포트}/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '손봐줘' }),
  });

  let 말했나 = false;
  for (let i = 0; i < 40; i += 1) {
    if (/\[말함\]/.test(뱉은것) && parts.some((p) => p.kind === 'tool')) { 말했나 = true; break; }
    await 잠깐(200);
  }
  assert.ok(말했나, `page 에서 말·도구가 안 흐른다. parts=${JSON.stringify(parts)} 뱉은 것:\n${뱉은것.slice(-2000)}`);
  assert.ok(parts.some((p) => p.kind === 'image'), `그림 칸이 안 왔다: ${JSON.stringify(parts)}`);
});
