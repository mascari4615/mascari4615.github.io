/**
 * 「본」 실브라우저 검사 — 진짜로 그어서 도형이 생기는지 (TASK-KL-254)
 *
 * 단위 검사(`test-bon.mjs`)는 셈이 맞는지만 본다. 화면이 죽어 있어도 초록일 수 있다.
 * 여기서는 실제로 끌어서 도형을 만들고, 골라서 옮기고, 되돌려서 사라지는지까지 본다.
 *
 * 사용: node scripts/smoke-bon.mjs [--shot]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(here));
const SHOT = process.argv.includes('--shot');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/CORS|ERR_FAILED|Failed to load resource|yawnbot|laptop\.mascari4615|선반/.test(message.text())) errors.push(message.text());
});

const problems = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + extra}`);
  if (!ok) problems.push(label);
};

await page.goto(base + '/apps/karmolab/index.html#bon', { waitUntil: 'load', timeout: 30000 });
try {
  await page.waitForSelector('.bon-wrap', { timeout: 20000 });
} catch (error) {
  console.error('[smoke-bon] 화면이 안 떴다', errors);
  throw error;
}
await page.waitForTimeout(500);

/** 그림 안에 도형이 몇 개나 그려졌나 — 안내선(덧그림)은 따로 있으니 안 섞인다. */
const shapes = () => page.evaluate(() => document.querySelectorAll('.bon-art svg rect, .bon-art svg ellipse').length);
const handles = () => page.evaluate(() => document.querySelectorAll('.bon-guides .bon-handle').length);

check('빈 판에서 시작한다', (await shapes()) === 0, String(await shapes()));

/** 판 위 상대 위치를 화면 좌표로. 판 밖을 누르면 「아무 일도 안 일어남」이 고장으로 잘못 읽힌다. */
const stage = await page.locator('.bon-stage').boundingBox();
const at = (fx, fy) => ({ x: stage.x + stage.width * fx, y: stage.y + stage.height * fy });

// ── 그리기 ────────────────────────────────
let p = at(0.15, 0.2);
let q = at(0.7, 0.8);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await page.mouse.move(q.x, q.y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
check('끌면 도형이 생긴다', (await shapes()) === 1, String(await shapes()));
check('생긴 도형은 골라져 있다(손잡이 8개)', (await handles()) === 8, String(await handles()));

// ── 오른쪽 숫자가 실제 값을 비춘다 ─────────────
const widthShown = await page.locator('.bon-side input[data-box="w"]').inputValue();
check('오른쪽에 너비가 뜬다', Number(widthShown) > 0, widthShown);

// ── 둥글기를 돌리면 그림이 바뀐다 ───────────────
const before = await page.evaluate(() => document.querySelector('.bon-art svg').outerHTML);
const radius = page.locator('.bon-side input[data-num="radius"]');
await radius.fill('10');
await radius.dispatchEvent('input');
await page.waitForTimeout(150);
const after = await page.evaluate(() => document.querySelector('.bon-art svg').outerHTML);
check('둥글기를 돌리면 그림이 달라진다', before !== after);

// ── 살짝 눌렀다 떼면 빈 도형이 안 쌓인다 ──────────
const tap = at(0.9, 0.1);
await page.mouse.move(tap.x, tap.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(150);
check('살짝 눌렀다 떼면 빈 도형이 안 생긴다', (await shapes()) === 1, String(await shapes()));

// ── 고르기로 바꿔서 옮기기 ────────────────────
await page.keyboard.press('v');
await page.waitForTimeout(100);
const mid = at(0.4, 0.5);
const moved = at(0.5, 0.55);
await page.mouse.move(mid.x, mid.y);
await page.mouse.down();
await page.mouse.move(moved.x, moved.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const xAfterMove = Number(await page.locator('.bon-side input[data-box="x"]').inputValue());
check('고른 도형을 끌면 자리가 옮겨진다', xAfterMove > 0, String(xAfterMove));

// ── 되돌리기 ─────────────────────────────
await page.locator('.bon-bar [data-act="undo"]').click();
await page.waitForTimeout(150);
await page.locator('.bon-bar [data-act="undo"]').click();
await page.waitForTimeout(200);
check('두 번 되돌리면 도형이 사라진다', (await shapes()) === 0, String(await shapes()));
await page.locator('.bon-bar [data-act="redo"]').click();
await page.waitForTimeout(200);
check('다시 하면 되살아난다', (await shapes()) === 1, String(await shapes()));

// ── 안내선이 저장물에 안 섞인다 ──────────────────
const artHasGuides = await page.evaluate(() => !!document.querySelector('.bon-art .bon-handle, .bon-art .bon-grid'));
check('안내선은 그림에 안 섞인다', !artHasGuides);


// ── 레이어 ────────────────────────────────
const layerRows = () => page.evaluate(() => document.querySelectorAll('.bon-layers .bon-layer').length);
check('레이어가 둘 보인다', (await layerRows()) === 2, String(await layerRows()));

await page.locator('.bon-layers [data-lact="add"]').click();
await page.waitForTimeout(150);
check('레이어를 더 만든다', (await layerRows()) === 3, String(await layerRows()));

// 새 겹에 그리면 그 겹에 들어간다
await page.keyboard.press('r');
const r1 = at(0.2, 0.6);
const r2 = at(0.45, 0.9);
await page.mouse.move(r1.x, r1.y);
await page.mouse.down();
await page.mouse.move(r2.x, r2.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const counts = await page.evaluate(() => [...document.querySelectorAll('.bon-layers .bon-layer-count')].map((n) => Number(n.textContent)));
check('새 도형은 고른 겹에 들어간다', counts[0] === 1, JSON.stringify(counts));

// 숨기면 화면에서 사라진다
const shapesBefore = await shapes();
await page.locator('.bon-layers .bon-eye').first().click();
await page.waitForTimeout(200);
check('겹을 숨기면 그림에서 빠진다', (await shapes()) === shapesBefore - 1, String(await shapes()));
await page.locator('.bon-layers .bon-eye').first().click();
await page.waitForTimeout(150);
check('다시 보이면 돌아온다', (await shapes()) === shapesBefore, String(await shapes()));

// 합치기
await page.locator('.bon-layers [data-lact="merge"]').click();
await page.waitForTimeout(200);
check('아래에 합치면 겹이 줄고 그림은 그대로', (await layerRows()) === 2 && (await shapes()) === shapesBefore,
  (await layerRows()) + ' / ' + (await shapes()));


// ── 9-slice ───────────────────────────────
await page.keyboard.press('s');
await page.waitForTimeout(200);
const sliceLines = () => page.evaluate(() => document.querySelectorAll('.bon-guides .bon-slice').length);
check('9-slice 를 켜면 선 넷이 뜬다', (await sliceLines()) === 4, String(await sliceLines()));

// 왼쪽 선을 잡아 오른쪽으로 끈다 — 선이 실제로 움직여야 한다
const lineX = () => page.evaluate(() => {
  const d = document.querySelector('.bon-guides .bon-slice').getAttribute('d');
  return Number(d.match(/M([\d.]+)/)[1]);
});
const x0 = await lineX();
const from = { x: stage.x + x0 * 2 + 1, y: stage.y + stage.height * 0.5 };
const to = { x: from.x + 40, y: from.y };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const x1 = await lineX();
check('경계선을 끌면 움직인다', x1 > x0, x0 + ' → ' + x1);

const guidesInArt = await page.evaluate(() => !!document.querySelector('.bon-art .bon-slice'));
check('경계선도 그림에 안 섞인다', !guidesInArt);


// ── 선 도구 ───────────────────────────────
await page.keyboard.press('l');
await page.waitForTimeout(100);
const paths = () => page.evaluate(() => document.querySelectorAll('.bon-art svg path').length);
const p0 = at(0.15, 0.15);
const p1 = at(0.6, 0.15);   // 곧은 가로선 — 높이 0 이라 「크기 0」 판정에 걸리면 안 된다
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
await page.mouse.move(p1.x, p1.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
check('곧은 가로선이 살아남는다', (await paths()) === 1, String(await paths()));

// 그 선을 끌어서 옮긴다 — 경로는 네모로 못 옮기므로 따로 민다
await page.keyboard.press('v');
await page.waitForTimeout(100);
const lineMid = at(0.375, 0.15);
await page.mouse.move(lineMid.x, lineMid.y);
await page.mouse.down();
await page.mouse.move(lineMid.x, lineMid.y + 30, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const yAfter = Number(await page.locator('.bon-side input[data-box="y"]').inputValue());
check('선을 끌면 따라 움직인다', yAfter > 0, String(yAfter));

// ── 시작점 ────────────────────────────────
const shapesBeforeSeed = await shapes();
await page.locator('.bon-foot [data-seed="button"]').click();
await page.waitForTimeout(250);
check('시작점을 얹으면 도형이 늘어난다', (await shapes()) > shapesBeforeSeed, (await shapes()) + ' vs ' + shapesBeforeSeed);
await page.locator('.bon-bar [data-act="undo"]').click();
await page.waitForTimeout(200);
check('시작점도 되돌려진다', (await shapes()) === shapesBeforeSeed, String(await shapes()));


// ── 선반 ──────────────────────────────────
// 서버 없이도 화면 쪽 규칙은 지켜져야 한다: 열쇠가 없으면 넣는 자리를 먼저 보여 준다.
await page.evaluate(() => localStorage.removeItem('karmolab_foundry_token'));
await page.locator('.bon-bar [data-act="shelf"]').click();
await page.waitForTimeout(200);
const askedToken = await page.evaluate(() => !!document.querySelector('.bon-shelf [data-shelf-token]'));
check('열쇠가 없으면 넣는 자리를 먼저 보여 준다', askedToken);
await page.locator('.bon-shelf [data-shelf="close"]').click();
await page.waitForTimeout(150);
check('닫으면 선반이 사라진다', await page.evaluate(() => document.querySelector('.bon-shelf').hidden));

// 선반이 안 열려도 도구는 계속 돈다 (서버가 죽어 있어도 그림은 그려져야 한다)
await page.locator('.bon-bar [data-act="shelf-open"]').click();
await page.waitForTimeout(1200);
const stillWorks = await page.evaluate(() => !!document.querySelector('.bon-art svg'));
check('선반이 안 열려도 판은 살아 있다', stillWorks);
await page.evaluate(() => { const s = document.querySelector('.bon-shelf'); if (s) s.hidden = true; });



// ── 정렬 ──────────────────────────────────
// 선반이 열린 채면 판을 눌러도 도형이 안 생긴다(선반이 위를 덮는다) — 먼저 확실히 닫는다.
await page.evaluate(() => { const shelf = document.querySelector('.bon-shelf'); if (shelf) shelf.hidden = true; });
await page.keyboard.press('r');
const a1 = at(0.1, 0.1);
const a2 = at(0.4, 0.5);
await page.mouse.move(a1.x, a1.y);
await page.mouse.down();
await page.mouse.move(a2.x, a2.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(250);
check('정렬 검사용 도형이 골라져 있다', await page.evaluate(() => !!document.querySelector('.bon-side input[data-box="x"]')));

const readBox = async () => ({
  x: Number(await page.locator('.bon-side input[data-box="x"]').inputValue()),
  w: Number(await page.locator('.bon-side input[data-box="w"]').inputValue())
});
const docW = Number(await page.locator('.bon-bar input[data-doc-w]').inputValue());

await page.locator('.bon-side [data-align="right"]').click();
await page.waitForTimeout(200);
let box = await readBox();
check('오른쪽에 붙인다', Math.abs(box.x + box.w - docW) <= 1, JSON.stringify(box) + ' 판 ' + docW);

const wBefore = box.w;
await page.locator('.bon-side [data-align="hcenter"]').click();
await page.waitForTimeout(200);
box = await readBox();
check('가운데로 옮겨도 크기는 그대로', box.w === wBefore, box.w + ' vs ' + wBefore);
check('가운데면 좌우가 같다', Math.abs(box.x - (docW - box.w) / 2) <= 1, JSON.stringify(box));

await page.locator('.bon-side [data-fit="8"]').click();
await page.waitForTimeout(200);
box = await readBox();
check('여백 8 로 꽉 채운다', box.x === 8 && box.w === docW - 16, JSON.stringify(box));

// 되돌리면 고른 것이 풀려 오른쪽 패널이 빈다 — 그림 쪽에서 확인한다.
const lastRectWidth = () => page.evaluate(() => {
  const rects = [...document.querySelectorAll('.bon-art svg rect')];
  return rects.length ? Number(rects[rects.length - 1].getAttribute('width')) : -1;
});
const fitted = await lastRectWidth();
await page.locator('.bon-bar [data-act="undo"]').click();
await page.waitForTimeout(250);
check('맞추기도 되돌려진다', (await lastRectWidth()) !== fitted, fitted + ' → ' + (await lastRectWidth()));

// ── 펜 ────────────────────────────────────
await page.keyboard.press('p');
await page.waitForTimeout(120);
const pathCount = () => page.evaluate(() => document.querySelectorAll('.bon-art svg path').length);
const beforePen = await pathCount();
for (const [fx, fy] of [[0.2, 0.25], [0.5, 0.2], [0.55, 0.5]]) {
  const pt = at(fx, fy);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(120);
}
check('누를 때마다 점이 붙는다(도형 하나로)', (await pathCount()) === beforePen + 1, String(await pathCount()));
const dLen = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.bon-art svg path')];
  return (paths[paths.length - 1].getAttribute('d').match(/L/g) || []).length;
});
check('점 셋이면 이음선이 둘', dLen === 2, String(dLen));

// Enter 로 마치기 — 열린 채로
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('Enter 로 마치면 도형이 남는다', (await pathCount()) === beforePen + 1, String(await pathCount()));
const closedAfterEnter = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.bon-art svg path')];
  return paths[paths.length - 1].getAttribute('d').includes('Z');
});
check('Enter 는 안 닫는다', !closedAfterEnter);

// 되돌리기 한 번으로 통째로 사라진다(점마다 쌓이지 않는다)
await page.locator('.bon-bar [data-act="undo"]').click();
await page.waitForTimeout(200);
check('되돌리기 한 번에 통째로 사라진다', (await pathCount()) === beforePen, String(await pathCount()));

// Esc 취소 — 짓던 것이 남지 않는다
await page.keyboard.press('p');
for (const [fx, fy] of [[0.7, 0.3], [0.8, 0.4]]) {
  const pt = at(fx, fy);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(100);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Esc 로 취소하면 짓던 것이 안 남는다', (await pathCount()) === beforePen, String(await pathCount()));

if (SHOT) {
  fs.mkdirSync(path.join(here, 'tmp'), { recursive: true });
  await page.screenshot({ path: path.join(here, 'tmp', 'bon.png'), fullPage: false });
  console.log('사진: tmp/bon.png');
}

check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(problems.length ? `\n[smoke-bon] 실패 ${problems.length}건` : '\n[smoke-bon] ✓ 그리기 · 고르기 · 옮기기 · 숫자 반영 · 되돌리기 · 안내선 분리 · 레이어 · 9-slice · 선 · 펜 · 시작점 · 정렬 · 선반');
process.exit(problems.length ? 1 : 0);
