/**
 * 이미지 스튜디오 — 진짜 브라우저에서 그려 본다 (TASK-KL-240)
 *
 * 단위 검사는 붓·합성이 **맞는 답**을 낸다는 것까지만 말해 준다. 화면에 붙은 뒤로는
 * 「눌러서 그어도 아무 일도 안 일어난다」가 얼마든지 가능하다(좌표 변환·포인터 이벤트·
 * 캔버스 크기). 그래서 여기서는 마우스로 실제로 긋고, 캔버스 픽셀이 달라졌는지 본다.
 *
 * 사용: node scripts/smoke-meok.mjs [--shot]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const bundle = path.join(root, 'js/widgets/meok/meok.js');
if (!fs.existsSync(bundle)) {
  console.error('[smoke-meok] 묶음이 없다 — 먼저 node build.mjs');
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
await page.goto(base + '/apps/karmolab/index.html#meok', { waitUntil: 'load', timeout: 30000 });
try {
  await page.waitForSelector('.meok', { timeout: 20000 });
} catch (error) {
  console.error('[smoke-meok] 화면이 안 떴다', errors);
  throw error;
}
await page.waitForTimeout(600);

/** 캔버스 한가운데 언저리 픽셀 — 그림이 실제로 들어갔는지 본다. */
const canvasInk = () => page.evaluate(() => {
  const canvas = document.querySelector('.meok [data-canvas]');
  const ctx = canvas.getContext('2d');
  const box = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < box.length; i += 4) if (box[i] < 120 && box[i + 3] > 200) dark += 1;
  return dark;
});


/**
 * 그림이 화면 어느 사각형에 놓였나 — 캔버스 밖은 아예 비어 있으므로(투명) 그걸로 잰다.
 * 이걸 안 쓰고 캔버스 비율로 찍으면 창 모양에 따라 **그림 밖**을 눌러 「아무 일도 안 일어남」이
 * 되고, 검사는 그걸 기능 고장으로 잘못 읽는다(실제로 한 번 그랬다).
 */
const artRect = async () => {
  const box = await page.locator('.meok [data-canvas]').boundingBox();
  const inner = await page.evaluate(() => {
    const canvas = document.querySelector('.meok [data-canvas]');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const dpr = canvas.width / parseFloat(canvas.style.width);
    return maxX < 0 ? null : { x: minX / dpr, y: minY / dpr, w: (maxX - minX) / dpr, h: (maxY - minY) / dpr };
  });
  if (!inner) throw new Error('그림이 화면에 없다');
  /* width/height 로도 읽히게 둔다 — boundingBox() 를 받던 자리들이 그대로 쓴다. */
  return { x: box.x + inner.x, y: box.y + inner.y, w: inner.w, h: inner.h, width: inner.w, height: inner.h };
};

const box = await artRect();
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
await page.click('.meok [data-act="undo"]');
await page.waitForTimeout(250);
const undone = await canvasInk();
if (undone > before + 200) problems.push('되돌렸는데 획이 남아 있다 (' + undone + ')');
await page.click('.meok [data-act="redo"]');
await page.waitForTimeout(250);
const redone = await canvasInk();
if (redone <= before + 200) problems.push('다시 하기가 획을 되살리지 못했다');

/* ③ 레이어 — 늘고, 고른 것이 바뀐다. */
const layersBefore = await page.locator('.meok .meok-layer').count();
await page.click('.meok [data-act="add-layer"]');
await page.waitForTimeout(120);
const layersAfter = await page.locator('.meok .meok-layer').count();
if (layersAfter !== layersBefore + 1) problems.push('레이어가 안 늘었다 (' + layersBefore + ' → ' + layersAfter + ')');
if (!(await page.locator('.meok .meok-layer.active').count())) problems.push('고른 레이어 표시가 없다');

/* ④ 숨기면 화면에서 사라진다 — 합성이 화면까지 이어져 있는가. */
await page.locator('.meok .meok-layer').nth(1).locator('.meok-eye').click();
await page.waitForTimeout(250);
const hidden = await canvasInk();
if (hidden > before + 200) problems.push('레이어를 숨겼는데 그림이 그대로다 (' + hidden + ')');
await page.locator('.meok .meok-layer').nth(1).locator('.meok-eye').click();
await page.waitForTimeout(200);

/* ⑤ 프레임 — 늘고, 눌러서 옮겨 간다. */
const framesBefore = await page.locator('.meok .meok-frame').count();
await page.click('.meok [data-act="add-frame"]');
await page.waitForTimeout(200);
const framesAfter = await page.locator('.meok .meok-frame').count();
if (framesAfter !== framesBefore + 1) problems.push('프레임이 안 늘었다 (' + framesBefore + ' → ' + framesAfter + ')');
await page.locator('.meok .meok-frame').first().click();
await page.waitForTimeout(150);
if (!(await page.locator('.meok .meok-frame.active').first().isVisible())) problems.push('고른 프레임 표시가 없다');

/* ⑥ 픽셀 모드 — 격자에 붙는 도트 그림으로 갈아탄다. */
page.once('dialog', dialog => dialog.accept());
await page.click('.meok [data-act="new-pixel"]');
await page.waitForTimeout(400);
const pixelBox = await artRect();
await page.mouse.move(pixelBox.x + pixelBox.width * 0.5, pixelBox.y + pixelBox.height * 0.5);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(250);
const dotted = await canvasInk();
if (dotted < 20) problems.push('픽셀 모드에서 한 칸도 안 찍힌다 (' + dotted + ')');

/* ⑦ 선택영역 — 골라 놓으면 붓이 그 밖으로 안 샌다. */
page.once('dialog', dialog => dialog.accept());
await page.click('.meok [data-act="new"]');
await page.waitForTimeout(400);
const art = await artRect();
const ax = (f) => art.x + art.w * f;
const ay = (f) => art.y + art.h * f;

await page.click('.meok [data-tool="marquee"]');
await page.mouse.move(ax(0.10), ay(0.20));
await page.mouse.down();
await page.mouse.move(ax(0.45), ay(0.80), { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(250);
if (!(await page.locator('.meok [data-act="deselect"]').isEnabled())) {
  problems.push('사각형을 골랐는데 「선택 풀기」가 안 켜진다 (= 선택이 안 잡혔다)');
}

const canvasBox = await page.locator('.meok [data-canvas]').boundingBox();
/** 그림의 오른쪽 절반에 묻은 잉크 — 고른 자리(왼쪽) 밖이다. */
const rightHalf = { x: art.x - canvasBox.x + art.w * 0.55, w: art.w * 0.42 };
const inkRightHalf = () => page.evaluate((rect) => {
  const canvas = document.querySelector('.meok [data-canvas]');
  const dpr = canvas.width / parseFloat(canvas.style.width);
  const x0 = Math.round(rect.x * dpr);
  const width = Math.max(1, Math.round(rect.w * dpr));
  const data = canvas.getContext('2d').getImageData(x0, 0, width, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 120 && data[i + 3] > 200) dark += 1;
  return dark;
}, rightHalf);

const outsideBefore = await inkRightHalf();
await page.click('.meok [data-tool="brush"]');
await page.mouse.move(ax(0.20), ay(0.50));
await page.mouse.down();
await page.mouse.move(ax(0.92), ay(0.50), { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(300);
const outsideAfter = await inkRightHalf();
if (outsideAfter > outsideBefore + 30) problems.push('고른 자리 밖으로 붓이 샜다 (' + outsideBefore + ' → ' + outsideAfter + ')');
if ((await canvasInk()) < 200) problems.push('고른 자리 안에도 안 그려졌다');

/* 선택을 풀면 다시 온 판에 그려진다. */
await page.click('.meok [data-act="deselect"]');
await page.waitForTimeout(200);
await page.mouse.move(ax(0.62), ay(0.75));
await page.mouse.down();
await page.mouse.move(ax(0.90), ay(0.78), { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
if ((await inkRightHalf()) <= outsideAfter + 20) problems.push('선택을 풀었는데도 밖에 안 그려진다');

/* ⑧ 고치기 — 색 보정·필터가 화면에 닿고, 회전이 판 모양을 바꾼다. */
await page.locator('.meok-fix summary').click();
await page.waitForTimeout(150);

/* 필터: 반전 — 어두운 획이 밝아지므로 「어두운 픽셀 수」가 확 준다. */
const darkAll = () => page.evaluate(() => {
  const canvas = document.querySelector('.meok [data-canvas]');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 120 && data[i + 3] > 200) dark += 1;
  return dark;
});
const beforeInvert = await darkAll();
await page.locator('.meok-filters button', { hasText: '반전' }).click();
await page.waitForTimeout(300);
const afterInvert = await darkAll();
if (afterInvert >= beforeInvert) problems.push('반전 필터가 화면에 안 닿았다 (' + beforeInvert + ' → ' + afterInvert + ')');
await page.click('.meok [data-act="undo"]');
await page.waitForTimeout(250);
if (Math.abs((await darkAll()) - beforeInvert) > 60) problems.push('필터 되돌리기가 원래대로 안 돌아온다');

/* 보정: 밝기 슬라이더를 끌면 미리보기가 즉시 바뀐다 */
await page.locator('.meok [data-adjust="brightness"]').fill('0.6');
await page.locator('.meok [data-adjust="brightness"]').dispatchEvent('input');
await page.waitForTimeout(300);
const brightened = await darkAll();
if (brightened >= beforeInvert) problems.push('밝기 미리보기가 안 걸린다 (' + beforeInvert + ' → ' + brightened + ')');
await page.click('.meok [data-act="adjust-reset"]');
await page.waitForTimeout(250);
if (Math.abs((await darkAll()) - beforeInvert) > 60) problems.push('보정 되돌리기가 원래대로 안 돌아온다');

/* 회전: 세로가 긴 판으로 만든 뒤 돌리면 가로세로가 바뀐다 */
const shapeBefore = await artRect();
await page.click('.meok [data-act="rot-right"]');
await page.waitForTimeout(400);
const shapeAfter = await artRect();
const ratioBefore = shapeBefore.w / shapeBefore.h;
const ratioAfter = shapeAfter.w / shapeAfter.h;
if (Math.abs(ratioBefore - 1) > 0.05 && Math.abs(ratioAfter - 1 / ratioBefore) > 0.15) {
  problems.push('90도 회전인데 판 비율이 안 뒤집혔다 (' + ratioBefore.toFixed(2) + ' → ' + ratioAfter.toFixed(2) + ')');
}
await page.click('.meok [data-act="undo"]');
await page.waitForTimeout(400);

/* ⑨ 자동 저장 — 새로고침해도 그리던 게 남아 있다(이 도구의 제일 아픈 구멍이었다). */
page.once('dialog', dialog => dialog.accept());
await page.click('.meok [data-act="new"]');
await page.waitForTimeout(400);
const saveArt = await artRect();
await page.mouse.move(saveArt.x + saveArt.w * 0.3, saveArt.y + saveArt.h * 0.3);
await page.mouse.down();
await page.mouse.move(saveArt.x + saveArt.w * 0.7, saveArt.y + saveArt.h * 0.7, { steps: 10 });
await page.mouse.up();
/* 쉬는 순간에 한 번만 쓴다 — 그 순간을 기다린다. */
await page.waitForFunction(() => /저장됨|Saved|保存/.test(document.querySelector('.meok [data-status]')?.textContent || ''), null, { timeout: 8000 })
  .catch(() => problems.push('자동 저장 표시가 안 뜬다'));
const inkBeforeReload = await canvasInk();

await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.meok', { timeout: 20000 });
await page.waitForTimeout(1200);
const inkAfterReload = await canvasInk();
if (Math.abs(inkAfterReload - inkBeforeReload) > Math.max(60, inkBeforeReload * 0.25)) {
  problems.push('새로고침하니 그림이 달라졌다 (' + inkBeforeReload + ' → ' + inkAfterReload + ')');
}
if (inkAfterReload < 100) problems.push('새로고침 뒤 그림이 사라졌다 (' + inkAfterReload + ')');

/* ⑩ 화면이 넘치지 않는다(가로 스크롤). */
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) problems.push('가로로 ' + overflow + 'px 넘친다');

if (process.argv.includes('--shot')) {
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const shot = path.join(root, 'tmp/meok.png');
  await page.locator('.meok').screenshot({ path: shot });
  console.log('[smoke-meok] 사진 ' + shot);
}

await browser.close();
server.close();

if (errors.length) problems.push('콘솔 오류 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | '));
if (problems.length) {
  console.error('[smoke-meok] ✗\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('[smoke-meok] ✓ 붓·되돌리기·레이어(숨김 반영)·프레임·픽셀 모드·선택영역(밖으로 안 샘)·고치기(필터·보정·회전)·자동 저장(새로고침 생존) — 실제 브라우저');
