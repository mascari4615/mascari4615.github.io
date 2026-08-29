import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4601;

test('page 창을 띄우면 채팅 화면이 나오고 도구 카드가 흐른다', async (t) => {
  const server = spawn(process.execPath, [join(root, 'demo', 'face.mjs')], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      COMPANION_PORT: String(port),
      COMPANION_BRAIN: 'preview',
      COMPANION_SURFACE: 'page',
      COMPANION_DESKTOP: '0',
      COMPANION_OPEN: '0',
      COMPANION_NUDGE: '0',
      COMPANION_SCREEN_MS: '0',
      COMPANION_MEMORY_FILE: join(mkdtempSync(join(tmpdir(), 'companion-page-')), 'conversation.jsonl'),
    },
  });
  let emitted = '';
  server.stdout.on('data', (d) => { emitted += d; });
  server.stderr.on('data', (d) => { emitted += d; });
  let isDead = null;
  server.on('exit', (code) => { isDead = code; });
  t.after(() => server.kill());

  const brief = (ms) => new Promise((r) => setTimeout(r, ms));
  let isAlive = false;
  for (let i = 0; i < 60; i += 1) {
    if (isDead !== null) break;
    try { await fetch(`http://127.0.0.1:${port}/ears`); isAlive = true; break; } catch { await brief(500); }
  }
  assert.ok(isAlive, `서버가 안 떴다 (code ${isDead}). 뱉은 것:\n${emitted.slice(-1500)}`);

  const html = await (await fetch(`http://127.0.0.1:${port}/?surface=page`)).text();
  assert.match(html, /get\('surface'\) === 'page'/);
  assert.match(html, /chat-markup\.js/);
  assert.match(html, /desk\.js/);
  assert.match(html, /showPart/);

  const desk = await (await fetch(`http://127.0.0.1:${port}/desk`)).json();
  assert.ok(Array.isArray(desk.lanes));
  assert.equal(desk.lanes[0]?.id, 'work');
  assert.equal(desk.lanes[1]?.id, 'talk');

  const css = await (await fetch(`http://127.0.0.1:${port}/ui.css`)).text();
  assert.match(css, /body\.page \.talk/);
  assert.match(css, /body\.page \.line\.tool/);

  const markup = await (await fetch(`http://127.0.0.1:${port}/chat-markup.js`)).text();
  assert.match(markup, /export function chatSegments/);

  const parts = [];
  const ac = new AbortController();
  t.after(() => ac.abort());
  const ev = fetch(`http://127.0.0.1:${port}/events`, { signal: ac.signal }).then(async (res) => {
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
  await brief(200);

  await fetch(`http://127.0.0.1:${port}/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '손봐줘' }),
  });

  let spoke = false;
  for (let i = 0; i < 40; i += 1) {
    if (/\[말함\]/.test(emitted) && parts.some((p) => p.kind === 'tool')) { spoke = true; break; }
    await brief(200);
  }
  assert.ok(spoke, `page 에서 말, 도구가 안 흐른다. parts=${JSON.stringify(parts)} 뱉은 것:\n${emitted.slice(-2000)}`);
  assert.ok(parts.some((p) => p.kind === 'image'), `그림 칸이 안 왔다: ${JSON.stringify(parts)}`);
});
