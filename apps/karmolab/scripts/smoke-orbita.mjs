/**
 * ORBITA 가 **소리를 내는지**까지 본다 (TASK-KL-193)
 *
 * 왜 이렇게 보나: 화면이 그려졌는지만 보면 **소리 없는 시퀀서**도 초록으로 지나간다.
 * 그래서 두 출구를 다 센다 —
 *   ① 브라우저 신스: `createOscillator` 호출 수 (음이 예약됐다는 증거)
 *   ② MIDI 출력: 가짜 장치를 하나 꽂아 `send` 로 나온 바이트를 본다
 * 여기 없는 것(실제 장비·사람 귀)은 이 검사가 대신할 수 없다 — 그건 사람 몫이다.
 *
 * 사용: node scripts/smoke-orbita.mjs   (npm run test:orbita)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* 묶음이 없으면 「제품 고장」이 아니라 「못 돌린다」다 — 검사가 그걸 말할 줄 알아야 한다. */
if (!fs.existsSync(path.join(root, 'js/widgets/orbita.js'))) {
  console.log('[smoke-orbita] 못 돌림 — js/widgets/orbita.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/karmolab/' || u === '/karmolab') u = '/apps/karmolab/index.html';
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(String(body).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
/* 셸이 부르는 바깥 API(제안·통계)는 이 기계에서 CORS 로 막힌다 — 이 도구와 무관한 소음이다.
   그걸 세면 검사는 항상 빨갛고, 진짜 오류는 그 속에 묻힌다. */
const NOISE = /CORS|ERR_FAILED|net::|Failed to load resource|yawnbot\.mascari4615\.com/;
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });

await page.addInitScript(() => {
  window.__osc = 0;
  window.__midi = [];
  const orig = window.AudioContext.prototype.createOscillator;
  window.AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  // 이 기계엔 MIDI 장비가 없다 — 출력 경로를 보려면 가짜 장치를 하나 꽂아야 한다.
  navigator.requestMIDIAccess = async () => ({
    outputs: new Map([['fake-1', { id: 'fake-1', name: 'FAKE SYNTH', send: (d) => window.__midi.push([...d]) }]]),
    onstatechange: null
  });
});

const problems = [];
await page.goto(BASE + '/apps/karmolab/index.html#orbita', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('#orbitaCanvas', { timeout: 20000 });
await page.waitForTimeout(700);

await page.selectOption('#orbitaMidi', 'fake-1');
await page.click('#orbitaPlay');
await page.waitForTimeout(3000);

const seen = await page.evaluate(() => ({
  osc: window.__osc,
  midi: window.__midi.length,
  noteOn: window.__midi.filter((m) => (m[0] & 0xf0) === 0x90).length,
  rings: document.querySelectorAll('.orbita-ring-row').length,
  swatches: document.querySelectorAll('.orbita-sw').length,
  stopLabel: document.querySelector('#orbitaPlay').textContent.trim(),
  // 캔버스에 실제로 뭔가 칠해졌나 (빈 캔버스면 alpha 가 전부 0 이다)
  lit: (() => {
    const c = document.querySelector('#orbitaCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 8) n++;
    return n;
  })()
}));

/* 찍기 — 클릭 한 번이 실제로 저장까지 가는지.
   저장은 **바뀔 때만** 일어나므로, 처음엔 저장본이 아예 없다. 그 0 을 「원래 개수」로 삼으면
   기본 패턴 11개가 통째로 늘어난 것처럼 보인다. 그래서 한 번 찍어 저장을 깨운 뒤부터 센다. */
const box = await page.locator('#orbitaCanvas').boundingBox();
const outer = Math.min(box.width, box.height) * 0.44;
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - outer);
await page.waitForTimeout(250);
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('karmolab_orbita_song_v1') || '{"rings":[]}'));
await page.mouse.click(box.x + box.width / 2 + outer, box.y + box.height / 2);
await page.waitForTimeout(250);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('karmolab_orbita_song_v1') || '{"rings":[]}'));
const placed = (s) => (s.rings || []).reduce((n, r) => n + (r.slots || []).filter(Boolean).length, 0);

/* 눈으로 볼 일이 있을 때만 한 장 남긴다 — 색·글로우는 사람이 봐야 판정된다.
   사용: node scripts/smoke-orbita.mjs --shot out.png */
const shotIdx = process.argv.indexOf('--shot');
if (shotIdx > 0 && process.argv[shotIdx + 1]) await page.screenshot({ path: process.argv[shotIdx + 1] });

await page.click('#orbitaPlay');
await page.waitForTimeout(200);
const stopped = await page.evaluate(() => {
  const n = window.__osc;
  return new Promise((r) => setTimeout(() => r({ before: n, after: window.__osc }), 700));
});

await browser.close();
server.close();

if (seen.osc < 5) problems.push(`신스가 음을 안 냈다 (createOscillator ${seen.osc}회)`);
if (seen.noteOn < 5) problems.push(`MIDI note-on 이 안 나갔다 (${seen.noteOn}개)`);
if (seen.rings !== 4) problems.push(`궤도 줄이 ${seen.rings}개 (4 이어야)`);
if (seen.swatches < 3) problems.push(`색 팔레트가 ${seen.swatches}개`);
if (seen.lit < 50) problems.push(`캔버스가 비어 있다 (칠해진 표본 ${seen.lit})`);
if (seen.stopLabel.indexOf('STOP') < 0) problems.push(`PLAY 버튼이 안 바뀌었다 (${seen.stopLabel})`);
if (placed(after) !== placed(before) + 1) problems.push(`클릭이 안 찍혔다 (${placed(before)} → ${placed(after)})`);
if (stopped.after !== stopped.before) problems.push(`STOP 후에도 음이 예약된다 (+${stopped.after - stopped.before})`);
if (errors.length) problems.push(`오류 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

console.log(`[smoke-orbita] 신스 ${seen.osc}음 · MIDI note-on ${seen.noteOn} · 칠해진 표본 ${seen.lit} · 찍기 ${placed(before)}→${placed(after)}`);
if (problems.length) {
  console.error('[smoke-orbita] ✗\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('[smoke-orbita] ✓ 궤도가 돌고 두 출구(신스·MIDI)로 다 나간다');
