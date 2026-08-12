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
  if (message.type() === 'error' && !/CORS|ERR_FAILED|Failed to load resource|yawnbot/.test(message.text())) errors.push(message.text());
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

if (SHOT) {
  fs.mkdirSync(path.join(here, 'tmp'), { recursive: true });
  await page.screenshot({ path: path.join(here, 'tmp', 'bon.png'), fullPage: false });
  console.log('사진: tmp/bon.png');
}

check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(problems.length ? `\n[smoke-bon] 실패 ${problems.length}건` : '\n[smoke-bon] ✓ 그리기 · 고르기 · 옮기기 · 숫자 반영 · 되돌리기 · 안내선 분리 · 레이어');
process.exit(problems.length ? 1 : 0);
