/**
 * 「동반자」 위젯이 **실제로 봇에 붙어 말을 거는지** (TASK-KAR-201 / KarmoLab 몸).
 *
 * 왜 필요하냐: 이 위젯의 값은 전부 다른 프로세스(로컬 봇)와의 경계에 있다. 화면만 그려도
 * 단위 시험은 초록이고, 붙는 자리가 틀리면(포트·CORS·응답 모양) 화면은 「지금은 안 잡힌다」를
 * 조용히 띄운다 — 사람이 볼 때까지 아무도 모른다.
 *
 * 봇이 안 떠 있으면 **실패가 아니라 건너뜀**이다(전제가 없는 것과 고장은 다르다).
 *   봇 띄우기: cd packages/companion && COMPANION_BRAIN=echo COMPANION_DESKTOP=0 npm run face
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 봇 = process.env.COMPANION_BASE ?? 'http://127.0.0.1:4620';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

try {
  const res = await fetch(`${봇}/ears`, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.log(`[smoke-companion] 건너뜀 — 봇이 ${봇} 에 안 떠 있다 (${e.message})`);
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('nope');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${base}/apps/karmolab/`);
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', {
  timeout: 15000,
});
// 도구는 부를 때 비로소 받아진다 — 받아진 뒤 다시 불러야 열린다.
await page.evaluate(() => Toolbox.switchPage('companion'));
await page.waitForFunction(
  () => {
    if (document.getElementById('cmpDot')) return true;
    Toolbox.switchPage('companion');
    return false;
  },
  { timeout: 20000, polling: 500 }
);

// ① 붙었나 — 초록불 + 말 걸기 칸이 열려야 한다.
//    안 켜지면 **화면이 스스로 적어 둔 이유**를 그대로 보여 준다. 「시간 초과」만 남으면
//    붙는 자리가 틀린 건지(포트·CORS) 봇이 죽은 건지 못 가른다 — 실제로 한 번 그랬다.
try {
  await page.waitForFunction(() => document.getElementById('cmpDot')?.classList.contains('on') === true, {
    timeout: 15000,
  });
} catch {
  const 화면이한말 = await page.evaluate(() => ({
    윗줄: document.getElementById('cmpText')?.textContent ?? '',
    아랫줄: document.getElementById('cmpSub')?.textContent ?? '',
  }));
  await browser.close();
  server.close();
  console.error(`[smoke-companion] X  봇은 떠 있는데 위젯이 못 붙었다 — 화면: "${화면이한말.윗줄} · ${화면이한말.아랫줄}"`);
  console.error(`[smoke-companion]    창에서 터진 것: ${errors.length === 0 ? '없음' : errors.join(' / ')}`);
  console.error('[smoke-companion]    의심 자리 = 붙는 주소(포트) · 봇이 이 기계 창에 문을 여는가(CORS)');
  process.exit(1);
}
const 상태 = await page.evaluate(() => ({
  곁에: document.getElementById('cmpText')?.textContent ?? '',
  아래: document.getElementById('cmpSub')?.textContent ?? '',
  칸열림: document.getElementById('cmpInput')?.disabled === false,
}));

// ②-0 창·몸·목소리가 화면에 뜨나 — 오늘 사고 셋이 전부 「조용히 빠짐」이었다.
const 칸 = await page.evaluate(() =>
  [...document.querySelectorAll('#cmpBits .cmp-bit')].map((el) => el.textContent ?? ''),
);

// ② 말이 실제로 건너가나 — 화면에서 치고, 봇의 기록에 그 말이 남는지 본다.
//    화면만 보면 「보낸 척」을 못 가른다.
const 말 = `스모크 ${Date.now()}`;
await page.fill('#cmpInput', 말);
await page.click('#cmpSend');
await page.waitForFunction((찾을말) => (document.getElementById('cmpLog')?.textContent ?? '').includes(찾을말), 말, {
  timeout: 15000,
});
const 기록 = await (await fetch(`${봇}/history`, { signal: AbortSignal.timeout(4000) })).json();
const 봇도들었나 = 기록.some((e) => e.text === 말);

await browser.close();
server.close();

const 탈 = [];
if (상태.칸열림 === false) 탈.push('붙었다면서 말 걸기 칸이 잠겨 있다');
if (봇도들었나 === false) 탈.push('화면엔 떴는데 봇 기록엔 그 말이 없다');
if (errors.length > 0) 탈.push(`창에서 터진 게 있다: ${errors.join(' / ')}`);
// 「곁에 있다」만 보고 끝내면, 몸이 큐브로 물러서거나 목소리가 빠진 걸 화면이 여전히 못 잡는다.
if (칸.length === 0) 탈.push('창·몸·목소리 칸이 하나도 안 떴다');
for (const 있어야할것 of ['창', '몸', '목소리']) {
  if (칸.some((c) => c.startsWith(있어야할것)) === false) 탈.push(`「${있어야할것}」 칸이 없다`);
}

console.log(`[smoke-companion] ${상태.곁에} · ${상태.아래}`);
console.log(`[smoke-companion] 말 걸기 → 화면 O · 봇 기록 ${봇도들었나 ? 'O' : 'X'}`);
console.log(`[smoke-companion] 상태 칸: ${칸.join(' | ') || '(없음)'}`);
if (탈.length > 0) {
  console.error(`[smoke-companion] X  ${탈.join(' | ')}`);
  process.exit(1);
}
console.log('[smoke-companion] OK — 위젯이 봇에 붙어 말을 건넸다');
