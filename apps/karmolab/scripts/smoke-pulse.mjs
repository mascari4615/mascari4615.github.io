/**
 * 박동이 **진짜로 갈리는지** 본다 (TASK-KL-207)
 *
 * 왜 이렇게 보나: 카드가 그려졌는지만 보면 **멈춰 있는 방송국**도 초록으로 지나간다.
 * 이 도구의 전부는 「시각이 지나면 내용이 갈린다」이므로, 갈리는 순간을 봐야 한다.
 * 10분을 기다릴 수는 없으니 **브라우저 시계를 앞으로 돌린다**(playwright clock).
 *
 * 그리고 이 도구에만 있는 주장을 하나 더 검사한다 —
 *   「앞으로 올 박동」에 적힌 것이 **정말로 그 시각에 나오는가**.
 * 미리보기와 실제가 어긋나면 이 도구의 설계(시각의 순수 함수)가 거짓이 된다.
 *
 * 사용: node scripts/smoke-pulse.mjs [--shot out.png]   (npm run test:pulse)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* 묶음이 없으면 「제품 고장」이 아니라 「못 돌린다」다 — 검사가 그걸 말할 줄 알아야 한다. */
if (!fs.existsSync(path.join(root, 'js/widgets/pulse/pulse.js'))) {
  console.log('[smoke-pulse] 못 돌림 — js/widgets/pulse/pulse.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/karmolab/' || u === '/karmolab') u = '/apps/karmolab/index.html';
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const NOISE = /CORS|ERR_FAILED|net::|Failed to load resource|yawnbot\.mascari4615\.com/;
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });

/* 10분 경계에서 딱 떨어지지 않는 시각으로 시작한다 — 경계에 걸쳐 두면
   「돌리기 전부터 이미 갈려 있었다」와 구분이 안 된다. */
await page.clock.install({ time: new Date('2026-08-09T05:03:17+09:00') });

const problems = [];
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.pl-card', { timeout: 20000 });
await page.clock.runFor(1200);

const read = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.pl-card')].map((el) => ({
    name: el.querySelector('.pl-name').textContent.trim(),
    /* 이름줄이 한 줄인지 — 셸의 단추 스타일이 flex row 를 걸면 이름이 세로로 쪼개진다.
       그래도 글자는 다 있어서 텍스트 검사로는 절대 안 잡힌다. 높이로만 잡힌다. */
    nameH: el.querySelector('.pl-name').getBoundingClientRect().height,
    body: el.querySelector('.pl-body').textContent,
    meter: parseFloat(el.querySelector('.pl-meter i').style.width) || 0,
    left: el.querySelector('.pl-left').textContent,
    beating: el.classList.contains('beating')
  }));
  const col = (idx) => [...document.querySelectorAll('.pl-col')][idx];
  const rows = (idx) => [...(col(idx)?.querySelectorAll('.pl-row') || [])].map((r) => r.querySelector('span').textContent);
  return { cards, past: rows(0), soon: rows(1), clock: document.querySelector('#plNow').textContent };
});

const before = await read();

if (before.cards.length !== 7) problems.push(`방송 7개여야 하는데 ${before.cards.length}개`);
for (const c of before.cards) {
  if (!c.body.trim()) problems.push(`${c.name}: 몸통이 비었다`);
  if (!/다음까지/.test(c.left)) problems.push(`${c.name}: 남은 시간이 없다`);
  if (c.nameH > 30) problems.push(`${c.name}: 이름줄이 ${Math.round(c.nameH)}px — 세로로 쪼개졌다`);
}
if (before.past.length !== 6) problems.push(`지나간 박동 6줄이어야 하는데 ${before.past.length}줄`);
if (before.soon.length !== 3) problems.push(`앞으로 올 박동 3줄이어야 하는데 ${before.soon.length}줄`);
if (!/^\d\d:\d\d:\d\d KST$/.test(before.clock)) problems.push(`시계 모양 이상: ${before.clock}`);

/* 첫 그림에서 번쩍이면 안 된다 — 「갈렸다」 신호가 값을 잃는다. */
if (before.cards.some((c) => c.beating)) problems.push('아직 안 갈렸는데 번쩍였다');

const shotIdx = process.argv.indexOf('--shot');
if (shotIdx > 0 && process.argv[shotIdx + 1]) await page.screenshot({ path: process.argv[shotIdx + 1], fullPage: true });

/* ── 시계를 10분 앞으로 ─────────────────────────────────────── */
await page.clock.runFor(10 * 60 * 1000);
const after = await read();

const letters0 = before.cards[0];
const letters1 = after.cards[0];

if (letters1.body === letters0.body) problems.push(`10분이 지났는데 세 글자가 그대로다 (${letters0.body})`);
if (!letters1.beating) problems.push('갈렸는데 카드가 안 번쩍였다');

/* 이 도구의 유일한 주장 — 예고한 것이 그대로 나온다. */
const predicted = before.soon[0];
if (predicted !== letters1.body.split('\n')[0]) {
  problems.push(`미리보기가 틀렸다 — 예고 "${predicted}" · 실제 "${letters1.body.split('\n')[0]}"`);
}
/* 방금 지나간 것은 되감기 맨 위에 있어야 한다. */
if (after.past[0] !== letters0.body.split('\n')[0]) {
  problems.push(`되감기가 틀렸다 — 직전 "${letters0.body.split('\n')[0]}" · 첫 줄 "${after.past[0]}"`);
}
/* 눈금(1분)은 10분 사이 반드시 여러 번 갈렸다 — 안 갈렸으면 타이머가 죽은 것이다. */
const gauge = after.cards.find((c) => /눈금/.test(c.name));
if (gauge && gauge.body === before.cards.find((c) => /눈금/.test(c.name)).body) {
  problems.push('눈금이 10분 동안 한 번도 안 갈렸다 (타이머 사망)');
}

/* 다른 도구에 갔다 돌아와도 멀쩡한지 — 여기서 카드가 늘거나 몸통이 멎으면
   뒷정리(onDispose)를 안 맡긴 것이다. */
await page.goto(BASE + '/apps/karmolab/index.html#conch', { waitUntil: 'load', timeout: 30000 });
await page.clock.runFor(500);
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.pl-card', { timeout: 20000 });
await page.clock.runFor(1200);
const back = await read();
if (back.cards.length !== 7) problems.push(`돌아왔더니 카드가 ${back.cards.length}개 (7개여야 한다)`);
if (back.cards.some((c) => !c.body.trim())) problems.push('돌아왔더니 몸통이 빈 카드가 있다');

await browser.close();
server.close();

console.log(`[smoke-pulse] 방송 ${before.cards.length}개 · 시계 ${before.clock} → ${after.clock}`);
console.log(`[smoke-pulse] 세 글자 ${letters0.body} → ${letters1.body} (예고와 일치)`);
for (const c of after.cards) console.log(`  ${c.name.replace(/\s+/g, ' ')} :: ${c.body.split('\n')[0]}`);

if (errors.length) problems.push(...errors.map((e) => '오류: ' + e));
if (problems.length) {
  console.error('[smoke-pulse] 실패\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('[smoke-pulse] OK');
