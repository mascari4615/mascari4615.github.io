/**
 * 닫은 뒤에도 남는 것 — 위젯 뒷정리 검사 (TASK-KL-201 ㉓).
 *
 * 왜 있나: 셸은 위젯을 갈아 끼운다(`Toolbox.register` 재등록 = 교체). 위젯이 타이머·전역
 * 리스너를 걸었으면 `Toolbox.onDispose(fn)` 로 뒷정리를 맡겨야 하는데, 안 맡기면 **화면을 떠난
 * 뒤에도 계속 돈다**. 증상이 조용하다: 화면은 멀쩡하고, 한참 뒤에 「요즘 느리다」로만 나타난다.
 * 계기판은 「지금 프레임이 도나」까지는 보여 주지만 「누가 안 거뒀나」는 못 짚는다.
 *
 * 어떻게: **게이트에서만** 타이머·애니메이션 루프를 세는 카운터를 페이지에 심는다
 * (`addInitScript`). 상시로 감싸면 그 자체가 비용이라 앱에는 안 넣는다 — 계측이 비용이면 안 된다.
 * 그리고 위젯을 열었다 홈으로 돌아가기를 반복하며 **바퀴마다 남는 수가 느는지** 본다.
 *
 * 한 번 열고 재면 못 잡는다: 처음 열 때 만드는 것(한 번만 만드는 캐시·감시자)은 정상이다.
 * **두 바퀴째부터 또 느는 것**이 새는 것이다.
 *
 * 사용: node scripts/smoke-widget-leak.mjs             (npm run test:leak)
 *       node scripts/smoke-widget-leak.mjs --selftest  ← 일부러 새게 만들어 **빨간불이 나는지** 확인
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));

if (!fs.existsSync(path.join(root, 'js/toolbox.js'))) {
  console.log('[leak] 못 돌림 — js/toolbox.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
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

const browser = await chromium.launch();
const page = await browser.newPage();

/* 카운터를 **첫 스크립트보다 먼저** 심는다. 앱이 걸어 둔 것부터 세야 하므로 나중에 심으면
   이미 걸린 것을 놓친다. 세기만 하고 동작은 그대로 흘려보낸다. */
await page.addInitScript(() => {
  const box = { intervals: 0, rafLoops: 0 };
  window.__leak = box;
  const realSetInterval = window.setInterval;
  const realClearInterval = window.clearInterval;
  window.setInterval = function (...args) {
    box.intervals += 1;
    return realSetInterval.apply(window, args);
  };
  window.clearInterval = function (...args) {
    box.intervals -= 1;
    return realClearInterval.apply(window, args);
  };
  /* 애니메이션 루프는 「스스로 다시 예약하는 것」만 문제다 — 한 번짜리는 저절로 끝난다.
     1초 동안 몇 번 예약되는지로 「도는 루프가 몇 개인가」를 가늠한다. */
  const realRaf = window.requestAnimationFrame;
  let rafCalls = 0;
  window.requestAnimationFrame = function (cb) {
    rafCalls += 1;
    return realRaf.call(window, cb);
  };
  realSetInterval(() => {
    box.rafLoops = rafCalls;
    rafCalls = 0;
  }, 1000);
});

await page.goto(BASE + '/apps/karmolab/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => typeof Toolbox !== 'undefined', null, { timeout: 30000 });
await page.waitForTimeout(3000);

/** 화면에서 잠깐 살다 가는 것들 — 타이머·애니메이션을 쓰는 쪽으로 골랐다. */
const WIDGETS = ['reaction', 'particle', 'bounce', 'moon', 'hourglass', 'eyes'];

async function idleCounts() {
  await page.evaluate(() => Toolbox.switchPage('home'));
  await page.waitForTimeout(1600); // 카운터가 한 바퀴 돌 시간
  return page.evaluate(() => ({ ...window.__leak }));
}

const SELFTEST = process.argv.includes('--selftest');

const rounds = [];
for (let round = 0; round < 3; round++) {
  /* 늘 초록인 검사는 없는 것과 같다 — 일부러 안 거두는 타이머를 바퀴마다 하나 남겨 본다. */
  if (SELFTEST) await page.evaluate(() => window.setInterval(() => {}, 100000));
  for (const id of WIDGETS) {
    await page.evaluate((widget) => Toolbox.switchPage(widget), id);
    await page.waitForTimeout(700);
  }
  rounds.push(await idleCounts());
  console.log(`[leak] ${round + 1}바퀴 뒤 홈 — 남은 타이머 ${rounds[round].intervals} · 도는 프레임 루프 초당 ${rounds[round].rafLoops}`);
}

await browser.close();
server.close();

/* 첫 바퀴에 생긴 것은 정상일 수 있다(한 번만 만드는 것). **그 뒤로도 계속 느는지**가 신호다. */
const growth = rounds[2].intervals - rounds[1].intervals;
const rafGrowth = rounds[2].rafLoops - rounds[1].rafLoops;
console.log(`[leak] 2→3바퀴 증가: 타이머 ${growth} · 프레임 루프 ${rafGrowth}`);
if (growth > 0 || rafGrowth > 20) {
  console.error('[leak] FAIL — 화면을 떠난 뒤에도 남는 것이 바퀴마다 늘어난다.');
  console.error('  위젯이 `build` 안에서 `Toolbox.onDispose(fn)` 로 타이머·전역 리스너를 맡겼는지 보라.');
  console.error('  (DOM 리스너는 노드와 함께 죽으므로 적을 필요 없다 — 타이머·rAF·window 리스너만.)');
  process.exit(1);
}
console.log('[leak] OK — 바퀴를 돌아도 남는 것이 늘지 않는다');
