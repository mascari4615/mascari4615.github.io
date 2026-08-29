/**
 * 위젯을 열었다 나오면 그 위젯의 타이머가 계속 도는가 (change.widget-idle-cost).
 *
 * 아직 **게이트가 아니다** — 지금 코드로 돌리면 빨갛다(정원 하나가 초당 315번을 계속 그린다).
 * 고치는 판에서 문턱을 걸고 `data/gate-list.json` 에 넣는다.
 *
 * 재는 법: 창을 열기 전에 setInterval / requestAnimationFrame 을 감싸 **콜백이 실제로 불린 수**를
 * 센다. 첫 화면에서 2초, 위젯 넷을 열었다 첫 화면으로 돌아온 뒤 다시 2초. 두 수의 차이가 곧
 * 「안 꺼진 것」이다.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const site = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x');
  try {
    const body = await readFile(path.join(SITE_ROOT, decodeURIComponent(url.pathname)));
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(url.pathname)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('no');
  }
});
site.listen(8813, '127.0.0.1');
const PAGE = 'http://127.0.0.1:8813/apps/karmolab/index.html';

const browser = await chromium.launch();
const context = await browser.newContext();
await context.route('https://yawnbot.mascari4615.com/**', (route) => route.abort());
await context.addInitScript(() => {
  window.__tick = { interval: 0, raf: 0, timeout: 0 };
  const si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => si(() => { window.__tick.interval += 1; fn(); }, ms, ...rest);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => raf((t) => { window.__tick.raf += 1; fn(t); });
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => st(() => { window.__tick.timeout += 1; typeof fn === 'function' && fn(); }, ms, ...rest);
});
const page = await context.newPage();
await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

async function sample(label) {
  const before = await page.evaluate(() => ({ ...window.__tick }));
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => ({ ...window.__tick }));
  const delta = { interval: after.interval - before.interval, raf: after.raf - before.raf, timeout: after.timeout - before.timeout };
  console.log(`${label.padEnd(28)} interval ${String(delta.interval).padStart(5)} · rAF ${String(delta.raf).padStart(5)} · timeout ${String(delta.timeout).padStart(5)}  (2초 동안)`);
  return delta;
}

const base = await sample('첫 화면 (아무것도 안 열고)');

const WIDGETS = process.argv.slice(2).length ? process.argv.slice(2) : ['hourglass', 'moon', 'particle', 'news'];
for (const id of WIDGETS) {
  await page.evaluate((widget) => { location.hash = widget; }, id);
  await page.waitForTimeout(2500);
}
await page.evaluate(() => { location.hash = ''; });
await page.waitForTimeout(2500);

const after = await sample(`${WIDGETS.length}개 열었다 나온 뒤`);
console.log('');
console.log(`남은 것: interval +${after.interval - base.interval} · rAF +${after.raf - base.raf} · timeout +${after.timeout - base.timeout}`);
const dom = await page.evaluate(() => document.querySelectorAll('.tool-page').length);
const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
console.log(`화면에 남아 있는 위젯 장: ${dom} · canvas: ${canvases}`);

await browser.close();
site.close();
