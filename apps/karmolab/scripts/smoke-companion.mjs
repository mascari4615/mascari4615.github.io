/**
 * 동반자 위젯이 **실제로 봇에 붙어 말을 거는지** (TASK-KAR-201 / KarmoLab 몸).
 *
 * 왜 필요하냐: 이 위젯의 값은 전부 다른 프로세스(로컬 봇)와의 경계에 있다. 화면만 그려도
 * 단위 시험은 초록이고, 붙는 자리가 틀리면(포트, CORS, 응답 모양) 화면은 지금은 안 잡힌다를
 * 조용히 띄운다. 사람이 볼 때까지 아무도 모른다.
 *
 * 봇이 안 떠 있으면 **실패가 아니라 건너뜀**이다(전제가 없는 것과 고장은 다르다).
 *   봇 띄우기: cd packages/companion && COMPANION_BRAIN=echo COMPANION_DESKTOP=0 npm run face
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bot = process.env.COMPANION_BASE ?? 'http://127.0.0.1:4620';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

try {
  const res = await fetch(`${bot}/ears`, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.log(`[smoke-companion] 건너뜀. 봇이 ${bot} 에 안 떠 있다 (${e.message})`);
  process.exit(2);
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
await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', undefined, {
  timeout: 15000,
});
// 도구는 부를 때 비로소 받아진다. 받아진 뒤 다시 불러야 열린다.
await page.evaluate(() => Toolbox.switchPage('companion'));
await page.waitForFunction(
  () => {
    if (document.getElementById('cmpDot')) return true;
    Toolbox.switchPage('companion');
    return false;
  }, undefined,
  { timeout: 20000, polling: 500 }
);

// ① 붙었나. 초록불 + 말 걸기 칸이 열려야 한다.
//    안 켜지면 **화면이 스스로 적어 둔 이유**를 그대로 보여 준다. 시간 초과만 남으면
//    붙는 자리가 틀린 건지(포트, CORS) 봇이 죽은 건지 못 가른다. 실제로 한 번 그랬다.
try {
  await page.waitForFunction(() => document.getElementById('cmpDot')?.classList.contains('on') === true, undefined, {
    timeout: 15000,
  });
} catch {
  const screenSaid = await page.evaluate(() => ({
    upperLine: document.getElementById('cmpText')?.textContent ?? '',
    lowerLine: document.getElementById('cmpSub')?.textContent ?? '',
  }));
  await browser.close();
  server.close();
  console.error(`[smoke-companion] X  봇은 떠 있는데 위젯이 못 붙었다. 화면: "${screenSaid.upperLine}, ${screenSaid.lowerLine}"`);
  console.error(`[smoke-companion]    창에서 터진 것: ${errors.length === 0 ? '없음' : errors.join(' / ')}`);
  console.error('[smoke-companion]    의심 자리 = 붙는 주소(포트), 봇이 이 기계 창에 문을 여는가(CORS)');
  process.exit(1);
}
const state = await page.evaluate(() => ({
  beside: document.getElementById('cmpText')?.textContent ?? '',
  below: document.getElementById('cmpSub')?.textContent ?? '',
  cellOpen: document.getElementById('cmpInput')?.disabled === false,
}));

// ②-0 창, 몸, 목소리가 화면에 뜨나. 오늘 사고 셋이 전부 조용히 빠짐이었다.
// 칸은 상태를 읽어 온 뒤에 그려진다. 곧바로 읽으면 비어 있다(실제로 한 번 비었다).
await page
  .waitForFunction(() => document.querySelectorAll('#cmpBits .cmp-bit').length > 0, undefined, { timeout: 10000 })
  .catch(() => {});
const cell = await page.evaluate(() =>
  [...document.querySelectorAll('#cmpBits .cmp-bit')].map((el) => el.textContent ?? ''),
);

// ② 말이 실제로 건너가나. 화면에서 치고, 봇의 기록에 그 말이 남는지 본다.
//    화면만 보면 보낸 척을 못 가른다.
const output = `스모크 ${Date.now()}`;
await page.fill('#cmpInput', output);
await page.click('#cmpSend');
await page.waitForFunction((phrase) => (document.getElementById('cmpLog')?.textContent ?? '').includes(phrase), output, {
  timeout: 15000,
});
const log2 = await (await fetch(`${bot}/history`, { signal: AbortSignal.timeout(4000) })).json();
const botHeard = log2.some((e) => e.text === output);

/* **끝나고 자국을 지운다.**
 *
 * 여태 검사가 건넨 스모크 1786... 이 사람의 말로 그대로 쌓였다. 졸이고 나니 아는 것이
 * 통째로 검사 찌꺼기가 됐다(실측 네 줄 전부: 반복적인 장난스러운 상호작용을 즐김
 * 지속적으로 장난을 거는 경향). **얘가 사람을 잘못 알게 되는 것보다 나쁜 건 없다.** */
const cleared = await fetch(`${bot}/known/forget?what=${encodeURIComponent(output)}&deep=1`, { method: 'POST' })
  .then((r) => r.json())
  .catch(() => null);
const remainingLog = await (await fetch(`${bot}/history`, { signal: AbortSignal.timeout(4000) })).json();
const wasCleared = remainingLog.some((e) => e.text === output) === false;

await browser.close();
server.close();

const mask = [];
if (state.cellOpen === false) mask.push('붙었다면서 말 걸기 칸이 잠겨 있다');
if (botHeard === false) mask.push('화면엔 떴는데 봇 기록엔 그 말이 없다');
if (wasCleared === false) mask.push('검사 자국이 사람의 기억에 남았다. 그게 졸여져 사람의 상이 된다');
if (errors.length > 0) mask.push(`창에서 터진 게 있다: ${errors.join(' / ')}`);
// beside 있다만 보고 끝내면, 몸이 큐브로 물러서거나 목소리가 빠진 걸 화면이 여전히 못 잡는다.
if (cell.length === 0) mask.push('창, 몸, 목소리 칸이 하나도 안 떴다');
for (const expected of ['창', '몸', '목소리']) {
  if (cell.some((c) => c.startsWith(expected)) === false) mask.push(`${expected} 칸이 없다`);
}

console.log(`[smoke-companion] ${state.beside}, ${state.below}`);
console.log(
  `[smoke-companion] 말 걸기 → 화면 O, 봇 기록 ${botHeard ? 'O' : 'X'}, 자국 지움 ${wasCleared ? 'O' : 'X'}` +
    (cleared ? ` (대화 ${cleared.conversation}줄)` : ''),
);
console.log(`[smoke-companion] 상태 칸: ${cell.join(' | ') || '(없음)'}`);
if (mask.length > 0) {
  console.error(`[smoke-companion] X  ${mask.join(' | ')}`);
  process.exit(1);
}
console.log('[smoke-companion] OK. 위젯이 봇에 붙어 말을 건넸다');
