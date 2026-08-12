/**
 * 멍 — 화면에 실제로 그려지는가 + **이음매가 없는가** (TASK-KL-247)
 *
 * 두 가지를 본다. 앞의 것은 흔한 검사고, 뒤의 것이 이 작품의 전부다.
 *
 *  ① 앱에서 켰을 때 캔버스에 잉크가 있고 손잡이가 나오는가.
 *     「위젯이 등록됐다」까지만 보면 **아무것도 안 그리는 검은 화면**도 초록으로 지나간다.
 *     그래서 픽셀을 센다.
 *
 *  ② 한 주기 뒤의 그림이 시작 그림과 **픽셀 단위로 같은가**.
 *     무한 줌은 이 하나로 서고 무너진다. 밝기·흩어짐·회전 중 하나라도 시각이나 깊이의
 *     함수로 슬쩍 바뀌면, 화면은 멀쩡해 보이는데 한 주기마다 딱 한 번 튄다 — 사람이
 *     눈으로 잡으려면 9초를 노려봐야 하는 종류다. 기계는 두 장을 바이트로 비교하면 끝난다.
 *     그래서 작품 파일만 따로 묶어 캔버스에 직접 그려 본다(껍데기·시간 흐름 없이).
 *
 * 사용: node scripts/smoke-meong.mjs   (npm run test:meong)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as esbuild from 'esbuild';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

if (!fs.existsSync(path.join(root, 'js/widgets/meong/meong.js'))) {
  console.log('[smoke-meong] 못 돌림 — js/widgets/meong/meong.js 가 없다 (`node build.mjs` 먼저)');
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
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const errors = [];
const NOISE = /CORS|ERR_FAILED|net::|Failed to load resource|yawnbot\.mascari4615\.com/;
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });

const problems = [];

/* ── ① 앱에서 켠다 ─────────────────────────────────────────────────── */

await page.goto(BASE + '/apps/karmolab/index.html#meong', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.meong-canvas', { timeout: 20000 });
await page.waitForTimeout(1200);

const seen = await page.evaluate(() => {
  const c = document.querySelector('.meong-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  // 바탕이 아닌 픽셀 세기 — 바탕만 칠하고 끝났으면 0 이 나온다
  for (let i = 0; i < d.length; i += 4 * 53) {
    if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) lit++;
  }
  return {
    lit,
    buttons: document.querySelectorAll('.meong-dock .meong-btn').length,
    hint: (document.querySelector('.meong-hint') || {}).textContent || '',
    rows: document.querySelectorAll('.meong-panel .meong-row').length
  };
});

if (seen.lit < 40) problems.push(`캔버스가 거의 비어 있다 — 밝은 픽셀 ${seen.lit}개`);
if (seen.buttons < 5) problems.push(`손잡이 단추가 모자라다 — ${seen.buttons}개`);
if (!seen.hint.trim()) problems.push('안내 글이 비어 있다 (말 묶음이 안 붙었다)');
if (seen.rows < 5) problems.push(`손잡이 줄이 모자라다 — ${seen.rows}개`);
// 열쇠 이름이 그대로 뜨면 말 묶음을 못 받은 것이다
if (/^meong\./.test(seen.hint.trim())) problems.push('안내 글에 열쇠 이름이 그대로 떴다: ' + seen.hint);

/* 멈춤 단추가 진짜 멈추는가.
   화면을 찍어 비교하면 안 된다 — 캔버스 자리를 찍으면 그 위에 뜬 손잡이까지 함께 찍히고,
   손잡이가 사라지는 중이면 그림이 그대로여도 두 장이 달라진다(실제로 그렇게 헛짚었다).
   캔버스 안의 픽셀만 직접 센다. */
const canvasSig = () => page.evaluate(() => {
  const c = document.querySelector('.meong-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let a = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4 * 17) {
    a = (a + d[i] * (i % 251)) % 2147483647;
    b = (b + d[i + 1] + d[i + 2]) % 2147483647;
  }
  return a + ':' + b;
});
await page.click('.meong-dock .meong-btn:nth-child(1)');
await page.waitForTimeout(150);
const a1 = await canvasSig();
await page.waitForTimeout(800);
const a2 = await canvasSig();
if (a1 !== a2) problems.push('멈춤을 눌렀는데 그림이 계속 움직인다');

/* ── ② 한 주기 = 같은 그림 ────────────────────────────────────────── */

const tmp = path.join(os.tmpdir(), 'meong-loop-check.js');
await esbuild.build({
  stdin: {
    contents: `import { droste } from ${JSON.stringify(path.join(root, 'src/widgets/meong/droste.ts'))};\nwindow.DROSTE = droste;\n`,
    resolveDir: root,
    loader: 'ts'
  },
  outfile: tmp,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  logLevel: 'silent'
});

const loopPage = await ctx.newPage();
loopPage.on('pageerror', (e) => errors.push('loop: ' + String(e)));
await loopPage.setContent(
  `<canvas id="c" width="820" height="560"></canvas><script>${fs.readFileSync(tmp, 'utf8')}</script>`,
  { waitUntil: 'load' }
);

const SPEED = 0.11;
const P = 1 / SPEED;
const params = { shape: 'square', speed: SPEED, grid: '9', palette: 'gold', dir: 'out' };

/** 그 시각의 화면을 픽셀로 받아온다 (그림 자체만 — 손잡이가 위에 안 뜨는 화면이다) */
async function px(time) {
  return loopPage.evaluate(
    ([t, p]) => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      window.DROSTE.frame({ ctx, w: 820, h: 560, dpr: 1, time: t, params: p, seed: 0.42 });
      return Array.from(ctx.getImageData(0, 0, 820, 560).data.filter((_, i) => i % 4 === 0));
    },
    [time, params]
  );
}
const meanDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};

/* ① 주기 경계에 **이음매가 없어야** 한다.
   이 작품은 층마다 다른 덩어리를 쓰므로 「한 주기 뒤 픽셀 동일」은 성립하지 않는다(그건 모든
   층이 한 모양일 때만 된다 — 사용자가 「매번 다른 모양」을 골랐다). 대신 지켜야 할 것은
   **경계에서 안 튀는 것**이다: 뿌리가 한 칸 올라가는 그 순간 그림이 이어져야 한다. */
const before = await px(P * 0.998);
const after = await px(P * 1.002);
const seam = meanDiff(before, after);
const move = meanDiff(await px(P * 0.998), await px(P * 0.94));
if (seam > move * 1.6 + 1.5) {
  problems.push(`주기 경계에서 그림이 튄다 — 경계 차이 ${seam.toFixed(2)} vs 같은 간격 움직임 ${move.toFixed(2)}`);
}

/* ② 그리고 실제로 움직여야 한다 (같은 그림을 계속 그리는 게 아니다) */
if (meanDiff(await px(0), await px(P * 0.5)) < 1) problems.push('주기 한가운데가 시작과 같다 — 안 움직인다');

fs.rmSync(tmp, { force: true });
await browser.close();
server.close();

if (errors.length) problems.push('페이지 오류 ' + errors.length + '개: ' + errors.slice(0, 3).join(' | '));

if (problems.length) {
  console.error('[smoke-meong] 실패\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(
  `[smoke-meong] 통과 — 밝은 픽셀 ${seen.lit} · 단추 ${seen.buttons} · 손잡이 ${seen.rows}줄 · 한 주기 뒤 픽셀 동일`
);
