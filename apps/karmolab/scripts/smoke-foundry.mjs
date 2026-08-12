/**
 * 선반 화면 실브라우저 검사 (TASK-KL-254)
 *
 * 여기서 꼭 봐야 하는 것은 **서버가 없을 때**다. 선반은 남의 기계(노트북)를 부르는 첫 화면이라,
 * 그쪽이 꺼져 있을 때 흰 화면이 되면 「사이트가 죽었다」로 읽힌다. 못 읽었으면 그 사실을 적고
 * 다시 할 자리를 줘야 한다.
 *
 * 서버가 있을 때의 그림·종류 나누기는 가짜 응답을 물려 확인한다 — 노트북이 켜져 있든 말든
 * 같은 답이 나와야 검사가 쓸모 있다.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(here));
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
const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/CORS|ERR_FAILED|Failed to load resource|yawnbot|laptop\.mascari4615|선반/.test(message.text())) {
    errors.push(message.text());
  }
});

const problems = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + extra}`);
  if (!ok) problems.push(label);
};

// ★ 서버 주소를 **정확히** 잡는다. `**/foundry*` 로 하면 위젯 번들(js/widgets/foundry/foundry.js)까지
// 걸려 화면이 아예 안 뜬다 — 「서버가 죽었을 때」를 보려다 「위젯이 없을 때」를 보게 된다(실측).
const HOST = 'https://laptop.mascari4615.com';
const SHELF_ANY = HOST + '/foundry**';
const SHELF_LIST = (url) => url.href.startsWith(HOST + '/foundry') && !/\/foundry\/[a-z0-9]+$/.test(url.pathname);
const SHELF_ITEM = (url) => /\/foundry\/[a-z0-9]+$/.test(url.pathname) && url.href.startsWith(HOST);

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#3b4a6b"/></svg>';

/** 노트북 대신 대답하는 가짜 선반. 어떤 판정이든 노트북 상태와 무관해야 한다. */
async function stubShelf(items) {
  await context.route(SHELF_LIST, async (route) => {
    const tools = {};
    for (const item of items) tools[item.tool] = (tools[item.tool] ?? 0) + 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, total: items.length, tools, items })
    });
  });
  await context.route(SHELF_ITEM, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG });
  });
}

/* ── ① 서버가 죽어 있을 때 ─────────────────────── */
await context.route(SHELF_ANY, (route) => route.abort('connectionrefused'));
await page.goto(base + '/apps/karmolab/index.html#foundry', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.fd-wrap', { timeout: 20000 });
await page.waitForTimeout(900);

check('서버가 없어도 화면은 뜬다', await page.evaluate(() => !!document.querySelector('.fd-wrap')));
check('못 읽었다고 적어 준다', await page.evaluate(() => !!document.querySelector('.fd-error')));
check('다시 할 자리를 준다', await page.evaluate(() => !!document.querySelector('.fd-error [data-act="reload"]')));

/* ── ② 서버가 있을 때 ────────────────────────── */
await context.unroute(SHELF_ANY).catch(() => {});
await context.unroute(SHELF_LIST).catch(() => {});
await context.unroute(SHELF_ITEM).catch(() => {});
await stubShelf([
  { id: 'aaa111', tool: 'bon', title: '체력바', mime: 'image/svg+xml', bytes: 900, license: 'CC0-1.0', createdAt: Date.now(), url: '/foundry/aaa111', recipe: { doc: {} } },
  { id: 'bbb222', tool: 'bon', title: '창틀', mime: 'image/svg+xml', bytes: 1200, license: 'CC0-1.0', createdAt: Date.now(), url: '/foundry/bbb222' },
  { id: 'ccc333', tool: 'meok', title: '점 그림', mime: 'image/png', bytes: 4096, license: 'CC0-1.0', createdAt: Date.now(), url: '/foundry/ccc333' }
]);
await page.locator('[data-act="reload"]').first().click();
await page.waitForTimeout(700);

const cards = () => page.evaluate(() => document.querySelectorAll('.fd-card').length);
check('올라온 것이 카드로 보인다', (await cards()) === 3, String(await cards()));
check('종류 칸이 생긴다(전부 + 도구 둘)', await page.evaluate(() => document.querySelectorAll('.fd-tabs button').length) === 3);
check('어느 도구로 만들었는지 보인다', await page.evaluate(() => !!document.querySelector('.fd-tool')));
check('내려받는 자리가 있다', await page.evaluate(() => !!document.querySelector('.fd-acts a[download]')));

// 종류로 나누기 — 잡동사니 한 칸이 되지 않게
await page.locator('.fd-tabs button[data-tool="meok"]').click();
await page.waitForTimeout(250);
check('종류를 고르면 그것만 남는다', (await cards()) === 1, String(await cards()));
await page.locator('.fd-tabs button[data-tool=""]').click();
await page.waitForTimeout(250);
check('전부로 돌아온다', (await cards()) === 3, String(await cards()));

// 만든 도구로 되돌아가는 고리
check('다시 열 설정이 있으면 그 도구로 가는 길이 보인다',
  await page.evaluate(() => !!document.querySelector('.fd-acts a[href="#bon"]')));

/* ── ③ 빈 선반 ──────────────────────────────── */
await context.unroute(SHELF_ANY).catch(() => {});
await context.unroute(SHELF_LIST).catch(() => {});
await context.unroute(SHELF_ITEM).catch(() => {});
await stubShelf([]);
await page.locator('[data-act="reload"]').first().click();
await page.waitForTimeout(600);
check('비었으면 비었다고 말한다', await page.evaluate(() => !!document.querySelector('.fd-empty')));

check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(problems.length ? `\n[smoke-foundry] 실패 ${problems.length}건` : '\n[smoke-foundry] ✓ 서버 없음 · 카드 · 종류 나누기 · 도구로 가는 길 · 빈 선반');
process.exit(problems.length ? 1 : 0);
