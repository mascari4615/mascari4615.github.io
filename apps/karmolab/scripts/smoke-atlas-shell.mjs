/**
 * smoke-atlas-shell — **진짜 셸에서 지도가 뜨나** (TASK-KAR-233).
 *
 * 2026-08-21, 사람이 지도를 열었더니 「이 화면을 못 열었어요」만 떴다. 그때 이 지도에는
 * **자가 스물여섯** 붙어 있었고 전부 초록이었다. 이유가 셋이었는데 셋 다 같은 병이다 —
 * 자들이 **가짜 셸**을 만들어 놓고 위젯을 얹어 쟀다:
 *
 *  ① `window.Toolbox` 를 자기가 만들어 넣었다. 진짜 셸의 `Toolbox` 는 `const` 라
 *     **window 에 안 붙는다** — 위젯은 등록 자체를 안 하고 있었다.
 *  ② 등록 모양이 `{ render }` 였다. 셸은 `tabs[].build` 로만 그린다 — 등록돼도
 *     화면은 영영 「장비 꺼내는 중이에요…」.
 *  ③ 말 묶음(`i18n/<언어>/memo-atlas.json`)이 없었다 — 셸은 도구를 늦게 부를 때마다
 *     그 묶음을 받으러 가고, 없으면 도구가 안 뜬다.
 *
 * 셋 다 **위젯 안**이 아니라 **위젯과 셸 사이**에 있다. 그 사이를 재려면 진짜 셸을 띄워야 한다.
 * 그래서 이 자는 파일을 그대로 내주는 서버를 세우고 `index.html#memo-atlas` 를 연다.
 * 가짜를 하나도 안 만든다 — 그게 요점이다.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const KARMOLAB = path.resolve(HERE, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

if (!fs.existsSync(path.join(KARMOLAB, 'js/widgets/memo-atlas.js'))) {
  console.log('[atlas-shell] 번들이 없다 — 검사 건너뜀 (먼저 build)');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('nope');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  return fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${base}/apps/karmolab/index.html#memo-atlas`, { waitUntil: 'load', timeout: 60000 });

/* 늦게 불러오는 도구다 — 캔버스가 생길 때까지 기다린다. 안 생기면 그게 결과다. */
let ok = true;
try {
  await page.waitForSelector('#page-memo-atlas .atlas-canvas', { timeout: 45000 });
} catch { ok = false; }

const state = await page.evaluate(() => ({
  canvas: !!document.querySelector('#page-memo-atlas .atlas-canvas'),
  dots: (window.__atlasPlaced || []).length,
  /* 셸이 「못 열었다」/「꺼내는 중」 을 띄운 채 멈춰 있나 */
  failed: !!document.querySelector('[data-kl-load-failed]'),
  stuck: /장비 꺼내는 중|불러오는 중/.test(document.querySelector('#page-memo-atlas')?.innerText || ''),
  text: (document.querySelector('#page-memo-atlas')?.innerText || '').slice(0, 120).replace(/\n+/g, ' / '),
}));

await browser.close();
server.close();

console.log(`[atlas-shell] 캔버스 ${state.canvas ? '있다' : '**없다**'} · 점 ${state.dots}개`);
console.log(`  화면 첫 줄: ${state.text}`);

const bad = [];
if (!ok || !state.canvas) bad.push('진짜 셸에서 지도가 안 뜬다 (캔버스가 안 생긴다)');
if (state.failed) bad.push('셸이 「이 화면을 못 열었어요」를 띄웠다 — 위젯이 등록을 못 했다');
if (state.stuck) bad.push('「장비 꺼내는 중」에서 멈췄다 — 등록 모양이 셸과 다르다(tabs[].build 인가)');
if (state.dots < 100) bad.push(`점이 ${state.dots}개뿐 — 자료를 못 읽었거나 그리기가 멈췄다`);
if (errors.length) bad.push(`화면에서 던진 것: ${errors[0]}`);

if (bad.length) {
  console.log('[atlas-shell] **진짜 셸에서는 안 뜬다**');
  for (const b of bad) console.log('  - ' + b);
  console.log('  위젯 안이 아니라 **위젯과 셸 사이**를 봐라: 등록 이름(맨바깥 Toolbox) · 등록 모양(tabs[].build) · 말 묶음.');
  process.exit(1);
}
console.log('[atlas-shell] 진짜 셸에서 지도가 뜬다 (가짜를 하나도 안 만들고 쟀다)');
