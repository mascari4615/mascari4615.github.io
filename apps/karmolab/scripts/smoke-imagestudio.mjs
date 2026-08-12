/**
 * 이미지 스튜디오 — 진짜 브라우저에서 그려 본다 (TASK-KL-240)
 *
 * 단위 검사는 붓·합성이 **맞는 답**을 낸다는 것까지만 말해 준다. 화면에 붙은 뒤로는
 * 「눌러서 그어도 아무 일도 안 일어난다」가 얼마든지 가능하다(좌표 변환·포인터 이벤트·
 * 캔버스 크기). 그래서 여기서는 마우스로 실제로 긋고, 캔버스 픽셀이 달라졌는지 본다.
 *
 * 사용: node scripts/smoke-imagestudio.mjs [--shot]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const bundle = path.join(root, 'js/widgets/imageedit/studio.js');
if (!fs.existsSync(bundle)) {
  console.error('[smoke-imagestudio] 묶음이 없다 — 먼저 node build.mjs');
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'
};
const server = http.createServer((request, response) => {
  let url = decodeURIComponent(request.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(repoRoot, url.replace(/^\//, ''));
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)));
  response.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' }).end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error' && !/CORS|ERR_FAILED|Failed to load resource|yawnbot/.test(message.text())) errors.push(message.text());
});

const problems = [];
await page.goto(base + '/apps/karmolab/index.html#imagestudio', { waitUntil: 'load', timeout: 30000 });
try {
  await page.waitForSelector('.ies', { timeout: 20000 });
} catch (error) {
  console.error('[smoke-imagestudio] 화면이 안 떴다', errors);
  throw error;
}
await page.waitForTimeout(600);

/** 캔버스 한가운데 언저리 픽셀 — 그림이 실제로 들어갔는지 본다. */
const canvasInk = () => page.evaluate(() => {
  const canvas = document.querySelector('.ies [data-canvas]');
  const ctx = canvas.getContext('2d');
  const box = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < box.length; i += 4) if (box[i] < 120 && box[i + 3] > 200) dark += 1;
  return dark;
});

const box = await page.locator('.ies [data-canvas]').boundingBox();
const before = await canvasInk();

/* ① 붓 — 눌러서 긋는다. */
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
await page.mouse.down();
for (let i = 1; i <= 12; i += 1) {
  await page.mouse.move(box.x + box.width * (0.35 + 0.02 * i), box.y + box.height * (0.4 + 0.012 * i));
}
await page.mouse.up();
await page.waitForTimeout(250);
const painted = await canvasInk();
if (painted <= before + 200) problems.push('붓으로 그었는데 화면이 안 바뀐다 (' + before + ' → ' + painted + ')');

/* ② 되돌리기 — 획 하나가 한 단계로 사라진다. */
await page.click('.ies [data-act="undo"]');
await page.waitForTimeout(250);
const undone = await canvasInk();
if (undone > before + 200) problems.push('되돌렸는데 획이 남아 있다 (' + undone + ')');
await page.click('.ies [data-act="redo"]');
await page.waitForTimeout(250);
const redone = await canvasInk();
if (redone <= before + 200) problems.push('다시 하기가 획을 되살리지 못했다');

/* ③ 레이어 — 늘고, 고른 것이 바뀐다. */
const layersBefore = await page.locator('.ies .ies-layer').count();
await page.click('.ies [data-act="add-layer"]');
await page.waitForTimeout(120);
const layersAfter = await page.locator('.ies .ies-layer').count();
if (layersAfter !== layersBefore + 1) problems.push('레이어가 안 늘었다 (' + layersBefore + ' → ' + layersAfter + ')');
if (!(await page.locator('.ies .ies-layer.active').count())) problems.push('고른 레이어 표시가 없다');

/* ④ 숨기면 화면에서 사라진다 — 합성이 화면까지 이어져 있는가. */
await page.locator('.ies .ies-layer').nth(1).locator('.ies-eye').click();
await page.waitForTimeout(250);
const hidden = await canvasInk();
if (hidden > before + 200) problems.push('레이어를 숨겼는데 그림이 그대로다 (' + hidden + ')');
await page.locator('.ies .ies-layer').nth(1).locator('.ies-eye').click();
await page.waitForTimeout(200);

/* ⑤ 프레임 — 늘고, 눌러서 옮겨 간다. */
const framesBefore = await page.locator('.ies .ies-frame').count();
await page.click('.ies [data-act="add-frame"]');
await page.waitForTimeout(200);
const framesAfter = await page.locator('.ies .ies-frame').count();
if (framesAfter !== framesBefore + 1) problems.push('프레임이 안 늘었다 (' + framesBefore + ' → ' + framesAfter + ')');
await page.locator('.ies .ies-frame').first().click();
await page.waitForTimeout(150);
if (!(await page.locator('.ies .ies-frame.active').first().isVisible())) problems.push('고른 프레임 표시가 없다');

/* ⑥ 픽셀 모드 — 격자에 붙는 도트 그림으로 갈아탄다. */
page.once('dialog', dialog => dialog.accept());
await page.click('.ies [data-act="new-pixel"]');
await page.waitForTimeout(400);
const pixelBox = await page.locator('.ies [data-canvas]').boundingBox();
await page.mouse.move(pixelBox.x + pixelBox.width * 0.5, pixelBox.y + pixelBox.height * 0.5);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(250);
const dotted = await canvasInk();
if (dotted < 20) problems.push('픽셀 모드에서 한 칸도 안 찍힌다 (' + dotted + ')');

/* ⑦ 화면이 넘치지 않는다(가로 스크롤). */
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) problems.push('가로로 ' + overflow + 'px 넘친다');

if (process.argv.includes('--shot')) {
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const shot = path.join(root, 'tmp/imagestudio.png');
  await page.locator('.ies').screenshot({ path: shot });
  console.log('[smoke-imagestudio] 사진 ' + shot);
}

await browser.close();
server.close();

if (errors.length) problems.push('콘솔 오류 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | '));
if (problems.length) {
  console.error('[smoke-imagestudio] ✗\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('[smoke-imagestudio] ✓ 붓·되돌리기·레이어(숨김 반영)·프레임·픽셀 모드 — 실제 브라우저');
