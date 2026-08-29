/**
 * 안 보는 위젯이 계속 도는가 (change.widget-idle-cost).
 *
 * 재는 법: 창을 열기 전에 `setInterval`·`requestAnimationFrame` 을 감싸 **콜백이 실제로 불린 수**를
 * 센다. 첫 화면에서 2초, 위젯들을 열었다 첫 화면으로 돌아온 뒤 다시 2초. 두 수의 차이가
 * 곧 「안 꺼진 것」이다.
 *
 * 두 가지를 같이 본다 — 하나만 보면 반대쪽으로 넘어진다:
 *  ① 나온 뒤에는 **멈춰야** 한다 (정원 하나가 rAF 를 2초에 1100번 더 돌렸다, 2026-08-29)
 *  ② 보고 있는 동안에는 **돌아야** 한다 (다 멈춰 놓고 초록을 받는 것을 막는다)
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

const failures = [];

const WIDGETS = process.argv.slice(2).length ? process.argv.slice(2) : ['hourglass', 'moon', 'particle', 'news'];
for (const id of WIDGETS) {
  await page.evaluate((widget) => { location.hash = widget; }, id);
  await page.waitForTimeout(2500);
}

/* ② 보고 있는 동안에는 돈다 — 마지막에 연 것이 아직 앞에 있다. 그림이 있는 위젯만 잰다
   (전부가 매 프레임 그리는 것은 아니다 — 안 그리는 것이 정상인 위젯도 많다). */
const LIVE = WIDGETS.filter((id) => ['garden', 'particle', 'bluemarble'].includes(id));
if (LIVE.length) {
  await page.evaluate((widget) => { location.hash = widget; }, LIVE[LIVE.length - 1]);
  await page.waitForTimeout(1200);
  const live = await sample(`${LIVE[LIVE.length - 1]} 를 보고 있는 동안`);
  if (live.raf < 60) failures.push(`보고 있는데 안 돈다 — ${LIVE[LIVE.length - 1]} 의 rAF ${live.raf}/2초 (멈춰 놓고 초록을 받는 것을 막는다)`);
}
await page.evaluate(() => { location.hash = ''; });
await page.waitForTimeout(2500);

const after = await sample(`${WIDGETS.length}개 열었다 나온 뒤`);
console.log('');
console.log(`남은 것: interval +${after.interval - base.interval} · rAF +${after.raf - base.raf} · timeout +${after.timeout - base.timeout}`);
const dom = await page.evaluate(() => document.querySelectorAll('.tool-page').length);
const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
console.log(`화면에 남아 있는 위젯 장: ${dom} · canvas: ${canvases}`);

/* 문턱: 한 루프분(60fps × 2초)까지는 봐 준다 — 셸 자신이 도는 몫이 있다. */
const RAF_BUDGET = 120;
const INTERVAL_BUDGET = 20;
if (after.raf - base.raf > RAF_BUDGET) {
  failures.push(`나왔는데 계속 그린다 — rAF +${after.raf - base.raf}/2초 (문턱 ${RAF_BUDGET}). Toolbox.raf 로 바꾼다`);
}
if (after.interval - base.interval > INTERVAL_BUDGET) {
  failures.push(`나왔는데 타이머가 남는다 — interval +${after.interval - base.interval}/2초 (문턱 ${INTERVAL_BUDGET}). Toolbox.onHide 로 멈춘다`);
}

await browser.close();
site.close();

if (failures.length) {
  console.error(`[widget-idle] 실패 ${failures.length}건`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('[widget-idle] OK — 나오면 멈추고, 보고 있으면 돈다');
